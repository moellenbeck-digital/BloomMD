/**
 * Pure state handling for the document tab bar.
 *
 * Kept apart from page.tsx so the rules (stable order, eviction, neighbour on close, where "back"
 * leads) are unit-testable without rendering the app.
 */

export const MAX_OPEN_TABS = 10;

/** Where a tab was opened from: the workspace map, or another document's tab. */
export type TabOrigin = { kind: "map" } | { kind: "document"; key: string };

export interface OpenTab {
  /** Identity: source + workspace + filename. A bare filename is not unique across workspaces. */
  key: string;
  /** Cloud: file name inside the workspace. Local: path inside the opened folder. */
  filename: string;
  title: string;
  source: "cloud" | "local";
  /** Cloud workspace the tab belongs to; null for the default/filesystem workspace. */
  workspaceId: string | null;
  origin?: TabOrigin;
}

export interface TabIdentity {
  source: OpenTab["source"];
  workspaceId: string | null;
  filename: string;
}

export function tabKey({ source, workspaceId, filename }: TabIdentity): string {
  return source === "local" ? `local:${filename}` : `cloud:${workspaceId ?? ""}:${filename}`;
}

function scopeOf(tab: Pick<OpenTab, "source" | "workspaceId">): string {
  return tab.source === "local" ? "local" : `cloud:${tab.workspaceId ?? ""}`;
}

export interface UpsertOptions {
  /** Key of the open document; it is never evicted. */
  activeKey: string | null;
  /** Keys of tabs with unsaved changes; they are never evicted. */
  unsavedKeys: ReadonlySet<string>;
  /** Replaces the remembered origin when given (an explicit open from the map or a link). */
  origin?: TabOrigin;
}

/**
 * Adds a tab at the end or refreshes an existing one in place. Activating a tab never moves it.
 * Past {@link MAX_OPEN_TABS} per workspace the oldest tab that is neither active nor unsaved goes.
 */
export function upsertTab(
  tabs: readonly OpenTab[],
  incoming: Omit<OpenTab, "key" | "origin">,
  options: UpsertOptions,
): OpenTab[] {
  const key = tabKey(incoming);
  const origin = options.origin && !(options.origin.kind === "document" && options.origin.key === key) ? options.origin : undefined;
  const existing = tabs.find((tab) => tab.key === key);
  if (existing) {
    const next = { ...existing, title: incoming.title, ...(origin ? { origin } : {}) };
    if (next.title === existing.title && next.origin === existing.origin) return tabs as OpenTab[];
    return tabs.map((tab) => (tab.key === key ? next : tab));
  }

  let next = [...tabs, { ...incoming, key, ...(origin ? { origin } : {}) }];
  const scope = scopeOf(incoming);
  while (next.filter((tab) => scopeOf(tab) === scope).length > MAX_OPEN_TABS) {
    const victim = next.find(
      (tab) => scopeOf(tab) === scope && tab.key !== key && tab.key !== options.activeKey && !options.unsavedKeys.has(tab.key),
    );
    if (!victim) break;
    next = removeTab(next, victim.key);
  }
  return next;
}

/** Removes a tab; tabs that were opened from it inherit its own origin so "back" never dangles. */
export function removeTab(tabs: readonly OpenTab[], key: string): OpenTab[] {
  const removed = tabs.find((tab) => tab.key === key);
  return tabs
    .filter((tab) => tab.key !== key)
    .map((tab) => {
      if (tab.origin?.kind !== "document" || tab.origin.key !== key) return tab;
      const { origin: _dropped, ...rest } = tab;
      return removed?.origin ? { ...rest, origin: removed.origin } : rest;
    });
}

export interface CloseResult {
  tabs: OpenTab[];
  /** The tab to activate when the closed one was active: right neighbour, else left; null if none. */
  neighbour: OpenTab | null;
}

/** `visible` is the tab bar as shown (order and membership), which decides the neighbour. */
export function closeTab(tabs: readonly OpenTab[], visible: readonly OpenTab[], key: string): CloseResult {
  const index = visible.findIndex((tab) => tab.key === key);
  const neighbour = index < 0 ? null : (visible[index + 1] ?? visible[index - 1] ?? null);
  return { tabs: removeTab(tabs, key), neighbour };
}

/** Follows a cloud file rename: identity and filename change, order and origin links stay. */
export function renameTabFile(
  tabs: readonly OpenTab[],
  from: TabIdentity,
  toFilename: string,
): OpenTab[] {
  const oldKey = tabKey(from);
  const newKey = tabKey({ ...from, filename: toFilename });
  if (oldKey === newKey || !tabs.some((tab) => tab.key === oldKey)) return tabs as OpenTab[];
  return tabs
    .filter((tab) => tab.key !== newKey)
    .map((tab) => {
      const origin = tab.origin?.kind === "document" && tab.origin.key === oldKey ? { kind: "document" as const, key: newKey } : tab.origin;
      const renamed = tab.key === oldKey ? { ...tab, key: newKey, filename: toFilename } : tab;
      return origin === tab.origin ? renamed : { ...renamed, origin };
    });
}

export type BackTarget = { kind: "map" } | { kind: "document"; tab: OpenTab };

/**
 * Where "back" leads from the active tab, or null when there is nowhere to go — the UI then shows
 * no back action instead of a dead one.
 */
export function backTarget(
  tabs: readonly OpenTab[],
  activeKey: string | null,
  mapAvailable: boolean,
): BackTarget | null {
  const active = tabs.find((tab) => tab.key === activeKey);
  const origin = active?.origin;
  if (!origin) return null;
  if (origin.kind === "map") return mapAvailable ? { kind: "map" } : null;
  const tab = tabs.find((candidate) => candidate.key === origin.key);
  return tab ? { kind: "document", tab } : null;
}

/** Only cloud tabs survive a reload; a local folder handle does not. Origins are session-only. */
export function serializeTabs(tabs: readonly OpenTab[]): string {
  return JSON.stringify(
    tabs
      .filter((tab) => tab.source === "cloud")
      .map(({ key, filename, title, workspaceId }) => ({ key, filename, title, workspaceId })),
  );
}

/** Reads the stored tabs, including the former `{filename,title}` shape; anything invalid is dropped. */
export function parseStoredTabs(raw: string | null): OpenTab[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.warn("[BloomMD] Stored document tabs are unreadable and were reset:", error);
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const tabs: OpenTab[] = [];
  for (const entry of parsed as unknown[]) {
    if (typeof entry !== "object" || entry === null) continue;
    const { filename, title, workspaceId } = entry as Record<string, unknown>;
    if (typeof filename !== "string" || !filename) continue;
    const identity: TabIdentity = {
      source: "cloud",
      workspaceId: typeof workspaceId === "string" ? workspaceId : null,
      filename,
    };
    const key = tabKey(identity);
    if (tabs.some((tab) => tab.key === key)) continue;
    tabs.push({ ...identity, key, title: typeof title === "string" && title ? title : filename });
  }
  return tabs.slice(0, MAX_OPEN_TABS * 4);
}
