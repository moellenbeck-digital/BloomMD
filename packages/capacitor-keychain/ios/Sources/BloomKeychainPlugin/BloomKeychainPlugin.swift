import Foundation
import Capacitor
import Security

/// Keeps small secrets (the app sign-in token) in the iOS Keychain. Items are readable after the
/// first unlock since boot and never leave this device: no iCloud Keychain, not in backups that
/// restore onto another device.
@objc(BloomKeychainPlugin)
public class BloomKeychainPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BloomKeychainPlugin"
    public let jsName = "BloomKeychain"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
    ]

    private static let maxValueBytes = 16 * 1024
    private static let installedFlag = "bloommd.keychain.installed"
    private let keyPattern = try! NSRegularExpression(pattern: "^[A-Za-z0-9._-]{1,64}$")

    private var service: String {
        "\(Bundle.main.bundleIdentifier ?? "app.bloommd.mobile").keychain"
    }

    override public func load() {
        // Keychain items outlive an uninstall. A fresh install must not silently sign in with a
        // token from an earlier installation, so the first launch starts with an empty keychain.
        let defaults = UserDefaults.standard
        if !defaults.bool(forKey: Self.installedFlag) {
            let status = SecItemDelete([
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: service,
            ] as CFDictionary)
            if status != errSecSuccess && status != errSecItemNotFound {
                CAPLog.print("BloomKeychain: clearing items of an earlier installation failed (\(status))")
            }
            defaults.set(true, forKey: Self.installedFlag)
        }
    }

    private func validKey(_ call: CAPPluginCall) -> String? {
        guard let key = call.getString("key"),
              keyPattern.firstMatch(in: key, range: NSRange(key.startIndex..., in: key)) != nil else {
            call.reject("Invalid key.", "INVALID_KEY")
            return nil
        }
        return key
    }

    private func baseQuery(_ key: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let key = validKey(call) else { return }
        var query = baseQuery(key)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        switch status {
        case errSecSuccess:
            guard let data = result as? Data, let value = String(data: data, encoding: .utf8) else {
                call.reject("The stored value could not be read.", "READ_FAILED")
                return
            }
            call.resolve(["value": value])
        case errSecItemNotFound:
            call.resolve(["value": NSNull()])
        case errSecInteractionNotAllowed:
            // Before the first unlock after a restart the keychain is not readable yet.
            call.reject("The keychain is locked.", "LOCKED")
        default:
            call.reject("The keychain could not be read (\(status)).", "READ_FAILED")
        }
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let key = validKey(call) else { return }
        guard let value = call.getString("value"), let data = value.data(using: .utf8), data.count <= Self.maxValueBytes else {
            call.reject("Invalid value.", "INVALID_VALUE")
            return
        }
        let attributes: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        var status = SecItemUpdate(baseQuery(key) as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            var item = baseQuery(key)
            item.merge(attributes) { _, new in new }
            status = SecItemAdd(item as CFDictionary, nil)
        }
        if status == errSecSuccess {
            call.resolve()
        } else {
            call.reject("The keychain could not be written (\(status)).", "WRITE_FAILED")
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let key = validKey(call) else { return }
        let status = SecItemDelete(baseQuery(key) as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound {
            call.resolve()
        } else {
            call.reject("The keychain item could not be removed (\(status)).", "REMOVE_FAILED")
        }
    }
}
