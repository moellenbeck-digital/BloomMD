/**
 * Simulator/emulator self-test, built only with VITE_BLOOMMD_SELFTEST=1 and triggered by the link
 * `bloommd://selftest`. It exercises the native folder plugin end to end (no Files picker needed)
 * and writes `selftest-result.json` into the app folder (Documents on iOS, the app's files on
 * Android) for the test runner to read.
 */
import { BloomFolder } from "@bloommd/capacitor-folder";
import { parseFile } from "@bloommd/core/browser";
import { Encoding, Filesystem } from "@capacitor/filesystem";
import { parseAppLink } from "./app-links";
import { existingFolder, folderLevel } from "./folder-levels";
import { CONFLICT_COPY_LABEL, NoteSaver } from "./note-saver";
import { openFileUrl } from "./opened-file";
import { APP_DIRECTORY, IS_ANDROID } from "./platform";
import { createFolderStore, SkippedFolderError, StoreConflictError } from "./stores";

interface Check {
  name: string;
  ok: boolean;
  detail?: string;
}

export async function runSelfTest(
  openNote: (path: string, node: string | null) => Promise<void>,
  /** Hands a `file://` URL to the app like "Open in BloomMD" does; resolves with what the app shows afterwards. */
  openFile: (url: string) => Promise<{ path: string | null; store: string; folder: string }>,
): Promise<void> {
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

  await check("a nested vault is walked level by level, folders before notes", async () => {
    // "Uni/Physik.md" and the folder "Uni/Physik/" share a name; both must stay reachable.
    await BloomFolder.write({ path: "Uni/Notiz.md", data: "# Notiz\n" });
    await BloomFolder.write({ path: "Uni/Physik.md", data: "# Physik (Uni)\n" });
    await BloomFolder.write({ path: "Uni/Physik/Optik/Linsen.md", data: "# Linsen\n" });
    const { entries } = await store.list();
    const top = folderLevel(entries, "");
    if (top.folders.map((row) => row.name).join(",") !== "Arbeit,Schule,Uni" || top.notes.length !== 0) throw new Error(`top level ${JSON.stringify(top)}`);
    const uni = folderLevel(entries, "Uni");
    if (uni.folders.map((row) => `${row.name}:${row.notes}`).join(",") !== "Physik:1") throw new Error(`Uni folders ${JSON.stringify(uni.folders)}`);
    if (uni.notes.map((entry) => entry.path).join(",") !== "Uni/Notiz.md,Uni/Physik.md" || uni.parent !== "") throw new Error(`Uni notes ${JSON.stringify(uni.notes)}`);
    const optik = folderLevel(entries, "Uni/Physik/Optik");
    if (optik.notes.map((entry) => entry.path).join(",") !== "Uni/Physik/Optik/Linsen.md" || optik.parent !== "Uni/Physik") throw new Error(`Optik ${JSON.stringify(optik)}`);
    if (entries.some((entry) => entry.path.startsWith(".obsidian/"))) throw new Error("hidden folder listed");
    return "Uni > Physik > Optik";
  });

  await check("a new note lands in the folder shown, nothing leaks to the top", async () => {
    const path = store.pathFor("Neu.md", "Uni/Physik");
    if (path !== "Uni/Physik/Neu.md") throw new Error(`path ${path}`);
    const document = parseFile(path, "# Neu\n");
    await store.save({ document, baseline: "" }, document);
    const { data } = await BloomFolder.read({ path });
    if (!data.includes("# Neu")) throw new Error("note missing in the subfolder");
    if (await BloomFolder.read({ path: "Neu.md" }).then(() => true, () => false)) throw new Error("note also at the top");
    return path;
  });

  await check("the folder store refuses paths that leave the folder", async () => {
    for (const bad of ["../x.md", "Schule/../../x.md", "/etc/x.md"]) {
      if (await store.read(bad).then(() => true, (error: { code?: string }) => error.code !== "BAD_PATH")) throw new Error(`${bad} was not refused`);
    }
    if (await Promise.resolve().then(() => store.pathFor("x.md", "../..")).then(() => true, () => false)) throw new Error("pathFor accepted ..");
  });

  const code = (error: unknown) => (error as { code?: string } | null)?.code;
  const exists = (path: string) => Filesystem.stat({ directory: APP_DIRECTORY, path }).then(() => true, () => false);
  const inVault = (path: string) => `selftest-vault/${path}`;

  await check("a new folder is created empty and shows in the list and the levels, also while it holds no note", async () => {
    if ((await store.createFolder("Leer/Unter")) !== "Leer/Unter") throw new Error("createFolder returned another path");
    // The folder itself, never a placeholder file in it (Obsidian and git would show it).
    for (const folder of ["Leer", "Leer/Unter"]) {
      const { files } = await Filesystem.readdir({ directory: APP_DIRECTORY, path: inVault(folder) });
      const found = files.map((file) => `${file.name}${file.type === "directory" ? "/" : ""}`).sort().join(",");
      if (found !== (folder === "Leer" ? "Unter/" : "")) throw new Error(`${folder} holds ${found || "nothing"} instead of ${folder === "Leer" ? "Unter/" : "nothing"}`);
    }
    const { entries, folders } = await store.list();
    if (!folders.includes("Leer") || !folders.includes("Leer/Unter")) throw new Error(`folders ${folders.join(", ")}`);
    if (entries.some((entry) => entry.path.startsWith("Leer/"))) throw new Error("a note was listed in the empty folder");
    const top = folderLevel(entries, "", folders).folders.find((row) => row.name === "Leer");
    if (top?.notes !== 0) throw new Error(`top level ${JSON.stringify(top)}`);
    const leer = folderLevel(entries, "Leer", folders);
    if (leer.folders.map((row) => `${row.name}:${row.notes}`).join(",") !== "Unter:0" || leer.parent !== "") throw new Error(`Leer ${JSON.stringify(leer)}`);
    const unter = folderLevel(entries, "Leer/Unter", folders);
    if (unter.folders.length !== 0 || unter.notes.length !== 0 || unter.parent !== "Leer") throw new Error(`Leer/Unter ${JSON.stringify(unter)}`);
    if (existingFolder(entries, "Leer/Unter", folders) !== "Leer/Unter") throw new Error("the empty folder is not kept as the folder shown");
    // The same listing without the folder list loses it: the folder list is what makes it visible.
    if (existingFolder(entries, "Leer/Unter") !== "") throw new Error("the empty folder was derived from notes");
    return "Leer > Unter, 0 notes";
  });

  await check("creating a folder again is no error, a deeper path only adds the new level", async () => {
    if ((await store.createFolder("Leer/Unter")) !== "Leer/Unter") throw new Error("second call returned another path");
    await store.createFolder("Leer/Unter/Tief");
    const { folders } = await store.list();
    const leer = folders.filter((folder) => folder === "Leer" || folder.startsWith("Leer/")).join(",");
    if (leer !== "Leer,Leer/Unter,Leer/Unter/Tief") throw new Error(`folders ${leer}`);
    return leer;
  });

  await check("hidden folders are not created and not listed", async () => {
    for (const hidden of [".obsidian", ".trash/x", "Schule/.git", "node_modules"]) {
      const refused = await store.createFolder(hidden).then(() => false, (error) => error instanceof SkippedFolderError);
      if (!refused) throw new Error(`${hidden} was not refused with SkippedFolderError`);
    }
    if (await exists(inVault(".trash"))) throw new Error(".trash was created");
    if (await exists(inVault("node_modules"))) throw new Error("node_modules was created");
    if (await exists(inVault("Schule/.git"))) throw new Error("Schule/.git was created");
    // Folders that are there but hidden (made by other apps) never show up in the list.
    for (const hidden of [".hidden-by-app/Leer", "node_modules/pkg", ".obsidian/plugins/x"]) {
      await Filesystem.mkdir({ directory: APP_DIRECTORY, path: inVault(hidden), recursive: true });
    }
    const { folders } = await store.list();
    const leaked = folders.filter((folder) => folder.split("/").some((part) => part.startsWith(".") || part === "node_modules"));
    if (leaked.length > 0) throw new Error(`listed ${leaked.join(", ")}`);
    return "refused and hidden";
  });

  await check("a folder path that leaves the folder is refused and nothing is created outside it", async () => {
    for (const bad of ["../x", "Schule/../../x", "/x", "Schule/.."]) {
      if (await store.createFolder(bad).then(() => true, () => false)) throw new Error(`createFolder accepted ${bad}`);
    }
    // The plugin refuses them itself too, with the same code on both platforms.
    for (const bad of ["../x", "Schule/../../x", "/x"]) {
      const refused = await BloomFolder.mkdir({ path: bad }).then(() => "created", code);
      if (refused !== "BAD_PATH") throw new Error(`mkdir ${bad}: ${refused}`);
    }
    // The vault's parent is the app folder: nothing named x may appear there or in the vault.
    if (await exists("x") || await exists(inVault("x"))) throw new Error("a folder x was created");
    return "refused";
  });

  await check("a file with the name of a folder gives EXISTS, and no folder grows inside a file", async () => {
    await BloomFolder.write({ path: "Arbeit/Datei", data: "keine Notiz" });
    const outcome = await BloomFolder.mkdir({ path: "Arbeit/Datei" }).then(() => "created", code);
    if (outcome !== "EXISTS") throw new Error(`mkdir over a file: ${outcome}`);
    if ((await store.createFolder("Arbeit/Datei").then(() => "created", code)) !== "EXISTS") throw new Error("createFolder over a file was not EXISTS");
    if (await BloomFolder.mkdir({ path: "Arbeit/Datei/innen" }).then(() => true, () => false)) throw new Error("a folder was created inside a file");
    const { data } = await BloomFolder.read({ path: "Arbeit/Datei" });
    if (data !== "keine Notiz") throw new Error("the file changed");
    await BloomFolder.remove({ path: "Arbeit/Datei" });
    return "EXISTS";
  });

  // "Open in BloomMD" is an iOS feature: Android hands no file URLs to the app, so these checks run on iOS only.
  const external = "selftest-external/Extern.md";
  const externalText = "# Extern\n\nVon aussen.\n\n## Teil <!-- bloommd:id=teil1 -->\n\nText.\n";
  await Filesystem.rmdir({ directory: APP_DIRECTORY, path: "selftest-external", recursive: true }).catch(() => undefined);
  await Filesystem.writeFile({ directory: APP_DIRECTORY, path: external, data: externalText, encoding: Encoding.UTF8, recursive: true });
  const externalUrl = (await Filesystem.getUri({ directory: APP_DIRECTORY, path: external })).uri;
  const readExternal = async () => (await Filesystem.readFile({ directory: APP_DIRECTORY, path: external, encoding: Encoding.UTF8 })).data as string;

  if (!IS_ANDROID) await check("a file URL is recognised, a non-Markdown one is not", async () => {
    if (parseAppLink(externalUrl)?.kind !== "file") throw new Error(`not a file link: ${externalUrl}`);
    if (parseAppLink("file:///private/var/Bild.png") !== null) throw new Error("non-Markdown file accepted");
    if (await BloomFolder.openFile({ url: "file:///private/var/Bild.png" }).then(() => true, (error: { code?: string }) => error.code !== "BAD_PATH")) throw new Error("plugin opened a non-Markdown file");
  });

  if (!IS_ANDROID) await check("a file outside the folder is opened and saved in place, without a copy", async () => {
    const opened = await openFileUrl(BloomFolder, externalUrl, store);
    if (opened.store.kind !== "file" || opened.path !== "Extern.md") throw new Error(`opened as ${opened.store.kind} ${opened.path}`);
    const loaded = await opened.store.read(opened.path);
    if (await opened.store.save(loaded, loaded.document)) throw new Error("saved without changes");
    if ((await readExternal()) !== externalText) throw new Error("file changed on open");
    const document = { ...loaded.document, nodes: new Map(loaded.document.nodes) };
    document.nodes.set("teil1", { ...document.nodes.get("teil1")!, content: "Bearbeitet auf dem iPad." });
    const saved = await opened.store.save(loaded, document);
    if (!saved || !(await readExternal()).includes("Bearbeitet auf dem iPad.")) throw new Error("edit missing in the original file");
    if (await Filesystem.stat({ directory: APP_DIRECTORY, path: "Extern.md" }).then(() => true, () => false)) throw new Error("a copy appeared in the app folder");
    // The same rules as in a folder: an edit from another device is never overwritten.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await Filesystem.writeFile({ directory: APP_DIRECTORY, path: external, data: `${await readExternal()}\nVom Mac.\n`, encoding: Encoding.UTF8 });
    const again = { ...document, nodes: new Map(document.nodes) };
    again.nodes.set("teil1", { ...again.nodes.get("teil1")!, content: "Zweite Änderung." });
    try {
      await opened.store.save(saved, again);
    } catch (error) {
      if (!(error instanceof StoreConflictError)) throw error;
      const now = await readExternal();
      if (!now.includes("Vom Mac.") || now.includes("Zweite Änderung.")) throw new Error("file from the Mac overwritten");
      return "saved in place, conflict detected";
    }
    throw new Error("stale save was accepted");
  });

  if (!IS_ANDROID) await check("a file inside the open folder is a note of that folder, Obsidian's own folders are not", async () => {
    const inside = await openFileUrl(BloomFolder, encodeURI(`file://${root}/Schule/Physik.md`), store);
    if (inside.store !== store || inside.path !== "Schule/Physik.md") throw new Error(`opened as ${inside.store.kind} ${inside.path}`);
    const hidden = await openFileUrl(BloomFolder, encodeURI(`file://${root}/.obsidian/workspace.md`), store);
    if (hidden.store.kind !== "file") throw new Error(`.obsidian file opened as ${hidden.store.kind}`);
    return "Schule/Physik.md";
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

  if (!IS_ANDROID) await check("the app opens a file URL like \"Open in BloomMD\" (outside the folder, then inside it)", async () => {
    const outside = await openFile(externalUrl);
    if (outside.store !== "file" || outside.path !== "Extern.md") throw new Error(`outside: ${JSON.stringify(outside)}`);
    const inside = await openFile(encodeURI(`file://${root}/Uni/Physik/Optik/Linsen.md`));
    if (inside.store !== "folder" || inside.path !== "Uni/Physik/Optik/Linsen.md" || inside.folder !== "Uni/Physik/Optik") throw new Error(`inside: ${JSON.stringify(inside)}`);
    return "Extern.md as file, Linsen.md in Uni/Physik/Optik";
  });

  const passed = checks.every((entry) => entry.ok);
  let result = JSON.stringify({ at: new Date().toISOString(), passed, checks }, null, 2);
  if (!passed) {
    // The CI step prints this file: lines that start with `::error` become annotations, so the failed
    // checks stay readable without access to the job log. Only a failed run gets them; a passed one is plain JSON.
    const failed = checks.filter((entry) => !entry.ok).map((entry) => `${entry.name}: ${entry.detail ?? "failed"}`);
    result += `\n${failed.map((line) => `::error title=Self-test check failed::${line.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}`).join("\n")}\n`;
  }
  await Filesystem.writeFile({
    directory: APP_DIRECTORY,
    path: "selftest-result.json",
    data: result,
    encoding: Encoding.UTF8,
  });
}
