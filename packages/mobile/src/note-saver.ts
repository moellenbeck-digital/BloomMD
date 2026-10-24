/**
 * Autosave for the open note. Edits are saved after a quiet period, and right away before the app
 * switches to another note, folder or link and when it goes to the background, so no edit is
 * dropped. Each save belongs to the note it was made in: switching notes while a save is still
 * running never lets one note's content end up in another's file.
 */
import type { MindMapDocument } from "@bloommd/core/browser";
import { DEVICE } from "./platform";
import { StoreConflictError, type LoadedDocument, type MobileStore } from "./stores";

/** Label of the copy that keeps this device's edits when the note changed elsewhere ("iPad-Konflikt"). */
export const CONFLICT_COPY_LABEL = DEVICE.conflictLabel;

export interface NoteSaverEvents {
  onSaved?(path: string): void;
  /** The note changed (or was deleted) elsewhere. `copy` holds the iPad's edits, null if it could not be written. */
  onConflict?(conflict: { path: string; copy: string | null; current: boolean }): void;
  onError?(error: unknown, path: string): void;
}

interface Session {
  store: MobileStore;
  /** What was last read or written for this note; the next save is checked against it. */
  loaded: LoadedDocument;
  /** Latest edit not yet saved. */
  pending: MindMapDocument | null;
  /** Set after a conflict: the iPad's version went to a copy, later saves of this note are dropped. */
  conflicted: boolean;
}

export class NoteSaver {
  private session: Session | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Saves run one after another per file, so each is checked against the one before. */
  private readonly queues = new Map<string, Promise<void>>();

  constructor(
    private readonly events: NoteSaverEvents = {},
    private readonly delay = 1200,
  ) {}

  /** What was loaded for the open note, or null. */
  get loaded(): LoadedDocument | null {
    return this.session?.loaded ?? null;
  }

  /** Makes `loaded` the open note. Edits of the previous one still go to its own file. */
  open(store: MobileStore | null, loaded: LoadedDocument | null): void {
    this.commit();
    this.session = store && loaded ? { store, loaded, pending: null, conflicted: false } : null;
  }

  /** An edit of the open note; saved after the quiet period. */
  change(document: MindMapDocument | null): void {
    const session = this.session;
    if (!session || session.conflicted || !document || document === session.loaded.document) return;
    // A late edit of a note that is no longer open must not land in the open note's file.
    if (document.filePath !== session.loaded.document.filePath) return;
    session.pending = document;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.commit();
    }, this.delay);
  }

  /** Saves `latest` (or what is pending) now and waits for every save in flight. */
  async flush(latest?: MindMapDocument | null): Promise<void> {
    if (latest !== undefined) this.change(latest);
    this.commit();
    while (this.queues.size > 0) await Promise.all([...this.queues.values()]);
  }

  /** Starts saving the open note's pending edit. */
  private commit(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const session = this.session;
    if (!session?.pending) return;
    const document = session.pending;
    session.pending = null;
    const path = session.loaded.document.filePath;
    const previous = this.queues.get(path) ?? Promise.resolve();
    const run = previous.then(() => this.save(session, document, path)).catch((error: unknown) => this.events.onError?.(error, path));
    this.queues.set(path, run);
    void run.finally(() => {
      if (this.queues.get(path) === run) this.queues.delete(path);
    });
  }

  private async save(session: Session, document: MindMapDocument, path: string): Promise<void> {
    if (session.conflicted) return;
    try {
      const next = await session.store.save(session.loaded, document);
      // Updates only this note's record, even if another note was opened meanwhile.
      if (next) {
        session.loaded = next;
        this.events.onSaved?.(path);
      }
    } catch (error) {
      if (!(error instanceof StoreConflictError)) {
        this.events.onError?.(error, path);
        return;
      }
      // Keep the iPad's version as a note of its own before anything reloads the other one.
      const copy = await session.store.saveCopy(document, CONFLICT_COPY_LABEL).catch(() => null);
      session.conflicted = true;
      session.pending = null;
      this.events.onConflict?.({ path, copy, current: session === this.session });
    }
  }
}
