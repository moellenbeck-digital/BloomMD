/**
 * Simulator/emulator self-test, built only with VITE_BLOOMMD_SELFTEST=1 and triggered by the link
 * `bloommd://selftest`. It exercises the native folder plugin end to end (no Files picker needed)
 * and writes `selftest-result.json` into the app folder (Documents on iOS, the app's files on
 * Android) for the test runner to read.
 */
import { BloomFolder } from "@bloommd/capacitor-folder";
import { Encoding, Filesystem } from "@capacitor/filesystem";
import { CONFLICT_COPY_LABEL, NoteSaver } from "./note-saver";
import { APP_DIRECTORY, IS_ANDROID } from "./platform";
import { createFolderStore, StoreConflictError } from "./stores";

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

export async function runSelfTest(openNote: (path: string, node: string | null) => Promise<void>): Promise<void> {
  const checks: Check[] = [];
  const check = async (name: string, body: () => Promise<string | void>) => {
    try {
      const detail = await body();
      checks.push({ name, ok: true, ...(detail ? { detail } : {}) });
    } catch (error) {
      checks.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) });
    }
  };

  // Start from an empty vault: files of an earlier run (e.g. conflict copies) would change the listing.
  await Filesystem.rmdir({ directory: APP_DIRECTORY, path: "selftest-vault", recursive: true }).catch(() => undefined);
  const { uri } = await Filesystem.getUri({ directory: APP_DIRECTORY, path: "selftest-vault" });
  const root = decodeURIComponent(uri.replace(/^file:\/\//, ""));
  await BloomFolder.useTestFolder({ path: root });
  const store = createFolderStore(BloomFolder, "selftest-vault");
  const physik = "# Physik\n\nEinleitung.\n\n## Thermodynamik <!-- bloommd:id=thermo1 -->\n\nWärme.\n";

  await check("write notes into nested folders", async () => {
    await BloomFolder.write({ path: "Schule/Physik.md", data: physik });
    await BloomFolder.write({ path: "Arbeit/Teammeeting.md", data: "# Teammeeting\n" });
    await BloomFolder.write({ path: ".obsidian/workspace.md", data: "intern" });
  });

  await check("list notes with folders, skip hidden folders", async () => {
    const { entries } = await store.list();
    const paths = entries.map((entry) => entry.path).sort();
    if (paths.join(",") !== "Arbeit/Teammeeting.md,Schule/Physik.md") throw new Error(`listed ${paths.join(", ")}`);
    return paths.join(", ");
  });

  await check("opening a note does not rewrite it", async () => {
    const loaded = await store.read("Schule/Physik.md");
    if (await store.save(loaded, loaded.document)) throw new Error("saved without changes");
    const { data } = await BloomFolder.read({ path: "Schule/Physik.md" });
    if (data !== physik) throw new Error("file changed on open");
  });

  await check("an edit is written in place", async () => {
    const loaded = await store.read("Schule/Physik.md");
    const document = { ...loaded.document, nodes: new Map(loaded.document.nodes) };
    const node = document.nodes.get("thermo1")!;
    document.nodes.set("thermo1", { ...node, content: "Wärme und Arbeit." });
    await store.save(loaded, document);
    const { data } = await BloomFolder.read({ path: "Schule/Physik.md" });
    if (!data.includes("Wärme und Arbeit.")) throw new Error("edit missing in file");
  });

  await check("an edit from another device is not overwritten", async () => {
    const loaded = await store.read("Schule/Physik.md");
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await BloomFolder.write({ path: "Schule/Physik.md", data: `${physik}\nVom Mac.\n` });
    const document = { ...loaded.document, nodes: new Map(loaded.document.nodes) };
    document.nodes.set("thermo1", { ...document.nodes.get("thermo1")!, content: "Vom iPad." });
    try {
      await store.save(loaded, document);
    } catch (error) {
      if (error instanceof StoreConflictError) return "conflict detected";
      throw error;
    }
    throw new Error("stale save was accepted");
  });

  await check("an edit from another device is kept and the iPad's version saved as a conflict copy", async () => {
    const loaded = await store.read("Schule/Physik.md");
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await BloomFolder.write({ path: "Schule/Physik.md", data: `${physik}\nWieder vom Mac.\n` });
    let copy: string | null = null;
    const saver = new NoteSaver({ onConflict: (conflict) => { copy = conflict.copy; } }, 60_000);
    saver.open(store, loaded);
    const document = { ...loaded.document, nodes: new Map(loaded.document.nodes) };
    document.nodes.set("thermo1", { ...document.nodes.get("thermo1")!, content: "Konflikt vom iPad." });
    await saver.flush(document);
    if (copy !== `Schule/Physik (${CONFLICT_COPY_LABEL}).md`) throw new Error(`copy ${copy ?? "missing"}`);
    const kept = await BloomFolder.read({ path: copy });
    if (!kept.data.includes("Konflikt vom iPad.")) throw new Error("copy without the iPad's edit");
    const original = await BloomFolder.read({ path: "Schule/Physik.md" });
    if (!original.data.includes("Wieder vom Mac.") || original.data.includes("Konflikt vom iPad.")) throw new Error("note from the Mac overwritten");
    return copy;
  });

  await check("a note deleted elsewhere is a conflict, not silently recreated", async () => {
    await BloomFolder.write({ path: "Arbeit/Weg.md", data: "# Weg\n" });
    const loaded = await store.read("Arbeit/Weg.md");
    await BloomFolder.remove({ path: "Arbeit/Weg.md" });
    try {
      await BloomFolder.write({ path: "Arbeit/Weg.md", data: "# Weg\n\nNeu.\n", expectedModified: loaded.modified! });
    } catch (error) {
      if ((error as { code?: string }).code === "CONFLICT") return "CONFLICT";
      throw error;
    }
    throw new Error("deleted note was written again");
  });

  await check("exclusive create never replaces a file", async () => {
    try {
      await BloomFolder.write({ path: "Arbeit/Teammeeting.md", data: "# Überschrieben\n", exclusive: true });
    } catch (error) {
      if ((error as { code?: string }).code !== "EXISTS") throw error;
      const { data } = await BloomFolder.read({ path: "Arbeit/Teammeeting.md" });
      if (data !== "# Teammeeting\n") throw new Error("file changed");
      await BloomFolder.write({ path: "Arbeit/Neu.md", data: "# Neu\n", exclusive: true });
      await BloomFolder.remove({ path: "Arbeit/Neu.md" });
      return "EXISTS";
    }
    throw new Error("existing file replaced");
  });

  if (IS_ANDROID) await check("hidden files are neither listed nor blocking a note", async () => {
    // Android has no iCloud placeholders: dot files (e.g. sync tools' metadata) are simply skipped.
    await Filesystem.writeFile({ directory: APP_DIRECTORY, path: "selftest-vault/Schule/.Biologie.md", data: "hidden", encoding: Encoding.UTF8, recursive: true });
    const { files, truncated } = await BloomFolder.list({ extensions: ["md"] });
    if (files.some((file) => file.path.includes(".Biologie"))) throw new Error("hidden file listed");
    if (truncated) throw new Error("small folder reported as truncated");
    await BloomFolder.write({ path: "Schule/Biologie.md", data: "# Biologie\n", exclusive: true });
    await BloomFolder.remove({ path: "Schule/Biologie.md" });
    return "skipped .Biologie.md";
  });

  if (!IS_ANDROID) await check("notes iCloud has not downloaded yet are listed and not overwritten", async () => {
    // iCloud keeps such a note as the hidden placeholder `.Name.md.icloud`.
    await Filesystem.writeFile({ directory: APP_DIRECTORY, path: "selftest-vault/Schule/.Biologie.md.icloud", data: "placeholder", encoding: Encoding.UTF8, recursive: true });
    const { files, truncated } = await BloomFolder.list({ extensions: ["md"] });
    const placeholder = files.find((file) => file.path === "Schule/Biologie.md");
    if (!placeholder || placeholder.local) throw new Error(`listed ${files.map((file) => `${file.path}${file.local ? "" : " (cloud)"}`).join(", ")}`);
    if (truncated) throw new Error("small folder reported as truncated");
    try {
      await BloomFolder.write({ path: "Schule/Biologie.md", data: "# Biologie\n", exclusive: true });
    } catch (error) {
      if ((error as { code?: string }).code === "EXISTS") return "Schule/Biologie.md (cloud), EXISTS";
      throw error;
    }
    throw new Error("placeholder overwritten by a new note");
  });

  await check("paths outside the folder are refused", async () => {
    try {
      await BloomFolder.read({ path: "../../Library/Preferences/x.md" });
    } catch (error) {
      if (IS_ANDROID && (error as { code?: string }).code !== "BAD_PATH") throw error;
      return "refused";
    }
    throw new Error("read outside the folder");
  });

  await check("deep link opens the note at its node", async () => {
    await openNote("Schule/Physik.md", "thermo1");
  });

  await check("handwriting: draw with the pen, Done saves an SVG and embeds it in the node", async () => {
    const { useMindMapStore } = await import("@bloommd/ui");
    useMindMapStore.getState().setSelectedNodeId("thermo1");
    useMindMapStore.setState({ editorVisible: true });
    // Generous: the handwriting editor is a lazily loaded chunk, and CI emulators render in software.
    const waitFor = async <T,>(find: () => T | null | undefined, what: string, ms = 30_000): Promise<T> => {
      for (const started = Date.now(); Date.now() - started < ms; await new Promise((resolve) => setTimeout(resolve, 100))) {
        const found = find();
        if (found) return found;
      }
      throw new Error(`timed out waiting for ${what}`);
    };
    (await waitFor(() => document.querySelector<HTMLButtonElement>('[data-testid="node-handwriting-new"]'), "New drawing button")).click();
    const surface = await waitFor(() => document.querySelector<HTMLElement>(".bloommd-ink-surface"), "drawing surface");
    const box = surface.getBoundingClientRect();
    const pen = (type: string, x: number, y: number) => surface.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 7, pointerType: "pen", pressure: 0.6, isPrimary: true,
      clientX: box.left + x, clientY: box.top + y, buttons: type === "pointerup" ? 0 : 1,
    }));
    pen("pointerdown", 60, 80);
    for (let step = 1; step <= 20; step += 1) pen("pointermove", 60 + step * 8, 80 + Math.sin(step / 3) * 20);
    pen("pointerup", 220, 80);
    await waitFor(() => surface.querySelector("path[data-stroke-id]"), "a drawn stroke");
    (await waitFor(() => document.querySelector<HTMLButtonElement>(".bloommd-ink-editor button.bloommd-ink-done"), "Done button")).click();
    await waitFor(() => !document.querySelector(".bloommd-ink-surface") || null, "editor to close");
    // The vault has no attachment setting: the drawing goes to the vault root, named after the note.
    const { data } = await BloomFolder.read({ path: "Physik ink.svg" });
    if (!data.includes('data-bloommd-ink="1"') || !data.includes("data-stroke-id")) throw new Error("drawing file has no stroke");
    // Autosave writes the note with the embed after its quiet period.
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const note = await BloomFolder.read({ path: "Schule/Physik.md" });
    if (!note.data.includes("![[Physik ink.svg]]")) throw new Error("note does not embed the drawing");
    await waitFor(() => document.querySelector('[data-testid="node-handwriting"] svg'), "drawing thumbnail");
    return "Physik ink.svg saved, embedded in Thermodynamik, thumbnail shown";
  });

  await check("handwriting: a drawing changed on another device is not overwritten", async () => {
    const { folderInkAttachments } = await import("./ink-attachments");
    const attachments = folderInkAttachments(BloomFolder);
    const original = await attachments.read("Physik ink.svg", "Schule/Physik.md");
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await BloomFolder.write({ path: "Physik ink.svg", data: original.replace("</svg>", "<!-- Mac --></svg>") });
    const name = await attachments.write("Physik ink.svg", original.replace("</svg>", "<!-- iPad --></svg>"), "Schule/Physik.md");
    if (name === "Physik ink.svg") throw new Error("overwrote the drawing from the other device");
    const mac = await BloomFolder.read({ path: "Physik ink.svg" });
    const ipad = await BloomFolder.read({ path: name });
    if (!mac.data.includes("<!-- Mac -->") || !ipad.data.includes("<!-- iPad -->")) throw new Error("a version is missing");
    return `kept as ${name}`;
  });

  await check("keychain: set, get, overwrite and remove a secret", async () => {
    const { BloomKeychain } = await import("@bloommd/capacitor-keychain");
    const key = "bloommd.selftest";
    const secret = `bloom_pat_selftest_${crypto.randomUUID()}`;
    await BloomKeychain.remove({ key }).catch((error: unknown) => {
      // errSecMissingEntitlement: unsigned simulator builds (CODE_SIGNING_ALLOWED=NO) have no keychain.
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message.includes("-34018") ? `${message} – build the simulator app ad-hoc signed (CODE_SIGN_IDENTITY=-)` : message);
    });
    if ((await BloomKeychain.get({ key })).value !== null) throw new Error("value before set");
    await BloomKeychain.set({ key, value: secret });
    if ((await BloomKeychain.get({ key })).value !== secret) throw new Error("read back a different value");
    await BloomKeychain.set({ key, value: `${secret}-2` });
    if ((await BloomKeychain.get({ key })).value !== `${secret}-2`) throw new Error("overwrite failed");
    await BloomKeychain.remove({ key });
    if ((await BloomKeychain.get({ key })).value !== null) throw new Error("value still there after remove");
    await BloomKeychain.remove({ key });
    const rejected = await BloomKeychain.set({ key: "../invalid key", value: "x" }).then(() => false, () => true);
    if (!rejected) throw new Error("accepted an invalid key");
    // The secret never lands in WebView storage.
    if (JSON.stringify({ ...window.localStorage }).includes("bloom_pat_")) throw new Error("token found in localStorage");
    return "Keychain round trip ok";
  });

  await Filesystem.writeFile({
    directory: APP_DIRECTORY,
    path: "selftest-result.json",
    data: JSON.stringify({ at: new Date().toISOString(), passed: checks.every((entry) => entry.ok), checks }, null, 2),
    encoding: Encoding.UTF8,
  });
}
