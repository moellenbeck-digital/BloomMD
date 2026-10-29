import type { NativeDialogMethod, NativeDialogResultMessage, NativeDialogResults, NativeDialogStarted } from "../shared/rpc-types";

type StartDialog = (method: NativeDialogMethod, params: { dialogId: string } & Record<string, unknown>) => Promise<NativeDialogStarted>;

interface PendingDialog {
  method: NativeDialogMethod;
  resolve: (result: NativeDialogResults[NativeDialogMethod]) => void;
  reject: (error: Error) => void;
}

/**
 * Runs native dialogs (folder, resource file, import) without the RPC request timeout.
 *
 * `start` is an ordinary RPC request that only asks Bun to open the dialog and answers at once, so
 * it keeps the normal timeout. The person's choice arrives later through `handleResult`, however
 * long the dialog stayed open.
 */
export function createNativeDialogClient(start: StartDialog) {
  const pending = new Map<string, PendingDialog>();
  let counter = 0;

  function open<M extends NativeDialogMethod>(method: M, params: Record<string, unknown> = {}): Promise<NativeDialogResults[M]> {
    const dialogId = `${method}-${Date.now().toString(36)}-${++counter}`;
    return new Promise<NativeDialogResults[M]>((resolve, reject) => {
      // Registered before the request goes out: the result message may overtake the acknowledgement.
      pending.set(dialogId, { method, resolve: resolve as PendingDialog["resolve"], reject });
      start(method, { ...params, dialogId }).catch((error: unknown) => {
        pending.delete(dialogId);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  function handleResult(message: NativeDialogResultMessage) {
    const entry = pending.get(message.dialogId);
    if (!entry) return;
    pending.delete(message.dialogId);
    if (message.error !== undefined) entry.reject(new Error(message.error));
    else entry.resolve(message.result);
  }

  return { open, handleResult, pendingCount: () => pending.size };
}
