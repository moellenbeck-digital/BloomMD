import { registerPlugin } from "@capacitor/core";

/**
 * Small secrets on the device: iOS Keychain (this device only, readable after the first unlock)
 * and on Android values encrypted with an AES-GCM key held in the Android Keystore.
 * Keys: 1–64 characters `A-Z a-z 0-9 . _ -`; values up to 16 KiB.
 */
export interface BloomKeychainPlugin {
  /** The stored value, or null when nothing is stored under the key. */
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  /** Removing a key that does not exist is not an error. */
  remove(options: { key: string }): Promise<void>;
}

export const BloomKeychain = registerPlugin<BloomKeychainPlugin>("BloomKeychain", {
  web: () => import("./web").then((module) => new module.BloomKeychainWeb()),
});
