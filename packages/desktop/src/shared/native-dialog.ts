/**
 * Electrobun gives every outgoing RPC request one global `maxRequestTime` and has no per-request
 * override. A native file dialog waits for a person, so it cannot run as a request that must answer
 * within that time. Dialog requests therefore only acknowledge that the dialog was started (normal
 * timeout); the outcome comes back later as the `nativeDialogResult` message.
 */

/** Timeout of every ordinary RPC request, on the webview side. */
export const RPC_MAX_REQUEST_TIME_MS = 60_000;
