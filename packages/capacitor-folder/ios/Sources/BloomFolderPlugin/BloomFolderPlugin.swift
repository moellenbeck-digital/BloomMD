import Foundation
import Capacitor
import UIKit
import UniformTypeIdentifiers

/// Opens a folder the user picks in the Files app (for example an Obsidian vault in iCloud Drive)
/// and reads and writes its files in place. Access survives app restarts through a
/// security-scoped bookmark; every read and write is coordinated with iCloud and other apps.
@objc(BloomFolderPlugin)
public class BloomFolderPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "BloomFolderPlugin"
    public let jsName = "BloomFolder"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pick", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "current", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "forget", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "list", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "useTestFolder", returnType: CAPPluginReturnPromise),
    ]

    private let bookmarkKey = "bloommd.folder.bookmark"
    /// Most files listed in one go; more are reported as `truncated`.
    private let listLimit = 5000
    private var pendingPick: CAPPluginCall?
    /// Resolved folder; only touched on `stateQueue`, since calls run on concurrent queues.
    private var cachedRoot: URL?
    private let stateQueue = DispatchQueue(label: "app.bloommd.folder.state")

    override public func load() {
        // The folder may have been moved, renamed or synced while the app was in the background:
        // resolve the bookmark again instead of trusting the cached URL forever.
        NotificationCenter.default.addObserver(self, selector: #selector(appDidBecomeActive), name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    @objc private func appDidBecomeActive() {
        stateQueue.sync { cachedRoot = nil }
    }

    // MARK: Folder

    @objc func pick(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.folder])
            picker.delegate = self
            picker.allowsMultipleSelection = false
            self.pendingPick = call
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let call = pendingPick, let url = urls.first else { return }
        pendingPick = nil
        do {
            call.resolve(try adopt(url))
        } catch {
            call.reject("The folder could not be opened: \(error.localizedDescription)")
        }
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        pendingPick?.resolve(["cancelled": true])
        pendingPick = nil
    }

    private func adopt(_ url: URL) throws -> [String: Any] {
        let started = url.startAccessingSecurityScopedResource()
        defer { if started { url.stopAccessingSecurityScopedResource() } }
        let bookmark = try url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil)
        stateQueue.sync {
            UserDefaults.standard.set(bookmark, forKey: bookmarkKey)
            cachedRoot = nil
        }
        return ["name": url.lastPathComponent]
    }

    /// The chosen folder, resolved from the stored bookmark (refreshed when it went stale).
    /// `fresh` skips the cached URL and resolves the bookmark again.
    private func folder(fresh: Bool = false) throws -> URL {
        try stateQueue.sync {
            if !fresh, let cachedRoot { return cachedRoot }
            cachedRoot = nil
            guard let data = UserDefaults.standard.data(forKey: bookmarkKey) else {
                throw FolderError.noFolder
            }
            var stale = false
            let url = try URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale)
            if stale {
                let started = url.startAccessingSecurityScopedResource()
                defer { if started { url.stopAccessingSecurityScopedResource() } }
                if let refreshed = try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) {
                    UserDefaults.standard.set(refreshed, forKey: bookmarkKey)
                }
            }
            cachedRoot = url
            return url
        }
    }

    private func isDirectory(_ url: URL) -> Bool {
        var directory: ObjCBool = false
        return FileManager.default.fileExists(atPath: url.path, isDirectory: &directory) && directory.boolValue
    }

    /// Runs `body` with access to the folder. A folder that disappeared (moved, renamed, deleted
    /// elsewhere) is looked up again through its bookmark once, and never created anew.
    private func withFolder<T>(_ body: (URL) throws -> T) throws -> T {
        var url = try folder()
        var started = url.startAccessingSecurityScopedResource()
        if !isDirectory(url) {
            if started { url.stopAccessingSecurityScopedResource() }
            url = try folder(fresh: true)
            started = url.startAccessingSecurityScopedResource()
            guard isDirectory(url) else {
                if started { url.stopAccessingSecurityScopedResource() }
                stateQueue.sync { cachedRoot = nil }
                throw FolderError.folderMissing
            }
        }
        defer { if started { url.stopAccessingSecurityScopedResource() } }
        return try body(url)
    }

    @objc func current(_ call: CAPPluginCall) {
        guard let url = try? folder() else {
            call.resolve(["name": NSNull()])
            return
        }
        call.resolve(["name": url.lastPathComponent])
    }

    @objc func forget(_ call: CAPPluginCall) {
        stateQueue.sync {
            UserDefaults.standard.removeObject(forKey: bookmarkKey)
            cachedRoot = nil
        }
        call.resolve()
    }

    /// Debug builds only: use a folder by absolute path, so simulator tests can run without the
    /// Files picker.
    @objc func useTestFolder(_ call: CAPPluginCall) {
        #if DEBUG
        guard let path = call.getString("path") else { return call.reject("path is required") }
        do {
            try FileManager.default.createDirectory(atPath: path, withIntermediateDirectories: true)
            call.resolve(try adopt(URL(fileURLWithPath: path, isDirectory: true)))
        } catch {
            call.reject(error.localizedDescription)
        }
        #else
        call.reject("Only available in debug builds.")
        #endif
    }

    // MARK: Files

    /// Relative path inside the folder; refuses anything that would leave it, also through
    /// symbolic links inside the folder that point elsewhere.
    private func target(_ root: URL, _ relative: String?) throws -> URL {
        guard let relative, !relative.isEmpty, !relative.hasPrefix("/") else { throw FolderError.badPath }
        let parts = relative.split(separator: "/", omittingEmptySubsequences: true)
        if parts.contains(where: { $0 == ".." || $0 == "." }) { throw FolderError.badPath }
        let url = parts.reduce(root) { $0.appendingPathComponent(String($1)) }
        guard url.standardizedFileURL.path.hasPrefix(root.standardizedFileURL.path + "/") else { throw FolderError.badPath }
        let base = root.resolvingSymlinksInPath().standardizedFileURL.path
        let inside = { (path: String) in path == base || path.hasPrefix(base + "/") }
        guard inside(url.deletingLastPathComponent().resolvingSymlinksInPath().standardizedFileURL.path) else { throw FolderError.badPath }
        if (try? url.resourceValues(forKeys: [.isSymbolicLinkKey]))?.isSymbolicLink == true,
           !inside(url.resolvingSymlinksInPath().standardizedFileURL.path) {
            throw FolderError.badPath
        }
        return url
    }

    /// iCloud keeps a file that is not downloaded yet as a hidden placeholder `.Name.ext.icloud`.
    private func placeholder(of url: URL) -> URL {
        url.deletingLastPathComponent().appendingPathComponent(".\(url.lastPathComponent).icloud")
    }

    /// The real file name behind a placeholder `.Name.ext.icloud`, or nil for other files.
    private func placeholderName(_ name: String) -> String? {
        guard name.hasPrefix("."), name.hasSuffix(".icloud"), name.count > ".x.icloud".count else { return nil }
        return String(name.dropFirst().dropLast(".icloud".count))
    }

    /// True when the file, or its iCloud placeholder, exists.
    private func exists(_ url: URL) -> Bool {
        FileManager.default.fileExists(atPath: url.path) || FileManager.default.fileExists(atPath: placeholder(of: url).path)
    }

    /// iCloud found versions from different devices it could not merge; they must be resolved
    /// (in the Files app or Obsidian) before BloomMD reads or overwrites the file.
    private func hasUnresolvedConflicts(_ url: URL) -> Bool {
        !(NSFileVersion.unresolvedConflictVersionsOfItem(at: url) ?? []).isEmpty
    }

    @objc func list(_ call: CAPPluginCall) {
        let extensions = Set((call.getArray("extensions", String.self) ?? ["md", "markdown"]).map { $0.lowercased() })
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let (files, truncated): ([[String: Any]], Bool) = try self.withFolder { root in
                    let keys: [URLResourceKey] = [.isDirectoryKey, .contentModificationDateKey, .fileSizeKey, .ubiquitousItemDownloadingStatusKey]
                    // Hidden entries are filtered below: iCloud placeholders of not yet downloaded
                    // files are hidden too, and must still be listed so they are not overwritten.
                    guard let enumerator = FileManager.default.enumerator(at: root, includingPropertiesForKeys: keys, options: [.skipsPackageDescendants]) else { return ([], false) }
                    var result: [[String: Any]] = []
                    var truncated = false
                    let base = root.standardizedFileURL.path
                    for case let url as URL in enumerator {
                        let values = try? url.resourceValues(forKeys: Set(keys))
                        let name = url.lastPathComponent
                        if values?.isDirectory == true {
                            if name.hasPrefix(".") { enumerator.skipDescendants() }
                            continue
                        }
                        var file = url
                        var local: Bool
                        if name.hasPrefix(".") {
                            guard let real = self.placeholderName(name) else { continue }
                            file = url.deletingLastPathComponent().appendingPathComponent(real)
                            local = false
                        } else {
                            let status = values?.ubiquitousItemDownloadingStatus
                            local = status == nil || status == .current
                        }
                        guard extensions.contains(file.pathExtension.lowercased()) else { continue }
                        // Files iCloud keeps only in the cloud are fetched in the background.
                        if !local { try? FileManager.default.startDownloadingUbiquitousItem(at: file) }
                        if result.count >= self.listLimit {
                            truncated = true
                            break
                        }
                        var relative = String(file.standardizedFileURL.path.dropFirst(base.count))
                        if relative.hasPrefix("/") { relative.removeFirst() }
                        result.append([
                            "path": relative,
                            "size": local ? (values?.fileSize ?? 0) : 0,
                            "modified": (values?.contentModificationDate?.timeIntervalSince1970 ?? 0) * 1000,
                            "local": local,
                        ])
                    }
                    return (result, truncated)
                }
                call.resolve(["files": files, "truncated": truncated])
            } catch {
                call.reject(self.message(error), (error as? FolderError)?.code)
            }
        }
    }

    @objc func read(_ call: CAPPluginCall) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let result: [String: Any] = try self.withFolder { root in
                    let url = try self.target(root, call.getString("path"))
                    if self.hasUnresolvedConflicts(url) { throw FolderError.unresolvedConflict }
                    var text: String?
                    var modified: Double = 0
                    var failure: Error?
                    var coordinationError: NSError?
                    // Coordinated reading waits for iCloud to download the file and for other
                    // writers (Obsidian, iCloud sync) to finish.
                    NSFileCoordinator(filePresenter: nil).coordinate(readingItemAt: url, options: [], error: &coordinationError) { readURL in
                        do {
                            text = try String(contentsOf: readURL, encoding: .utf8)
                            modified = ((try? readURL.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate?.timeIntervalSince1970 ?? 0) * 1000
                        } catch {
                            failure = error
                        }
                    }
                    if let error = coordinationError ?? failure { throw error }
                    return ["data": text ?? "", "modified": modified]
                }
                call.resolve(result)
            } catch {
                call.reject(self.message(error), (error as? FolderError)?.code)
            }
        }
    }

    @objc func write(_ call: CAPPluginCall) {
        guard let data = call.getString("data") else { return call.reject("data is required") }
        let expectedModified = call.getDouble("expectedModified")
        let exclusive = call.getBool("exclusive") ?? false
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let modified: Double = try self.withFolder { root in
                    let url = try self.target(root, call.getString("path"))
                    // Subfolders are created inside the open folder only; withFolder made sure it exists.
                    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
                    var failure: Error?
                    var coordinationError: NSError?
                    var written: Double = 0
                    NSFileCoordinator(filePresenter: nil).coordinate(writingItemAt: url, options: .forReplacing, error: &coordinationError) { writeURL in
                        do {
                            // Checked inside the coordinated write, so no other writer can slip in between.
                            if exclusive, self.exists(writeURL) { throw FolderError.exists }
                            if FileManager.default.fileExists(atPath: writeURL.path), self.hasUnresolvedConflicts(writeURL) {
                                throw FolderError.unresolvedConflict
                            }
                            if let expectedModified {
                                // Deleted (or not downloaded any more) elsewhere counts as changed elsewhere.
                                guard FileManager.default.fileExists(atPath: writeURL.path) else { throw FolderError.conflict }
                                if let current = (try? writeURL.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate,
                                   abs(current.timeIntervalSince1970 * 1000 - expectedModified) > 1 {
                                    throw FolderError.conflict
                                }
                            }
                            try data.write(to: writeURL, atomically: true, encoding: .utf8)
                            written = ((try? writeURL.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate?.timeIntervalSince1970 ?? 0) * 1000
                        } catch {
                            failure = error
                        }
                    }
                    if let error = coordinationError ?? failure { throw error }
                    return written
                }
                call.resolve(["modified": modified])
            } catch {
                call.reject(self.message(error), (error as? FolderError)?.code)
            }
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                try self.withFolder { root in
                    let url = try self.target(root, call.getString("path"))
                    var failure: Error?
                    var coordinationError: NSError?
                    NSFileCoordinator(filePresenter: nil).coordinate(writingItemAt: url, options: .forDeleting, error: &coordinationError) { deleteURL in
                        do { try FileManager.default.removeItem(at: deleteURL) } catch { failure = error }
                    }
                    if let error = coordinationError ?? failure { throw error }
                }
                call.resolve()
            } catch {
                call.reject(self.message(error), (error as? FolderError)?.code)
            }
        }
    }

    private func message(_ error: Error) -> String {
        (error as? FolderError)?.description ?? error.localizedDescription
    }
}

enum FolderError: Error, CustomStringConvertible {
    case noFolder, folderMissing, badPath, conflict, unresolvedConflict, exists

    var description: String {
        switch self {
        case .noFolder: return "No folder is open. Choose one first."
        case .folderMissing: return "The folder was moved or deleted. Open it again."
        case .badPath: return "The path is not inside the open folder."
        case .conflict: return "The file changed on another device. Reload it before saving."
        case .unresolvedConflict: return "iCloud holds conflicting versions of this file. Resolve them in the Files app or Obsidian first."
        case .exists: return "A file with this name already exists."
        }
    }

    var code: String {
        switch self {
        case .noFolder: return "NO_FOLDER"
        case .folderMissing: return "FOLDER_MISSING"
        case .badPath: return "BAD_PATH"
        case .conflict, .unresolvedConflict: return "CONFLICT"
        case .exists: return "EXISTS"
        }
    }
}
