import Foundation
import Capacitor
import UIKit
import UniformTypeIdentifiers

/// Opens a folder the user picks in the Files app (for example an Obsidian vault in iCloud Drive)
/// and reads and writes its files in place. Access survives app restarts through a
/// security-scoped bookmark; every read and write is coordinated with iCloud and other apps.
/// A single Markdown file the Files app hands over ("Open in BloomMD") is opened in place through
/// the security scope of its URL, never copied.
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
        CAPPluginMethod(name: "openFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "useTestFolder", returnType: CAPPluginReturnPromise),
    ]

    private let bookmarkKey = "bloommd.folder.bookmark"
    /// Most files listed in one go; more are reported as `truncated`.
    private let listLimit = 5000
    private var pendingPick: CAPPluginCall?
    /// Resolved folder; only touched on `stateQueue`, since calls run on concurrent queues.
    private var cachedRoot: URL?
    private let stateQueue = DispatchQueue(label: "app.bloommd.folder.state")
    /// File URLs the system handed to the app, newest last. Only the instance the system passed
    /// carries the security scope, so it is kept until `openFile` asks for it. Only touched on `stateQueue`.
    private var receivedFileURLs: [URL] = []
    /// The file opened with `openFile`; its access stays started until another file replaces it.
    /// Only touched on `stateQueue`.
    private var openedFile: (token: String, url: URL, started: Bool)?

    override public func load() {
        // The folder may have been moved, renamed or synced while the app was in the background:
        // resolve the bookmark again instead of trusting the cached URL forever.
        NotificationCenter.default.addObserver(self, selector: #selector(appDidBecomeActive), name: UIApplication.didBecomeActiveNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(appDidOpenURL(_:)), name: .capacitorOpenURL, object: nil)
    }

    @objc private func appDidOpenURL(_ notification: Notification) {
        guard let object = notification.object as? [String: Any], let url = object["url"] as? URL, url.isFileURL else { return }
        stateQueue.sync {
            receivedFileURLs.append(url)
            if receivedFileURLs.count > 8 { receivedFileURLs.removeFirst() }
        }
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
                    let (text, modified) = try self.coordinatedRead(url)
                    return ["data": text, "modified": modified]
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
                            try self.verifyUnchanged(writeURL, expectedModified: expectedModified)
                            try data.write(to: writeURL, atomically: true, encoding: .utf8)
                            written = self.modifiedMillis(writeURL) ?? 0
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

    /// Modification time in ms since epoch, read from the file system on every call. A URL caches the
    /// resource values it has read, so a URL that lives on (the opened file) would report the time from
    /// before a write, and the next save would compare against a stale time.
    private func modifiedMillis(_ url: URL) -> Double? {
        guard let date = (try? FileManager.default.attributesOfItem(atPath: url.path))?[.modificationDate] as? Date else { return nil }
        return date.timeIntervalSince1970 * 1000
    }

    /// Reads the file coordinated: waits for iCloud to download it and for other writers
    /// (Obsidian, iCloud sync) to finish.
    private func coordinatedRead(_ url: URL) throws -> (String, Double) {
        var text: String?
        var modified: Double = 0
        var failure: Error?
        var coordinationError: NSError?
        NSFileCoordinator(filePresenter: nil).coordinate(readingItemAt: url, options: [], error: &coordinationError) { readURL in
            do {
                text = try String(contentsOf: readURL, encoding: .utf8)
                modified = self.modifiedMillis(readURL) ?? 0
            } catch {
                failure = error
            }
        }
        if let error = coordinationError ?? failure { throw error }
        return (text ?? "", modified)
    }

    /// Refuses a write over a file with unresolved iCloud versions, or one that no longer matches
    /// the modification time the caller read. Call it inside the coordinated write.
    private func verifyUnchanged(_ url: URL, expectedModified: Double?) throws {
        if FileManager.default.fileExists(atPath: url.path), hasUnresolvedConflicts(url) {
            throw FolderError.unresolvedConflict
        }
        if let expectedModified {
            // Deleted (or not downloaded any more) elsewhere counts as changed elsewhere.
            guard FileManager.default.fileExists(atPath: url.path) else { throw FolderError.conflict }
            if let current = modifiedMillis(url), abs(current - expectedModified) > 1 {
                throw FolderError.conflict
            }
        }
    }

    // MARK: Single file ("Open in BloomMD")

    /// Path of `file` inside `root` ("/"-separated), or nil when the file lies elsewhere.
    private func relativePath(of file: URL, in root: URL) -> String? {
        let base = root.resolvingSymlinksInPath().standardizedFileURL.path
        let path = file.resolvingSymlinksInPath().standardizedFileURL.path
        guard path.hasPrefix(base + "/") else { return nil }
        return String(path.dropFirst(base.count + 1))
    }

    /// Opens a Markdown file the system passed to the app. The file stays where it is: access comes
    /// from the security scope of the URL the system handed over.
    @objc func openFile(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let parsed = URL(string: raw), parsed.isFileURL,
              ["md", "markdown"].contains(parsed.pathExtension.lowercased()) else {
            return call.reject(FolderError.badPath.description, FolderError.badPath.code)
        }
        DispatchQueue.global(qos: .userInitiated).async {
            // The URL instance the system passed carries the scope; a copy built from its text does not.
            var url = parsed
            self.stateQueue.sync {
                if let match = self.receivedFileURLs.last(where: { $0.absoluteString == parsed.absoluteString }) { url = match }
            }
            if let last = ApplicationDelegateProxy.shared.lastURL, last.absoluteString == url.absoluteString { url = last }
            let started = url.startAccessingSecurityScopedResource()
            let token = UUID().uuidString
            self.stateQueue.sync {
                if let previous = self.openedFile, previous.started { previous.url.stopAccessingSecurityScopedResource() }
                self.openedFile = (token, url, started)
            }
            var result: [String: Any] = ["token": token, "name": url.lastPathComponent, "folderPath": NSNull()]
            // A file inside the open folder is that folder's note: the app edits it through the folder.
            let opened = url
            let inFolder: String? = try? self.withFolder { root in self.relativePath(of: opened, in: root) }
            if let inFolder { result["folderPath"] = inFolder }
            call.resolve(result)
        }
    }

    private func openedURL(_ call: CAPPluginCall) throws -> URL {
        let token = call.getString("token")
        let url: URL? = stateQueue.sync {
            guard let current = self.openedFile, current.token == token else { return nil }
            return current.url
        }
        guard let url else { throw FolderError.noFile }
        return url
    }

    @objc func readFile(_ call: CAPPluginCall) {
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let url = try self.openedURL(call)
                if self.hasUnresolvedConflicts(url) { throw FolderError.unresolvedConflict }
                let (text, modified) = try self.coordinatedRead(url)
                call.resolve(["data": text, "modified": modified])
            } catch {
                call.reject(self.message(error), (error as? FolderError)?.code)
            }
        }
    }

    @objc func writeFile(_ call: CAPPluginCall) {
        guard let data = call.getString("data") else { return call.reject("data is required") }
        let expectedModified = call.getDouble("expectedModified")
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let url = try self.openedURL(call)
                var failure: Error?
                var coordinationError: NSError?
                var written: Double = 0
                NSFileCoordinator(filePresenter: nil).coordinate(writingItemAt: url, options: .forReplacing, error: &coordinationError) { writeURL in
                    do {
                        try self.verifyUnchanged(writeURL, expectedModified: expectedModified)
                        try self.replaceAtomically(writeURL, with: data)
                        written = self.modifiedMillis(writeURL) ?? 0
                    } catch {
                        failure = error
                    }
                }
                if let error = coordinationError ?? failure { throw error }
                call.resolve(["modified": written])
            } catch {
                call.reject(self.message(error), (error as? FolderError)?.code)
            }
        }
    }

    /// Replaces a file in one step. Only the file itself may be reachable, not its folder, so the
    /// new content is written in the system's replacement directory and swapped in; where that is
    /// not available the plain atomic write of Foundation is used.
    private func replaceAtomically(_ url: URL, with text: String) throws {
        if let directory = try? FileManager.default.url(for: .itemReplacementDirectory, in: .userDomainMask, appropriateFor: url, create: true) {
            defer { try? FileManager.default.removeItem(at: directory) }
            let temporary = directory.appendingPathComponent(url.lastPathComponent)
            try text.write(to: temporary, atomically: false, encoding: .utf8)
            _ = try FileManager.default.replaceItemAt(url, withItemAt: temporary)
        } else {
            try text.write(to: url, atomically: true, encoding: .utf8)
        }
    }

    private func message(_ error: Error) -> String {
        (error as? FolderError)?.description ?? error.localizedDescription
    }
}

enum FolderError: Error, CustomStringConvertible {
    case noFolder, folderMissing, badPath, conflict, unresolvedConflict, exists, noFile

    var description: String {
        switch self {
        case .noFolder: return "No folder is open. Choose one first."
        case .folderMissing: return "The folder was moved or deleted. Open it again."
        case .badPath: return "The path is not inside the open folder."
        case .conflict: return "The file changed on another device. Reload it before saving."
        case .unresolvedConflict: return "iCloud holds conflicting versions of this file. Resolve them in the Files app or Obsidian first."
        case .exists: return "A file with this name already exists."
        case .noFile: return "The file is no longer open. Open it again from the Files app."
        }
    }

    var code: String {
        switch self {
        case .noFolder: return "NO_FOLDER"
        case .folderMissing: return "FOLDER_MISSING"
        case .badPath: return "BAD_PATH"
        case .conflict, .unresolvedConflict: return "CONFLICT"
        case .exists: return "EXISTS"
        case .noFile: return "NO_FILE"
        }
    }
}
