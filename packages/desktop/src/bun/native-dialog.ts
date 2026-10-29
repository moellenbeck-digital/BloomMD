import type { NativeDialogMethod, NativeDialogResultMessage, NativeDialogResults, NativeDialogStarted } from "../shared/rpc-types";

/**
 * Starts a native dialog without holding the RPC request open. The request answers right away; the
 * outcome (or the error) is reported with `send` once the person has decided, however long that takes.
 * `run` reports errors itself as part of its result; a throw is forwarded as an `error` message.
 */
export function startNativeDialog<M extends NativeDialogMethod>(
  dialogId: string,
  method: M,
  run: () => Promise<NativeDialogResults[M]>,
  send: (message: NativeDialogResultMessage) => void,
): NativeDialogStarted {
  void run().then(
    (result) => send({ dialogId, method, result }),
    (error: unknown) => send({ dialogId, method, error: error instanceof Error ? error.message : String(error) }),
  );
  return { started: true };
}
