/**
 * Differences between the iPad/iPhone app and the Android app. Everything else is shared.
 */
import { Capacitor } from "@capacitor/core";
import { Directory } from "@capacitor/filesystem";

export const IS_ANDROID = Capacitor.getPlatform() === "android";

/**
 * The app's own folder for maps, drawings and test files. On iOS that is the app's Documents
 * folder (visible in the Files app). On Android Directory.Documents is the shared storage of the
 * whole device, which needs storage permissions and loses access after a reinstall, so the app
 * keeps its notes in its private files there; vaults elsewhere are opened through the folder picker.
 */
export const APP_DIRECTORY: Directory = IS_ANDROID ? Directory.Data : Directory.Documents;

/** How conflict copies name this device; the interface texts themselves live in shell-text.ts. */
export const DEVICE = IS_ANDROID ? { conflictLabel: "Android-Konflikt" } : { conflictLabel: "iPad-Konflikt" };
