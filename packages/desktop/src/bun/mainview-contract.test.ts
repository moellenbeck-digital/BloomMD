import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP_SOURCE = join(ROOT, "mainview", "App.tsx");
const BUN_SOURCE = join(ROOT, "bun", "index.ts");
const FOLDER_DIALOG_SOURCE = join(ROOT, "mainview", "FolderPublicationDialog.tsx");
const FOLDER_PUBLISH_SOURCE = join(ROOT, "bun", "folder-publish.ts");
const FOLDER_SHARE_SOURCE = join(ROOT, "bun", "folder-share.ts");
const FOLDER_SHARES_DIALOG_SOURCE = join(ROOT, "mainview", "FolderSharesDialog.tsx");
const FILE_CONTEXT_MENU_SOURCE = join(ROOT, "..", "..", "ui", "src", "components", "FileContextMenu.tsx");

function compact(source: string): string {
  return source.replace(/\s+/g, " ");
}

describe("desktop mainview contract", () => {
  test("exposes stable shell, header, loading and empty-state selectors", async () => {
    const source = await readFile(APP_SOURCE, "utf8");

    for (const testId of [
      "app-loading",
      "app-shell",
      "desktop-header",
      "document-title",
      "back-to-workspace",
      "desktop-feedback-dialog",
      "desktop-submit-feedback",
      "desktop-main",
      "file-browser-toggle",
      "file-drawer",
      "file-drawer-list",
      "empty-workspace",
      "empty-create-file",
      "empty-import-file",
      "empty-change-folder",
      "desktop-workspace-selector-label",
      "desktop-workspace-selector",
      "desktop-workspace-role",
      "desktop-workspace-error",
    ]) {
      expect(source).toContain(`data-testid="${testId}"`);
    }
  });

  test("loads an external file or the workspace map and records E2E state", async () => {
    const source = compact(await readFile(APP_SOURCE, "utf8"));

    expect(source).toContain("Promise.all([refreshFileList(), consumeExternalFile()]).then(async ([fileList, external]) =>");
    expect(source).toContain("external.kind === \"file\" && external.filename && fileList.some((file) => file.filename === external.filename) ? external.filename : null");
    expect(source).toContain("if (initial) await loadFile(initial).then(() => reportExternalNode(external.nodeId)); else if (external.kind === \"folder\" && fileList.length > 0) await loadWorkspace(\"initialExternalFolder\"); else if (fileList.length > 0) await loadWorkspace(\"initialLoad\"); else reportE2EState({ source: \"initialLoad\", activeFile: null, emptyWorkspace: true, workspaceMode: true });");
    expect(source).toContain(".finally(() => setLoading(false))");
    expect(source).toContain("if (external.kind === \"file\" && external.filename) { void loadFile(external.filename).then(() => reportExternalNode(external.nodeId)); } else if (external.kind === \"folder\" && files.length > 0) { loadWorkspace(\"externalFileOpened\"); }");
    expect(source).toContain("source: \"loadFile\", activeFile: filename, emptyWorkspace: false, documentTitle: doc.frontmatter.title, nodeCount: doc.nodes.size");
    expect(source).toContain("source, activeFile: null, emptyWorkspace: doc.nodes.size <= 1, documentTitle: doc.frontmatter.title, nodeCount: doc.nodes.size, referenceEdgeCount: doc.references?.length ?? 0, workspaceMode: true");
  });

  test("selects and centres the node an external open asked for", async () => {
    const source = compact(await readFile(APP_SOURCE, "utf8"));

    expect(source).toContain("for (const ancestor of collapsedAncestors(store.document, store.collapsedIds, nodeId)) { useMindMapStore.getState().toggleCollapse(ancestor); }");
    expect(source).toContain("useMindMapStore.getState().setSelectedNodeId(nodeId);");
    expect(source).toContain("window.setTimeout(() => requestNodeFocus(nodeId), 120);");
    expect(source).toContain("const selectedNodeId = revealExternalNode(nodeId);");
    expect(source).toContain("selectedNodeVisible: Boolean(selectedNodeId && state.nodes.some((node) => node.id === selectedNodeId)),");
  });

  test("keeps a canceled folder switch as a no-op in the renderer", async () => {
    const source = compact(await readFile(APP_SOURCE, "utf8"));

    expect(source).toContain("const result = await chooseDirectory(); if (!result.path) { if (result.error) { console.error(\"[BloomMD] Folder switch failed:\", result.error); setLocalLoadError(true); } return; }");
    expect(source).toContain("const fileList = await refreshFileList(); if (fileList.length > 0) { await loadWorkspace(\"chooseDirectory\"); } else { setDocument(null); currentFileRef.current = null; reportE2EState({ source: \"chooseDirectory\", activeFile: null, emptyWorkspace: true }); }");
  });

  test("wires desktop toolbar and command palette to the same file action handlers", async () => {
    const source = compact(await readFile(APP_SOURCE, "utf8"));

    for (const wiring of [
      "onReload={reload}",
      "onCreateNew={handleCreateNew}",
      "onSaveFile={handleSaveFile}",
      "onImportFile={handleImportFile}",
      "onDeliverExport={handleDeliverExport}",
      "onNew={() => toolbarRef.current?.triggerNew()}",
      "onSave={() => void toolbarRef.current?.triggerSave()}",
      "onImport={() => toolbarRef.current?.triggerImport()}",
      "onExport={() => toolbarRef.current?.triggerExport()}",
      "onReload={() => void reload()}",
      "onOpenMindmap={loadFile}",
      "onNew: () => toolbarRef.current?.triggerNew()",
      "onImport: () => toolbarRef.current?.triggerImport()",
      "onExport: () => toolbarRef.current?.triggerExport()",
      "onSave: () => toolbarRef.current?.triggerSave()",
      "onReload: reload",
    ]) {
      expect(source).toContain(wiring);
    }
  });

  test("provides an explicit return path from a file to the workspace overview", async () => {
    const source = compact(await readFile(APP_SOURCE, "utf8"));

    expect(source).toContain("data-testid=\"back-to-workspace\"");
    expect(source).toContain("onBackToWorkspace: () => {");
    expect(source).toContain("onForwardToFile: () => {");
    expect(source).toContain("data-testid=\"forward-to-file\"");
    expect(source).toContain("Cmd/Ctrl+←");
    expect(source).toContain("Cmd/Ctrl+→");
    expect(source).toContain("await loadWorkspace(\"returnToWorkspace\")");
    expect(source).toContain("showWorkspaceNavigationShortcut");
    expect(source).toContain("useMindMapStore.getState().disconnectSync(); currentFileRef.current = null;");
    expect(source).toContain("backToWorkspace");
  });

  test("keeps local and remote workspace overview loading available", async () => {
    const renderer = compact(await readFile(APP_SOURCE, "utf8"));
    const main = compact(await readFile(BUN_SOURCE, "utf8"));

    expect(renderer).toContain("const data = await openWorkspace()");
    expect(renderer).toContain("useMindMapStore.getState().disconnectSync()");
    expect(renderer).toContain("connectionMode === \"remote\"");
    expect(main).toContain("openWorkspace: async () => {");
    expect(main).toContain("if (isRemote())");
    expect(main).toContain("await remoteStore!.list()");
    expect(main).toContain("localStore.readWorkspaceMindMap(basename(bloommdDir),");
  });

  test("bridges editor resource actions through desktop RPC", async () => {
    const source = compact(await readFile(APP_SOURCE, "utf8"));

    for (const wiring of [
      "window.addEventListener(\"bloommd:open-url\", openUrl);",
      "window.addEventListener(\"bloommd:load-link-preview\", loadLinkPreview);",
      "window.addEventListener(\"bloommd:list-maps\", listMaps);",
      "window.addEventListener(\"bloommd:load-map-document\", loadMapDocument);",
      "window.addEventListener(\"bloommd:choose-resource\", chooseResource);",
      "window.addEventListener(\"bloommd:open-resource\", openResource);",
      "void openExternalUrl(detail.url)",
      "void fetchLinkPreview(detail.url)",
      "void listMindmaps() .then((result) => detail.respond?.({ files: result.files }))",
      "void openMindmap(detail.filename) .then((documentData) => detail.respond?.({ document: documentData }))",
      "void chooseResourceFile(detail.kind)",
      "void readResource(detail.file)",
    ]) {
      expect(source).toContain(wiring);
    }
  });

  test("imports, exports and watcher refreshes stay local and deterministic", async () => {
    const renderer = compact(await readFile(APP_SOURCE, "utf8"));
    const main = compact(await readFile(BUN_SOURCE, "utf8"));

    expect(renderer).toContain("const result = await importFile(); if (!(\"frontmatter\" in result)) { if (result.error)");
    expect(renderer).toContain("setDocument(doc); const importedFilename = result.filePath.split(\"/\").pop() || \"\"; currentFileRef.current = importedFilename;");
    expect(renderer).toContain("await refreshFileList();");
    expect(renderer).toContain("const { markdown } = await serializeMindmap(serializedDoc);");
    expect(renderer).toContain("const result = await saveExport(file.filename, bytesToBase64(file.data)); if (\"error\" in result) throw new Error(result.error);");
    // "Save image" / "Save diagram" in the enlarged view (#53) take the same route into the Downloads folder.
    expect(renderer).toContain("const detail = (event as CustomEvent<DeliverExportDetail>).detail; detail.handle(handleDeliverExport(detail.file));");
    expect(renderer).toContain("window.addEventListener(DELIVER_EXPORT_EVENT, deliver);");
    expect(renderer).toContain("const updatedFiles = await refreshFileList(); if (!navigationStillCurrent()) return;");
    expect(renderer).toContain("const activeSharedMirror = sharedMirrorRef.current;");
    expect(renderer).toContain("activeSharedMirror.mirror.handleLocalMarkdown(markdown)");
    expect(renderer).toContain("await loadFile(filename);");
    expect(renderer).toContain("else if (currentFileRef.current === null && connectionMode === \"local\") { await loadWorkspace(\"fileChanged\"); }");

    expect(main).toContain("let content = await readFile(srcPath, \"utf-8\");");
    expect(main).toContain("content = importOpml(content).markdown;");
    expect(main).toContain("const filename = sanitizeMarkdownFilename(sourceName);");
    expect(main).toContain("await saveExportFile(Utils.paths.downloads, filename, dataBase64)");
    expect(main).toContain("const destPath = resolveMarkdownPath(bloommdDir, filename); const doc = parseFile(destPath, content); await localStore.write(doc);");
    expect(main).toContain("const nextWatcher = watchWorkspace(bloommdDir,");
    expect(main).toContain("if (watcher !== nextWatcher) return;");
  });

  test("connection profiles, safe switching and disconnect preservation are wired", async () => {
    const renderer = compact(await readFile(APP_SOURCE, "utf8"));
    const main = compact(await readFile(BUN_SOURCE, "utf8"));

    expect(renderer).toContain("data-testid=\"connection-switcher\"");
    expect(renderer).toContain("data-testid=\"connection-profile-dialog\"");
    expect(renderer).toContain("data-testid=\"connection-profile-manager\"");
    expect(renderer).toContain("type=\"url\"");
    expect(renderer).toContain("type=\"password\"");
    expect(renderer).toContain("bloom_pat_...");
    expect(renderer).toContain("const result = await connectProfile(profileId);");
    expect(renderer).toContain("const result = await saveConnectionProfile(input);");
    expect(renderer).toContain("const result = await useLocalConnection();");
    expect(renderer).toContain("setConnectionMode(\"remote\");");
    expect(renderer).toContain("{connectionMode === \"remote\" && <SyncStatus />}");
    expect(renderer).toContain("connectionProfiles.find((profile) => profile.id === activeProfileId)");
    expect(renderer).toContain("setConnectionSwitcherOpen((open) => !open)");
    expect(renderer).toContain("setProfileManagerOpen(false); setProfileDialogProfile(null)");
    expect(renderer).toContain("listRemoteWorkspaces");
    expect(renderer).toContain("selectRemoteWorkspace");
    expect(renderer).toContain("const result = await selectRemoteWorkspace(workspaceId);");
    expect(renderer).toContain("useMindMapStore.getState().disconnectSync();");
    expect(renderer).toContain("const refreshUrl = async () => (await getSyncTicket(filename)).websocketUrl;");
    expect(renderer).toContain("if (currentFileRef.current !== filename) return;");
    expect(renderer).toContain("if (previousFilename !== filename) useMindMapStore.getState().disconnectSync();");
    expect(renderer).toContain("useMindMapStore.getState().connectSyncUrl(ticket.websocketUrl, refreshUrl, ticket.identity);");
    expect(renderer).not.toContain("useMindMapStore.getState().connectSyncUrl(ticket.websocketUrl, undefined, ticket.identity);");
    expect(renderer).toContain("const nextFilename = previousFilename && result.files.some((file) => file.filename === previousFilename)");
    expect(renderer).toContain("await loadFile(nextFilename, true);");
    expect(renderer).toContain("await loadFile(previousFilename, true);");
    expect(renderer).toContain("Workspace");
    expect(renderer).toContain("workspaceRoleLabel(activeRemoteWorkspace.role, t)");
    expect(renderer).toContain("t.workspaceAccessLoading");
    expect(renderer).toContain("t.workspaceReadOnly");
    expect(renderer).toContain("if (!assertRemoteWriteAccess()) return;");
    expect(renderer).toContain("setSwitchingWorkspace(true);");
    expect(renderer).toContain("setSwitchingWorkspace(false);");
    expect(renderer).toContain("data-testid=\"reconnect-failed-banner\"");
    expect(renderer).toContain("setReconnectFailedProfileId(modeInfo.reconnectFailed.profileId);");

    expect(main).toContain("function normalizeConnectionUrl(value: string): string");
    expect(main).toContain("if (!accessToken.startsWith(\"bloom_pat_\")) throw new Error(\"A personal BloomMD access token is required.\");");
    expect(main).toContain("listConnectionProfiles: async () => {");
    expect(main).toContain("storageError = err.code;");
    expect(main).toContain("connectProfile: async ({ profileId }) => {");
    expect(main).toContain("useLocalConnection: async () => {");
    expect(main).toContain("await secureStorage.delete(profile.tokenRef);");
    expect(main).toContain("listRemoteWorkspaces: async () => {");
    expect(main).toContain("selectRemoteWorkspace: async ({ workspaceId }) => {");
    expect(main).toContain("await persistDesktopSettings({ localDir: bloommdDir, activeConnection: { type: \"local\" } });");
    expect(main).toContain("mainRPC.send.connectionModeChanged({ type: \"local\" });");
  });

  test("shares one local Markdown file explicitly without leaking local paths to the cloud", async () => {
    const renderer = compact(await readFile(APP_SOURCE, "utf8"));
    const main = compact(await readFile(BUN_SOURCE, "utf8"));
    const fileContextMenu = compact(await readFile(FILE_CONTEXT_MENU_SOURCE, "utf8"));

    expect(renderer).toContain("data-testid=\"desktop-share-local-document\"");
    expect(renderer).toContain("const activeDocumentFilename = files.find((entry) => fileEntryIsActive(entry, document))?.filename");
    expect(renderer).toContain("?? activeLocalFilename");
    expect(renderer).toContain("handleShareFromSidebar");
    expect(renderer).toContain("onShare={connectionMode === \"local\"");
    expect(fileContextMenu).toContain("data-testid=\"file-context-share\"");
    expect(renderer).toContain("<SharedDocumentDialog");
    expect(renderer).toContain("shareLocalMindmap");
    expect(renderer).toContain("unshareLocalMindmap");
    expect(renderer).toContain("Only this file is uploaded to the selected workspace after confirmation.");
    expect(renderer).toContain("The cloud document is not deleted.");

    expect(main).toContain("shareLocalMindmap: async ({ localFilename, profileId, workspaceId, cloudFilename }) => {");
    expect(main).toContain("const localDocument = await localStore.read(safeLocalFilename);");
    expect(main).toContain("const cloudDocument = await apiStore.create(safeCloudFilename, markdown);");
    expect(main).toContain("const documentId = cloudDocument.storage?.documentId;");
    expect(main).toContain("await apiStore.delete(cloudDocument.filePath);");
    expect(main).toContain("sharedDocumentBindings");
    expect(main).toContain("unshareLocalMindmap: async ({ localFilename }) => {");
    expect(main).toContain("bindings.filter((entry) => entry.localFilename !== safeLocalFilename)");
    expect(main).toContain("getSharedSyncTicket: async ({ localFilename }) => {");
    expect(main).not.toContain("apiStore.create(safeLocalFilename");
    expect(main).not.toContain("const documentId = cloudDocument.frontmatter.id;");
  });

  test("publishes a local folder only through its own entry point and after a confirmed preview", async () => {
    const renderer = compact(await readFile(APP_SOURCE, "utf8"));
    const dialog = compact(await readFile(FOLDER_DIALOG_SOURCE, "utf8"));
    const main = compact(await readFile(BUN_SOURCE, "utf8"));
    const folderPublish = compact(await readFile(FOLDER_PUBLISH_SOURCE, "utf8"));

    // A separate entry point with its own name; the single-file share keeps its button and dialog.
    expect(renderer).toContain("data-testid=\"publish-folder-as-workspace\"");
    expect(renderer).toContain("data-testid=\"desktop-share-local-document\"");
    expect(renderer).toContain("<SharedDocumentDialog");
    expect(renderer).toContain("<FolderPublicationDialog");
    expect(renderer).toContain("folderPublicationOpen && connectionMode === \"local\"");
    expect(dialog).toContain("Ordner als gemeinsamen Workspace veröffentlichen");
    expect(dialog).toContain("Publish folder as a shared workspace");

    // Choosing and previewing never upload; only the confirm button calls publishFolderAsWorkspace.
    expect(dialog.match(/publishFolderAsWorkspace\(/g)).toHaveLength(1);
    expect(dialog).toContain("onClick={() => void publish()}");
    expect(dialog).toContain("data-testid=\"folder-publication-confirm\"");
    expect(dialog).toContain("const confirmedUploads = preview.items.filter((item) => item.status === \"upload\" && !excluded.has(item.relativePath))");
    expect(dialog).toContain("Nothing is read or uploaded until you confirm in the preview.");

    // Bun side: preview and folder choice are read-only, the folder comes from the native dialog.
    const previewHandler = main.slice(main.indexOf("previewFolderPublication: async"), main.indexOf("publishFolderAsWorkspace: async"));
    expect(previewHandler).toContain("prepareFolderPublicationRequest(");
    expect(previewHandler).not.toContain("publishFolderPlan");
    expect(previewHandler).not.toContain(".create(");
    expect(main).toContain("publicationFolder = resolve(selected);");
    expect(main).toContain("if (!folderPath) throw new Error(\"PUBLICATION_FOLDER_NOT_SELECTED\");");
    expect(main).toContain("if (workspace.role === \"viewer\") throw new Error(\"WORKSPACE_READ_ONLY\");");
    expect(main).toContain("confirmed: confirmedUploads,");
    expect(main).toContain("recordFolderBinding: (documentIds) => prepared.apiStore.recordSharedFolderBinding(\"bound\", documentIds),");

    // Only Markdown names and IDs go to the cloud: no folder or relative path in any cloud call.
    expect(folderPublish).toContain("input.cloud.create(item.uploadFilename, markdown)");
    expect(folderPublish).toContain("input.cloud.recordFolderBinding(");
    expect(folderPublish).not.toMatch(/input\.cloud\.\w+\([^)]*(relativePath|folderPath)/);
    expect(main).not.toContain("apiStore.create(prepared.folderPath");
    expect(main).not.toMatch(/recordSharedFolderBinding\([^)]*(folderPath|relativePath)/);
  });

  test("a published folder changes the cloud only through an explicit decision and never deletes on its own", async () => {
    const renderer = compact(await readFile(APP_SOURCE, "utf8"));
    const sharesDialog = compact(await readFile(FOLDER_SHARES_DIALOG_SOURCE, "utf8"));
    const main = compact(await readFile(BUN_SOURCE, "utf8"));
    const folderShare = compact(await readFile(FOLDER_SHARE_SOURCE, "utf8"));

    // Entry point and labels.
    expect(renderer).toContain("data-testid=\"folder-shares\"");
    expect(renderer).toContain("<FolderSharesDialog");
    for (const text of ["neu, noch nicht geteilt", "lokal entfernt", "lokal umbenannt", "Zugriff entzogen", "Ordnerfreigabe trennen", "Cloud-Dokument behalten", "Cloud-Dokument entfernen"]) {
      expect(sharesDialog).toContain(text);
    }

    // The cloud is deleted in exactly one place: the explicit remove-cloud decision, after its audit.
    expect(folderShare.match(/cloud\.delete\(/g)).toHaveLength(1);
    expect(folderShare).toContain("if (decision.action === \"remove-cloud\") {");
    expect(folderShare.indexOf("cloud.recordFolderUnbinding([file.binding.documentId]);")).toBeLessThan(folderShare.indexOf("await cloud.delete(file.binding.cloudFilename);"));
    expect(sharesDialog).toContain("data-testid=\"folder-activity-remove-cloud-confirm\"");
    expect(sharesDialog).toContain("setConfirming(key)");

    // Reading the activity list never uploads or deletes.
    const activityHandler = main.slice(main.indexOf("getFolderActivity: async"), main.indexOf("resolveFolderActivity: async"));
    expect(activityHandler).toContain("computeFolderActivity(");
    for (const forbidden of ["applyFolderDecision", ".create(", ".delete(", "publishFolderPlan"]) expect(activityHandler).not.toContain(forbidden);

    // A refusal by the server stops the share and keeps local files.
    expect(main).toContain("stopRevokedFolderShare");
    expect(folderShare).toContain("if (folder.state === \"revoked\") throw new Error(\"FOLDER_ACCESS_REVOKED\");");
    expect(folderShare).toContain("{ type: \"access_revoked\" }");

    // Disconnecting ends the local binding first, audits afterwards and deletes nothing.
    const disconnectHandler = main.slice(main.indexOf("disconnectFolderShare: async"), main.indexOf("createFolder: async"));
    expect(disconnectHandler.indexOf("persistDesktopSettings(")).toBeLessThan(disconnectHandler.indexOf("auditFolderUnbinding("));
    for (const forbidden of [".delete(", ".create(", "rm(", "unlink("]) expect(disconnectHandler).not.toContain(forbidden);
    expect(main).toContain("PART_OF_FOLDER_SHARE");
  });

  test("keeps one shared file on its Yjs provider while mirroring local watcher changes", async () => {
    const renderer = compact(await readFile(APP_SOURCE, "utf8"));

    expect(renderer).toContain("const connectSharedFileSync = useCallback(async (localFilename: string) => {");
    expect(renderer).toContain("const ticket = await getSharedSyncTicket(localFilename);");
    expect(renderer).toContain("documentToYDoc(parseFile(localFilename, markdown), yDoc, DESKTOP_LOCAL_FILE_MIRROR_ORIGIN);");
    expect(renderer).toContain("void mirror.applyRemoteMarkdown(markdown, mirror.getBinding().lastKnownCloudVersion)");
    expect(renderer).toContain("updateSharedDocumentBinding(localFilename, binding)");
    expect(renderer).toContain("if (origin === DESKTOP_LOCAL_FILE_MIRROR_ORIGIN) return;");
    expect(renderer).toContain("sharedDocumentStateLabel(sharedDocument.connectionState, locale)");
    expect(renderer).toContain("Lokale und Cloud-Version unterscheiden sich.");
    expect(renderer).toContain("Cloud-Version verwenden");
    expect(renderer).toContain("Lokale Version beibehalten");
    expect(renderer).toContain("resolveConflictUsingLocalMarkdown");
    expect(renderer).toContain("resolveConflictUsingRemoteMarkdown");
  });

  test("sends desktop feedback through RPC without automatic document uploads", async () => {
    const renderer = compact(await readFile(APP_SOURCE, "utf8"));
    const main = compact(await readFile(BUN_SOURCE, "utf8"));

    expect(renderer).toContain("feedbackTestId=\"desktop-open-feedback\"");
    expect(renderer).toContain("data-testid=\"desktop-feedback-dialog\"");
    expect(renderer).toContain("data-testid=\"desktop-submit-feedback\"");
    expect(renderer).toContain("attachments: await Promise.all(screenshotFiles.map(fileToFeedbackAttachment))");
    expect(renderer).toContain("selectedNodeType: selectedNode?.metadata?.kind ?? \"topic\"");
    expect(main).toContain("form.set(\"desktopFeedback\", \"1\");");
    expect(main).toContain("form.set(\"diagnostics\", desktopDiagnostics(input));");
    expect(main).toContain("if (mode.type === \"remote\") headers.Authorization = `Bearer ${mode.accessToken}`;");
    expect(main).toContain("submitFeedback: async (input) =>");
    expect(main).not.toContain("form.set(\"markdown\"");
  });
});
