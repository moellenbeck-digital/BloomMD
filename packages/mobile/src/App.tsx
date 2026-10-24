import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Menu, FilePlus, Save, Check, Share2, CircleHelp, Upload, Trash2, X, AlertTriangle, Cloud, CloudOff, LogIn, LogOut, FolderOpen, Tablet, CloudDownload, Search } from "lucide-react";
import {
  MindMapCanvas,
  LazyNodeEditor,
  HelpModal,
  InkAttachmentsContext,
  requestNodeFocus,
  useMindMapStore,
  useLocale,
} from "@bloommd/ui";
import { parseFile, serializeToMarkdown } from "@bloommd/core/browser";
import { BloomFolder } from "@bloommd/capacitor-folder";
import { BloomKeychain } from "@bloommd/capacitor-keychain";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { markdownFilename } from "./mobile-files";
import { MobileRemoteClient, RemoteRequestError } from "./remote-client";
import { DEFAULT_SERVER_URL, describeDevice, MobileAuth, MobileAuthError, normalizeServerUrl, type MobileSession } from "./mobile-auth";
import { parseAppLink } from "./app-links";
import { createAppStore, createFolderStore, type MobileStore, type StoreEntry } from "./stores";
import { NoteSaver } from "./note-saver";
import { APP_DIRECTORY, IS_ANDROID } from "./platform";
import { appInkAttachments, folderInkAttachments } from "./ink-attachments";
import { shellText } from "./shell-text";

const SELFTEST = import.meta.env.VITE_BLOOMMD_SELFTEST === "1";
/** Official app server; development builds may point elsewhere with VITE_BLOOMMD_APP_URL. */
const DEFAULT_SERVER = normalizeServerUrl(import.meta.env.VITE_BLOOMMD_APP_URL ?? "") ?? DEFAULT_SERVER_URL;
const SERVER_URL_KEY = "bloommd_mobile_remote_url";

const AUTH_TEXT = {
  de: {
    signInTitle: "Mit BloomMD-Konto anmelden",
    signIn: "Anmelden",
    signingIn: "Anmeldung im Browser …",
    signInHint: "Die Anmeldung öffnet BloomMD im Browser. Dein Passwort bleibt dort.",
    advanced: "Erweitert: eigener Server",
    serverLabel: "BloomMD-Server",
    serverHint: "Nur für selbst gehostete BloomMD-Instanzen ändern.",
    connected: "Cloud verbunden",
    signedInAs: "Angemeldet als",
    connect: "Verbinden",
    connecting: "Verbinde …",
    workLocal: "Lokal arbeiten",
    signOut: "Abmelden",
    signOutConfirm: "Von BloomMD abmelden? Die App verliert den Zugriff auf deine Cloud-Mindmaps auf diesem Gerät.",
    invalidServer: "Bitte eine gültige https-Adresse des BloomMD-Servers eingeben.",
    errors: {
      invalid_server: "Bitte eine gültige https-Adresse des BloomMD-Servers eingeben.",
      no_pending: "Diese Anmeldung wurde nicht in der App gestartet. Bitte erneut auf „Anmelden“ tippen.",
      expired: "Die Anmeldung ist abgelaufen oder wurde schon verwendet. Bitte erneut anmelden.",
      state_mismatch: "Die Anmeldung passt nicht zu dieser App-Sitzung und wurde ignoriert.",
      denied: "Anmeldung abgebrochen.",
      exchange_failed: "Die Anmeldung konnte nicht abgeschlossen werden. Bitte erneut versuchen.",
      network: "Der BloomMD-Server ist nicht erreichbar. Bitte Verbindung prüfen.",
    },
    signedOutRemote: "Abgemeldet. Der Server war nicht erreichbar – widerrufe den Zugang bei Bedarf unter Konto › Desktop- und Agenten-Zugriff.",
    sessionEnded: "Deine Anmeldung ist abgelaufen oder wurde widerrufen. Bitte erneut anmelden.",
    offline: "Offline: Die Cloud ist gerade nicht erreichbar. Du bleibst angemeldet.",
    keychainFailed: "Die Anmeldung konnte auf diesem Gerät nicht sicher gespeichert werden.",
  },
  en: {
    signInTitle: "Sign in with your BloomMD account",
    signIn: "Sign in",
    signingIn: "Signing in in the browser…",
    signInHint: "Signing in opens BloomMD in the browser. Your password stays there.",
    advanced: "Advanced: custom server",
    serverLabel: "BloomMD server",
    serverHint: "Only change this for self-hosted BloomMD instances.",
    connected: "Cloud connected",
    signedInAs: "Signed in as",
    connect: "Connect",
    connecting: "Connecting…",
    workLocal: "Work locally",
    signOut: "Sign out",
    signOutConfirm: "Sign out of BloomMD? The app loses access to your cloud mind maps on this device.",
    invalidServer: "Enter a valid https address of the BloomMD server.",
    errors: {
      invalid_server: "Enter a valid https address of the BloomMD server.",
      no_pending: "This sign-in was not started in the app. Tap “Sign in” again.",
      expired: "The sign-in expired or was already used. Please sign in again.",
      state_mismatch: "The sign-in does not belong to this app session and was ignored.",
      denied: "Sign-in cancelled.",
      exchange_failed: "The sign-in could not be completed. Please try again.",
      network: "The BloomMD server cannot be reached. Check your connection.",
    },
    signedOutRemote: "Signed out. The server could not be reached – revoke the access under Account › Desktop and agent access if needed.",
    sessionEnded: "Your sign-in expired or was revoked. Please sign in again.",
    offline: "Offline: the cloud cannot be reached right now. You stay signed in.",
    keychainFailed: "The sign-in could not be stored securely on this device.",
  },
} as const;

export function App() {
  const { t, locale } = useLocale();
  const authText = AUTH_TEXT[locale === "en" ? "en" : "de"];
  const text = shellText(locale);
  // Callbacks read the current language without being recreated when it changes.
  const textRef = useRef(text);
  textRef.current = text;
  const setDocument = useMindMapStore((s) => s.setDocument);
  const selectedNodeId = useMindMapStore((s) => s.selectedNodeId);
  const editorVisible = useMindMapStore((s) => s.editorVisible);
  const setSelectedNodeId = useMindMapStore((s) => s.setSelectedNodeId);
  const document = useMindMapStore((s) => s.document);
  const syncStatus = useMindMapStore((s) => s.syncStatus);
  const [files, setFiles] = useState<StoreEntry[]>([]);
  const [store, setStore] = useState<MobileStore>(() => createAppStore());
  const storeRef = useRef(store);
  storeRef.current = store;
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteUrl, setRemoteUrl] = useState(DEFAULT_SERVER);
  const [account, setAccount] = useState<MobileSession | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [remoteClient, setRemoteClient] = useState<MobileRemoteClient | null>(null);
  const [remoteConnecting, setRemoteConnecting] = useState(false);
  const [auth] = useState(() => new MobileAuth({
    keychain: BloomKeychain,
    fetch: (input, init) => fetch(input, init),
    // In-app Safari (iOS) or Custom Tabs (Android): the user signs in on the website, never in the app.
    openBrowser: async (url) => { await Browser.open({ url, presentationStyle: "popover" }); },
    closeBrowser: async () => { await Browser.close(); },
  }));
  const [truncated, setTruncated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const conflictRef = useRef<(conflict: { path: string; copy: string | null; current: boolean }) => void>(() => undefined);
  const [saver] = useState(() => new NoteSaver({
    onSaved: () => {
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    },
    onConflict: (conflict) => conflictRef.current(conflict),
    onError: () => setError(textRef.current.errors.saveFailed),
  }));

  /** Saves the open note's latest edits now; awaited before anything replaces the note. */
  const flushSave = useCallback(() => saver.flush(useMindMapStore.getState().document), [saver]);

  const loadFile = useCallback(
    async (path: string, node: string | null = null, from: MobileStore = storeRef.current) => {
      try {
        setError(null);
        await flushSave();
        if (remoteClient) {
          saver.open(null, null);
          setDocument(await remoteClient.read(path));
        } else {
          const loaded = await from.read(path);
          saver.open(from, loaded);
          setDocument(loaded.document);
        }
        if (node && useMindMapStore.getState().document?.nodes.has(node)) {
          useMindMapStore.getState().setSelectedNodeId(node);
          window.setTimeout(() => requestNodeFocus(node), 150);
        }
      } catch {
        setError(textRef.current.errors.openFailed(path));
        throw new Error(`Could not open ${path}`);
      }
    },
    [flushSave, remoteClient, saver, setDocument],
  );

  const refreshFiles = useCallback(async (from: MobileStore = storeRef.current) => {
    if (remoteClient) {
      const remoteFiles = (await remoteClient.list()).map((entry): StoreEntry => ({ path: entry.filename, title: entry.frontmatter.title || entry.filename, folder: "", local: true, frontmatter: entry.frontmatter }));
      setFiles(remoteFiles);
      setTruncated(false);
      return remoteFiles;
    }
    const result = await from.list();
    setFiles(result.entries);
    setTruncated(Boolean(result.truncated));
    if (result.unreadable.length > 0) setError(textRef.current.errors.unreadable(result.unreadable.length));
    return result.entries;
  }, [remoteClient]);

  const switchStore = useCallback(async (next: MobileStore) => {
    await flushSave();
    storeRef.current = next;
    setStore(next);
    saver.open(null, null);
    useMindMapStore.setState({ document: null, nodes: [], edges: [], selectedNodeId: null, selectedNodeIds: [] });
    const entries = await refreshFiles(next);
    // A vault can hold hundreds of notes: let the user pick instead of opening one at random.
    if (next.kind === "app" && entries[0]) await loadFile(entries[0].path, null, next);
    else setDrawerOpen(true);
  }, [flushSave, loadFile, refreshFiles, saver]);

  const openFolder = useCallback(async () => {
    try {
      await flushSave();
      const picked = await BloomFolder.pick();
      if (!picked.name) return;
      await switchStore(createFolderStore(BloomFolder, picked.name));
    } catch (folderError) {
      setError(folderError instanceof Error ? folderError.message : textRef.current.errors.folderFailed);
    }
  }, [flushSave, switchStore]);

  const useAppFolder = useCallback(async () => {
    await flushSave();
    await BloomFolder.forget().catch(() => undefined);
    await switchStore(createAppStore());
  }, [flushSave, switchStore]);

  // Another device (e.g. Obsidian on the Mac) changed or deleted the note while it was edited here.
  // The iPad's version is already kept as a copy next to the note; then the other version is shown.
  conflictRef.current = ({ path, copy, current }) => {
    const conflictText = textRef.current.conflict;
    const kept = copy ? conflictText.kept(copy) : conflictText.notKept;
    void (async () => {
      let shown = "";
      if (current && copy) {
        try {
          const loaded = await storeRef.current.read(path);
          saver.open(storeRef.current, loaded);
          setDocument(loaded.document);
          shown = ` ${conflictText.otherShown}`;
        } catch {
          saver.open(null, null);
          useMindMapStore.setState({ document: null, nodes: [], edges: [], selectedNodeId: null, selectedNodeIds: [] });
          shown = ` ${conflictText.gone}`;
        }
      }
      await refreshFiles().catch(() => undefined);
      setError(`${conflictText.changedElsewhere(path)} ${kept}${shown}`);
    })();
  };

  const handleSave = useCallback(async () => {
    if (!document) return;
    setSaving(true);
    setError(null);
    try {
      if (remoteClient && syncStatus === "connected") return;
      if (remoteClient) {
        const storage = await remoteClient.write(document);
        if (storage) useMindMapStore.getState().setStorageMetadata(storage);
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1500);
      } else {
        await saver.flush(document);
      }
    } catch {
      setError(textRef.current.errors.saveFailed);
      throw new Error("Mobile save failed");
    } finally {
      setSaving(false);
    }
  }, [document, remoteClient, saver, syncStatus]);

  /** Opens the cloud mind maps of the signed-in account. */
  const connectRemote = useCallback(async (session: MobileSession) => {
    setRemoteConnecting(true);
    setError(null);
    try {
      const client = new MobileRemoteClient({ baseUrl: session.serverUrl, accessToken: session.token });
      const remoteFiles = await client.list();
      await flushSave();
      saver.open(null, null);
      setRemoteClient(client);
      // The server address is no secret; the token lives only in the keychain.
      window.localStorage.setItem(SERVER_URL_KEY, session.serverUrl);
      setFiles(remoteFiles.map((entry): StoreEntry => ({ path: entry.filename, title: entry.frontmatter.title || entry.filename, folder: "", local: true, frontmatter: entry.frontmatter })));
      if (remoteFiles[0]) {
        const doc = await client.read(remoteFiles[0].filename);
        setDocument(doc);
        const ticket = await client.ticket(remoteFiles[0].filename);
        useMindMapStore.getState().connectSyncUrl(ticket.websocketUrl, undefined, ticket.identity);
      }
      setDrawerOpen(false);
    } catch (connectionError) {
      if (connectionError instanceof RemoteRequestError && connectionError.status === 401) {
        // Revoked in the account settings or expired: forget it on this device too.
        await auth.signOut().catch(() => undefined);
        setAccount(null);
        setError(authText.sessionEnded);
      } else if (connectionError instanceof TypeError) {
        setError(authText.offline);
      } else {
        setError(connectionError instanceof Error ? connectionError.message : textRef.current.errors.cloudFailed);
      }
    } finally {
      setRemoteConnecting(false);
    }
  }, [auth, authText, flushSave, saver, setDocument]);

  /** Back to the notes on this device; the account stays signed in. */
  const disconnectRemote = useCallback(async () => {
    useMindMapStore.getState().disconnectSync();
    setRemoteClient(null);
    const localFiles = await refreshFiles();
    if (localFiles[0] && storeRef.current.kind === "app") await loadFile(localFiles[0].path);
  }, [loadFile, refreshFiles]);

  const startSignIn = useCallback(async () => {
    const serverUrl = normalizeServerUrl(remoteUrl);
    if (!serverUrl) {
      setError(authText.invalidServer);
      return;
    }
    setError(null);
    setSigningIn(true);
    try {
      await auth.start({ serverUrl, device: describeDevice(navigator), lang: locale === "en" ? "en" : "de" });
    } catch (signInError) {
      setSigningIn(false);
      setError(signInError instanceof MobileAuthError ? authText.errors[signInError.code] : authText.keychainFailed);
    }
  }, [auth, authText, locale, remoteUrl]);

  const completeSignIn = useCallback(async (url: string) => {
    setSigningIn(true);
    try {
      const session = await auth.complete(url);
      setAccount(session);
      await connectRemote(session);
    } catch (signInError) {
      if (signInError instanceof MobileAuthError) {
        setError(authText.errors[signInError.code]);
      } else {
        console.error("[BloomMD] Sign-in failed:", signInError instanceof Error ? signInError.message : "unknown");
        setError(authText.keychainFailed);
      }
    } finally {
      setSigningIn(false);
    }
  }, [auth, authText, connectRemote]);

  useEffect(() => {
    // The user closed the sign-in browser without finishing: the button becomes usable again.
    const listener = Browser.addListener("browserFinished", () => setSigningIn(false));
    return () => { void listener.then((handle) => handle.remove()).catch(() => undefined); };
  }, []);

  const signOut = useCallback(async () => {
    if (!window.confirm(authText.signOutConfirm)) return;
    useMindMapStore.getState().disconnectSync();
    setRemoteClient(null);
    const { revoked } = await auth.signOut();
    setAccount(null);
    if (!revoked) setError(authText.signedOutRemote);
    const localFiles = await refreshFiles();
    if (localFiles[0] && storeRef.current.kind === "app") await loadFile(localFiles[0].path);
  }, [auth, authText, loadFile, refreshFiles]);

  const handleNew = useCallback(async () => {
    const title = prompt(t.newMindmapPrompt);
    if (!title) return;
    await flushSave();

    const id = crypto.randomUUID().slice(0, 8);
    const now = new Date().toISOString();

    const markdown = `---\ntitle: ${title}\nid: ${id}\ncreated: "${now}"\nupdated: "${now}"\nlayout:\n  direction: LR\n---\n\n# ${title}\n`;
    const filename = markdownFilename(title, id, files.map((file) => file.path.split("/").pop() ?? file.path));
    const doc = parseFile(storeRef.current.pathFor(filename), markdown);
    const saved = await storeRef.current.save({ document: doc, baseline: "" }, doc);
    saver.open(storeRef.current, saved);
    setDocument(doc);
    await refreshFiles();
  }, [t, files, flushSave, saver, setDocument, refreshFiles]);

  const handleImport = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError(textRef.current.errors.tooLarge);
      return;
    }
    try {
      await flushSave();
      const markdown = await file.text();
      const base = file.name.replace(/\.(md|markdown)$/i, "") || "Import";
      const filename = markdownFilename(base, crypto.randomUUID().slice(0, 8), files.map((entry) => entry.path.split("/").pop() ?? entry.path));
      const doc = parseFile(storeRef.current.pathFor(filename), markdown);
      saver.open(storeRef.current, await storeRef.current.save({ document: doc, baseline: "" }, doc));
      setDocument(doc);
      await refreshFiles();
      setDrawerOpen(false);
      setError(null);
    } catch {
      setError(textRef.current.errors.importFailed);
    }
  }, [files, flushSave, refreshFiles, saver, setDocument]);

  const handleDelete = useCallback(async (path: string) => {
    if (!window.confirm(store.kind === "folder" ? textRef.current.confirmDeleteFromFolder(path, store.name) : textRef.current.confirmDeleteFromDevice(path))) return;
    try {
      await flushSave();
      await store.remove(path);
      const remaining = await refreshFiles();
      if (document?.filePath === path || document?.filePath.split("/").pop() === path) {
        saver.open(null, null);
        if (remaining[0] && store.kind === "app") await loadFile(remaining[0].path);
        else useMindMapStore.setState({ document: null, nodes: [], edges: [], selectedNodeId: null, selectedNodeIds: [] });
      }
      setError(null);
    } catch {
      setError(textRef.current.errors.deleteFailed);
    }
  }, [document, flushSave, loadFile, refreshFiles, saver, store]);

  const handleShare = useCallback(async () => {
    if (!document) return;
    const markdown = serializeToMarkdown(document);
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({
        title: document.frontmatter.title,
        text: markdown,
      });
    } catch {
      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(markdown);
    }
  }, [document]);

  useEffect(() => {
    if (!document) return;
    if (!remoteClient) {
      // The saver keeps the edit until it is written, even when the next edit restarts the quiet period.
      saver.change(document);
      return;
    }
    const timer = window.setTimeout(() => {
      void handleSave().catch(() => undefined);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [document, handleSave, remoteClient, saver]);

  useEffect(() => {
    // iPadOS may end the app any time after it went to the background: save before that.
    const listener = CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) void flushSave();
    });
    return () => { void listener.then((handle) => handle.remove()).catch(() => undefined); };
  }, [flushSave]);

  useEffect(() => {
    // Android back button/gesture: close what is open on top, then leave the app (saved first).
    if (!IS_ANDROID) return;
    const listener = CapacitorApp.addListener("backButton", () => {
      // An open drawing keeps its strokes until Done: back never discards it.
      if (window.document.querySelector(".bloommd-ink-surface")) return;
      if (helpOpen) setHelpOpen(false);
      else if (drawerOpen) setDrawerOpen(false);
      else if (editorVisible) useMindMapStore.getState().setEditorVisible(false);
      else void flushSave().finally(() => void CapacitorApp.minimizeApp());
    });
    return () => { void listener.then((handle) => handle.remove()).catch(() => undefined); };
  }, [drawerOpen, editorVisible, flushSave, helpOpen]);

  const handleLink = useCallback(async (raw: string) => {
    const link = parseAppLink(raw);
    if (!link) return;
    if (link.kind === "auth") {
      await completeSignIn(link.url);
      return;
    }
    if (link.kind === "selftest") {
      if (!SELFTEST) return;
      const { runSelfTest } = await import("./selftest");
      await runSelfTest(async (path, node) => {
        await flushSave();
        const folder = createFolderStore(BloomFolder, "selftest-vault");
        storeRef.current = folder;
        setStore(folder);
        await refreshFiles(folder);
        await loadFile(path, node, folder);
        const selected = useMindMapStore.getState().selectedNodeId;
        if (node && selected !== node) throw new Error(`selected ${selected ?? "nothing"} instead of ${node}`);
      });
      return;
    }
    setDrawerOpen(false);
    await loadFile(link.path, link.node).catch(() => undefined);
  }, [completeSignIn, flushSave, loadFile, refreshFiles]);

  useEffect(() => {
    const listener = CapacitorApp.addListener("appUrlOpen", ({ url }) => { void handleLink(url); });
    return () => { void listener.then((handle) => handle.remove()).catch(() => undefined); };
  }, [handleLink]);

  useEffect(() => {
    const savedRemoteUrl = window.localStorage.getItem(SERVER_URL_KEY);
    if (savedRemoteUrl) setRemoteUrl(savedRemoteUrl);
    let selfTestRequested = false;
    (async () => {
      // Reopen the folder chosen last time (e.g. the Obsidian vault), if it is still reachable.
      const folder = await BloomFolder.current().catch(() => ({ name: null }));
      const initial = folder.name ? createFolderStore(BloomFolder, folder.name) : createAppStore();
      storeRef.current = initial;
      setStore(initial);
      const entries = await refreshFiles(initial);
      if (SELFTEST) {
        // Test builds: the simulator/emulator runner drops `run-selftest` into the app folder
        // (Documents on iOS, the app's files on Android) and launches the app.
        const { Filesystem } = await import("@capacitor/filesystem");
        const trigger = await Filesystem.stat({ directory: APP_DIRECTORY, path: "run-selftest" }).catch(() => null);
        if (trigger) {
          await Filesystem.deleteFile({ directory: APP_DIRECTORY, path: "run-selftest" });
          // Runs once the app has rendered, so the self-test can use the real interface.
          selfTestRequested = true;
          return;
        }
      }
      const launch = await CapacitorApp.getLaunchUrl().catch(() => undefined);
      const launchLink = launch?.url ? parseAppLink(launch.url) : null;
      // Signed in earlier: restore the session silently from the keychain.
      const restored = launchLink?.kind === "auth" ? null : await auth.restore().catch((restoreError: unknown) => {
        console.error("[BloomMD] Session could not be restored:", restoreError instanceof Error ? restoreError.message : "unknown");
        return null;
      });
      if (restored) setAccount(restored.session);
      if (launch?.url && launchLink) await handleLink(launch.url);
      else if (restored && !restored.offline) await connectRemote(restored.session);
      else if (initial.kind === "app" && entries[0]) await loadFile(entries[0].path, null, initial);
      if (restored?.offline) setError(authText.offline);
    })().catch(() => setError(textRef.current.errors.startFailed))
      .finally(() => {
        setLoading(false);
        if (selfTestRequested) window.setTimeout(() => void handleLink("bloommd://selftest"), 500);
      });
    // Runs once on launch. Re-running when the callbacks change (e.g. after connecting the cloud)
    // would restore and connect again in a loop.
  }, []);

  // Handwriting files live next to the notes, like the Obsidian plugin keeps them.
  const inkAttachments = useMemo(() => {
    if (remoteClient) return null;
    const pickNote = async () => window.prompt(textRef.current.linkNotePrompt)?.trim() || null;
    const openNote = (target: string) => {
      const match = files.find((entry) => entry.title.toLowerCase() === target.toLowerCase());
      if (match) void loadFile(match.path).catch(() => undefined);
    };
    return store.kind === "folder" ? folderInkAttachments(BloomFolder, { pickNote, openNote }) : appInkAttachments({ pickNote, openNote });
  }, [files, loadFile, remoteClient, store]);

  const visibleFiles = filter.trim()
    ? files.filter((entry) => `${entry.folder}/${entry.title}`.toLowerCase().includes(filter.trim().toLowerCase()))
    : files;

  if (loading) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-[#FAFAFA]">
        <div className="text-[#999] text-lg font-[var(--font-display,Outfit,sans-serif)]">{t.loading}</div>
      </div>
    );
  }

  return (
    <InkAttachmentsContext.Provider value={inkAttachments}>
    <div className="h-full flex flex-col bg-[#FAFAFA]">
      <input ref={fileInputRef} type="file" accept=".md,.markdown,text/markdown,text/plain" className="hidden" onChange={handleImport} />
      {/* Header — compact for mobile */}
      <header className="h-12 border-b border-[#E8E4DF] bg-white flex items-center px-3 shrink-0">
        <button
          onClick={() => setDrawerOpen(!drawerOpen)}
          aria-label={text.openFiles}
          title={text.openFiles}
          data-testid="mobile-files-toggle"
          className="p-2 rounded-lg hover:bg-[#F5F3F0] text-[#999] active:bg-[#E8E4DF] min-w-[44px] min-h-[44px] flex items-center justify-center"
        >
          <Menu size={20} />
        </button>
        <h1 className="ml-2 text-base font-bold font-[var(--font-display,Outfit,sans-serif)] text-[#1A1A1A] tracking-tight">
          Bloom<span className="font-normal text-[#666]">MD</span>
        </h1>
        {document && (
          <span className="ml-2 hidden min-w-0 flex-1 truncate text-xs text-[#999] sm:inline">
            {document.frontmatter.title}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center">
          <button
            onClick={handleSave}
            aria-label={saved ? text.saved : text.save}
            title={saved ? text.saved : text.save}
            disabled={!document || saving}
            className={`p-2 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center ${saved ? "text-[#FF6B35]" : "text-[#999] active:bg-[#F5F3F0]"} disabled:opacity-30`}
          >
            {saved ? <Check size={20} /> : <Save size={20} />}
          </button>
          <button
            onClick={handleShare}
            aria-label={text.shareMarkdown}
            title={text.shareMarkdown}
            disabled={!document}
            className="p-2 rounded-lg text-[#999] active:bg-[#F5F3F0] min-w-[44px] min-h-[44px] flex items-center justify-center disabled:opacity-30"
          >
            <Share2 size={20} />
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label={text.closeError} title={text.closeError} className="grid h-7 w-7 shrink-0 place-items-center rounded"><X size={15} aria-hidden="true" /></button>
        </div>
      )}

      {/* File drawer overlay */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 bg-[#1A1A1A]/20 z-40" onClick={() => setDrawerOpen(false)} />
          <aside className="fixed left-0 top-0 bottom-0 w-72 bg-white shadow-2xl z-50 flex flex-col border-r border-[#E8E4DF] pt-[env(safe-area-inset-top)]">
            <div className="h-12 border-b border-[#E8E4DF] flex items-center justify-between px-4">
              <h2 className="text-sm font-semibold font-[var(--font-display,Outfit,sans-serif)] text-[#1A1A1A]">{t.mindmaps}</h2>
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label={text.closeFiles}
                title={text.closeFiles}
                className="p-2 rounded-lg text-[#999] active:bg-[#F5F3F0] min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 border-b border-[#E8E4DF] p-2">
              <button type="button" onClick={() => void handleNew()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#E8E4DF] text-xs font-semibold"><FilePlus size={16} aria-hidden="true" />{text.newMap}</button>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#E8E4DF] text-xs font-semibold"><Upload size={16} aria-hidden="true" />{text.importMap}</button>
              <button type="button" onClick={() => setHelpOpen(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#E8E4DF] text-xs font-semibold"><CircleHelp size={16} aria-hidden="true" />{text.help}</button>
            </div>
            {!remoteClient && (
              <div className="grid gap-2 border-b border-[#E8E4DF] p-3" data-testid="mobile-store">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#666]">
                  {store.kind === "folder" ? <FolderOpen size={15} className="text-[#FF6B35]" /> : <Tablet size={15} className="text-[#FF6B35]" />}
                  <span className="min-w-0 truncate">{store.kind === "app" ? text.onThisDevice : store.name}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => void openFolder()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#E8E4DF] text-xs font-semibold"><FolderOpen size={15} aria-hidden="true" />{text.openFolder}</button>
                  <button type="button" onClick={() => void useAppFolder()} disabled={store.kind === "app"} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#E8E4DF] text-xs font-semibold disabled:opacity-40"><Tablet size={15} aria-hidden="true" />{text.appFolderOnly}</button>
                </div>
                <p className="text-[11px] leading-4 text-[#999]">{text.folderHint}</p>
              </div>
            )}
            <div className="grid gap-2 border-b border-[#E8E4DF] p-3" data-testid="mobile-account">
              {account ? (
                <>
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#666]">
                    {remoteClient ? <Cloud size={15} className="shrink-0 text-[#FF6B35]" aria-hidden="true" /> : <CloudOff size={15} className="shrink-0 text-[#999]" aria-hidden="true" />}
                    <span className="min-w-0 truncate">{remoteClient ? authText.connected : authText.signedInAs}: {account.user.name || account.user.email}</span>
                  </div>
                  {account.user.name && <div className="truncate pl-6 text-[11px] text-[#999]">{account.user.email}</div>}
                  <div className="grid grid-cols-2 gap-2">
                    {remoteClient ? (
                      <button type="button" onClick={() => void disconnectRemote()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#E8E4DF] text-xs font-semibold"><Tablet size={15} aria-hidden="true" />{authText.workLocal}</button>
                    ) : (
                      <button type="button" onClick={() => void connectRemote(account)} disabled={remoteConnecting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#FF6B35] text-xs font-semibold text-white disabled:opacity-50"><Cloud size={15} aria-hidden="true" />{remoteConnecting ? authText.connecting : authText.connect}</button>
                    )}
                    <button type="button" onClick={() => void signOut()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#E8E4DF] text-xs font-semibold"><LogOut size={15} aria-hidden="true" />{authText.signOut}</button>
                  </div>
                  {/* Accounts can be created in the sign-in browser, so deleting one must be reachable from the app (App Store 5.1.1(v)). */}
                  <button type="button" onClick={() => void Browser.open({ url: `${account.serverUrl}/account?lang=${locale === "en" ? "en" : "de"}`, presentationStyle: "popover" })} className="min-h-9 text-left text-[11px] font-semibold text-[#666] underline underline-offset-2" data-testid="mobile-manage-account">{text.manageAccount}</button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#666]"><Cloud size={15} className="text-[#FF6B35]" aria-hidden="true" /> {authText.signInTitle}</div>
                  <button type="button" onClick={() => void startSignIn()} disabled={signingIn} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#FF6B35] text-xs font-semibold text-white disabled:opacity-50" data-testid="mobile-sign-in"><LogIn size={15} aria-hidden="true" />{signingIn ? authText.signingIn : authText.signIn}</button>
                  <p className="text-[11px] leading-4 text-[#999]">{authText.signInHint}</p>
                  <details className="text-xs">
                    <summary className="min-h-9 cursor-pointer py-2 font-semibold text-[#666]">{authText.advanced}</summary>
                    <label className="grid gap-1 text-[11px] font-semibold text-[#666]">
                      {authText.serverLabel}
                      <input value={remoteUrl} onChange={(event) => setRemoteUrl(event.target.value)} placeholder={DEFAULT_SERVER} className="h-10 rounded-md border border-[#E8E4DF] px-2 text-xs font-normal" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                    </label>
                    <p className="mt-1 text-[11px] leading-4 text-[#999]">{authText.serverHint}</p>
                  </details>
                </>
              )}
            </div>
            {files.length > 8 && (
              <label className="flex items-center gap-2 border-b border-[#E8E4DF] px-3 py-2">
                <Search size={15} className="shrink-0 text-[#999]" aria-hidden="true" />
                <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={text.filterNotes} aria-label={text.filterNotes} className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none" />
              </label>
            )}
            {truncated && (
              <p className="border-b border-[#E8E4DF] px-3 py-2 text-[11px] leading-4 text-[#999]" data-testid="mobile-list-truncated">
                {text.truncated(files.length)}
              </p>
            )}
            <div className="flex-1 overflow-y-auto p-2">
              {visibleFiles.map((entry) => {
                const isActive = document?.filePath === entry.path || (entry.frontmatter?.id !== undefined && document?.frontmatter.id === entry.frontmatter.id);
                return (
                  <div key={entry.path} className={`mb-1 flex items-center rounded-md border ${isActive ? "border-[#FFD4BF] bg-[#FFF4EE]" : "border-transparent"}`}>
                    <button
                      onClick={() => { void loadFile(entry.path).catch(() => undefined); setDrawerOpen(false); }}
                      disabled={!entry.local}
                      title={entry.local ? entry.path : text.stillDownloading}
                      className="min-h-11 min-w-0 flex-1 px-3 py-2 text-left disabled:opacity-50"
                    >
                      <div className={`flex items-center gap-1.5 truncate text-sm font-semibold ${isActive ? "text-[#FF6B35]" : "text-[#1A1A1A]"}`}>
                        {!entry.local && <CloudDownload size={14} className="shrink-0" aria-label={text.downloadingFromICloud} />}
                        <span className="truncate">{entry.title}</span>
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[11px] text-[#999]">{entry.folder || entry.path}</div>
                    </button>
                    <button type="button" onClick={() => void handleDelete(entry.path)} aria-label={text.deleteNote(entry.title)} title={text.deleteFile} className="grid h-11 w-11 shrink-0 place-items-center rounded text-[#999] active:bg-red-50 active:text-red-700"><Trash2 size={16} aria-hidden="true" /></button>
                  </div>
                );
              })}
            </div>
          </aside>
        </>
      )}

      {/* Help */}
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />

      {/* Canvas */}
      <div className="flex-1 min-h-0 relative lg:flex">
        <div className="relative h-full min-w-0 lg:flex-1">
        {document ? <MindMapCanvas /> : (
          <div className="grid h-full place-items-center px-6 text-center">
            <div>
              <h2 className="text-lg font-semibold text-[#1A1A1A]">{text.noMapOpen}</h2>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => void handleNew()} className="inline-flex h-11 items-center gap-2 rounded-md bg-[#1A1A1A] px-4 text-sm font-semibold text-white"><FilePlus size={17} aria-hidden="true" />{text.newMap}</button>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex h-11 items-center gap-2 rounded-md border border-[#D4CFC8] bg-white px-4 text-sm font-semibold"><Upload size={17} aria-hidden="true" />{text.importMap}</button>
                <button type="button" onClick={() => (files.length > 0 ? setDrawerOpen(true) : void openFolder())} className="inline-flex h-11 items-center gap-2 rounded-md border border-[#D4CFC8] bg-white px-4 text-sm font-semibold"><FolderOpen size={17} aria-hidden="true" />{files.length > 0 ? text.pickNote : text.openFolder}</button>
              </div>
            </div>
          </div>
        )}
        </div>

        {/* Mobile bottom sheet editor */}
        {selectedNodeId && editorVisible && (
          <div className="absolute inset-x-0 bottom-0 z-30 max-h-[50dvh] bg-white border-t border-[#E8E4DF] rounded-t-2xl shadow-[0_-4px_24px_rgba(26,26,26,0.1)] flex flex-col overflow-hidden pb-[env(safe-area-inset-bottom)] lg:static lg:z-auto lg:h-full lg:max-h-none lg:w-[400px] lg:shrink-0 lg:rounded-none lg:border-t-0 lg:border-l lg:shadow-none" data-testid="mobile-node-editor">
            {/* Drag handle */}
            <div className="flex justify-center py-2 shrink-0">
              <div className="w-10 h-1 rounded-full bg-[#D4CFC8]" />
            </div>
            {/* Close button */}
            <button
              onClick={() => setSelectedNodeId(null)}
              aria-label={text.closeEditor}
              title={text.closeEditor}
              className="absolute top-2 right-3 p-2 rounded-lg text-[#999] active:bg-[#F5F3F0] min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <X size={18} aria-hidden="true" />
            </button>
            {/* Editor */}
            <div className="flex-1 overflow-y-auto">
              <LazyNodeEditor embedded />
            </div>
          </div>
        )}
      </div>
    </div>
    </InkAttachmentsContext.Provider>
  );
}
