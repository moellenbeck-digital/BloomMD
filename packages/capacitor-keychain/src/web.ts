import { WebPlugin } from "@capacitor/core";
import type { BloomKeychainPlugin } from "./index";

/**
 * Browser fallback for `vite dev`: kept in memory only. Secrets are never written to
 * localStorage or other WebView storage, so a page reload signs out.
 */
export class BloomKeychainWeb extends WebPlugin implements BloomKeychainPlugin {
  private readonly values = new Map<string, string>();

  async get(options: { key: string }) {
    return { value: this.values.get(options.key) ?? null };
  }

  async set(options: { key: string; value: string }) {
    this.values.set(options.key, options.value);
  }

  async remove(options: { key: string }) {
    this.values.delete(options.key);
  }
}
