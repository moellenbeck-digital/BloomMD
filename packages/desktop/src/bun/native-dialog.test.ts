import { describe, expect, test } from "bun:test";
import type { NativeDialogResultMessage } from "../shared/rpc-types";
import { startNativeDialog } from "./native-dialog";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("startNativeDialog", () => {
  test("acknowledges at once while the dialog is still open, then reports the choice", async () => {
    const sent: NativeDialogResultMessage[] = [];
    let choose!: (value: { path: string | null }) => void;
    const dialog = new Promise<{ path: string | null }>((resolve) => { choose = resolve; });

    const answer = startNativeDialog("d1", "chooseDirectory", () => dialog, (message) => sent.push(message));

    expect(answer).toEqual({ started: true });
    await tick();
    expect(sent).toEqual([]);
    choose({ path: "/Users/me/Notes" });
    await tick();
    expect(sent).toEqual([{ dialogId: "d1", method: "chooseDirectory", result: { path: "/Users/me/Notes" } }]);
  });

  test("passes a canceled dialog on as an empty choice without an error", async () => {
    const sent: NativeDialogResultMessage[] = [];
    startNativeDialog("d2", "chooseDirectory", async () => ({ path: null }), (message) => sent.push(message));
    await tick();
    expect(sent).toEqual([{ dialogId: "d2", method: "chooseDirectory", result: { path: null } }]);
  });

  test("forwards an error result and a thrown error", async () => {
    const sent: NativeDialogResultMessage[] = [];
    startNativeDialog("d3", "chooseDirectory", async () => ({ path: null, error: "Selected path is not a directory." }), (message) => sent.push(message));
    startNativeDialog("d4", "importFile", async () => { throw new Error("boom"); }, (message) => sent.push(message));
    await tick();
    expect(sent).toContainEqual({ dialogId: "d3", method: "chooseDirectory", result: { path: null, error: "Selected path is not a directory." } });
    expect(sent).toContainEqual({ dialogId: "d4", method: "importFile", error: "boom" });
  });
});
