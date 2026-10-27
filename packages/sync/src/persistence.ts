import { createSqlClient, type SqlClient } from "./sql-client";
import {
  FileStore,
  parseFile,
  serializeToMarkdown,
  type MindMapDocument,
} from "@bloommd/core";
import { AGENT_ACCESS, accessFor, cloudAreaOf, type AgentAccess, type AgentAccessConfig } from "@bloommd/core/agent-ledger";
import type { PersistenceOperation, RoomDescriptor, SyncServerConfig } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An unknown stored right never grants more than a proposal (the same rule as the web app). */
function agentAccessOrPropose(value: unknown): AgentAccess {
  return AGENT_ACCESS.includes(value as AgentAccess) ? (value as AgentAccess) : "propose";
}

export class SyncDocumentVersionConflictError extends Error {
  constructor() {
    super("VERSION_CONFLICT");
    this.name = "SyncDocumentVersionConflictError";
  }
}

export class SyncDocumentNotFoundError extends Error {
  constructor() {
    super("DOCUMENT_NOT_FOUND");
    this.name = "SyncDocumentNotFoundError";
  }
}

/** A persistence adapter may throw this only when it knows no write reached storage. */
export class SyncRetryablePersistenceError extends Error {
  constructor(message = "PERSISTENCE_UNAVAILABLE") {
    super(message);
    this.name = "SyncRetryablePersistenceError";
  }
}

/** A storage response was interrupted after a write might have committed. Never retry blindly. */
export class SyncPersistenceCommitUnknownError extends Error {
  constructor(message = "PERSISTENCE_COMMIT_UNKNOWN") {
    super(message);
    this.name = "SyncPersistenceCommitUnknownError";
  }
}

/** A persistence timeout does not prove that the underlying write did not commit. */
export class SyncPersistenceTimeoutError extends SyncPersistenceCommitUnknownError {
  constructor(message = "PERSISTENCE_TIMEOUT") {
    super(message);
    this.name = "SyncPersistenceTimeoutError";
  }
}

/** Storage rejected the actor; retries cannot improve authorization. */
export class SyncPersistenceAuthorizationError extends Error {
  constructor(message = "PERSISTENCE_ACCESS_DENIED") {
    super(message);
    this.name = "SyncPersistenceAuthorizationError";
  }
}

/** The supplied persistence payload is invalid; retries cannot repair it. */
export class SyncPersistenceValidationError extends Error {
  constructor(message = "PERSISTENCE_VALIDATION_FAILED") {
    super(message);
    this.name = "SyncPersistenceValidationError";
  }
}

/** Durable data cannot be trusted until it has been repaired explicitly. */
export class SyncPersistenceCorruptionError extends Error {
  constructor(message = "PERSISTENCE_CORRUPTION") {
    super(message);
    this.name = "SyncPersistenceCorruptionError";
  }
}

export interface DocumentRenameResult {
  documentId: string;
  filename: string;
  version: number;
}

export interface DocumentPersistence {
  authorize(descriptor: RoomDescriptor): Promise<"read" | "write">;
  load(descriptor: RoomDescriptor): Promise<MindMapDocument>;
  save(descriptor: RoomDescriptor, document: MindMapDocument, operation?: PersistenceOperation): Promise<MindMapDocument>;
  /**
   * Confirms whether a named operation reached durable storage after an interrupted response.
   * Returning null is deliberately not enough evidence to retry an unknown commit.
   */
  confirmSave?(descriptor: RoomDescriptor, operation: PersistenceOperation): Promise<MindMapDocument | null>;
  create?(descriptor: RoomDescriptor, document: MindMapDocument): Promise<MindMapDocument>;
  rename?(descriptor: RoomDescriptor, newFilename: string, expectedVersion?: number): Promise<DocumentRenameResult>;
  delete?(descriptor: RoomDescriptor, expectedVersion?: number): Promise<void>;
}

export function createFilePersistence(config: SyncServerConfig): DocumentPersistence {
  const store = new FileStore({ baseDir: config.baseDir, backupsEnabled: false });
  return {
    authorize: async (descriptor) => descriptor.permission ?? "write",
    load: (descriptor) => store.read(descriptor.filename),
    async save(_descriptor, document) {
      await store.write(document);
      return document;
    },
  };
}

/** Cloud persistence against any TLS-reachable Postgres, including CloudNativePG. */
export function createDatabasePersistence(databaseUrl: string): DocumentPersistence {
  const sql: SqlClient = createSqlClient(databaseUrl);
  // sql.json stores an object; JSON.stringify(...)::jsonb would store a JSON string instead.
  const jsonb = (value: unknown) => sql.json(value as Parameters<SqlClient["json"]>[0]);

  return {
    async authorize(descriptor) {
      if (!descriptor.documentId || !descriptor.workspaceId || !descriptor.userId) {
        throw new Error("Cloud sync requires document, workspace, and user ids.");
      }
      // A ticket made for an access token names it: the connection is only as good as the token is
      // now (not revoked, not expired, still bound to this workspace) and, for an agent token, the
      // right of its owner for the map's area. The ticket lifetime does not matter for that.
      const tokenId = descriptor.tokenId ?? null;
      if (tokenId !== null && !UUID.test(tokenId)) throw new Error("Cloud document not found or access denied.");
      const rows = await sql`
        select m.role, d.filename, t.id as token_id, t.agent_name, t.scope
        from bloom_documents d
        join bloom_workspace_members m on m.workspace_id = d.workspace_id
        left join bloom_access_tokens t
          on t.id = ${tokenId}::uuid
          and t.user_id = m.user_id
          and t.revoked_at is null
          and (t.expires_at is null or t.expires_at > now())
          and (t.workspace_ids is null or cardinality(t.workspace_ids) = 0 or d.workspace_id = any(t.workspace_ids))
        where d.id = ${descriptor.documentId}
          and d.workspace_id = ${descriptor.workspaceId}
          and m.user_id = ${descriptor.userId}
          and d.deleted_at is null
        limit 1
      `;
      const row = rows[0] as { role?: string; filename?: string; token_id?: string | null; agent_name?: string | null; scope?: string | null } | undefined;
      if (!row?.role) throw new Error("Cloud document not found or access denied.");
      if (tokenId !== null && !row.token_id) throw new Error("Access token revoked, expired or not valid for this workspace.");
      if (row.role === "viewer" || row.scope === "read") return "read";
      if (tokenId !== null && row.agent_name) {
        // The map's current file name decides the area (it can have been renamed since the ticket).
        const [defaults, areas] = await Promise.all([
          sql`select default_access from bloom_agent_token_rights where access_token_id = ${tokenId} and workspace_id = ${descriptor.workspaceId}`,
          sql`select area, access from bloom_agent_token_area_rights where access_token_id = ${tokenId} and workspace_id = ${descriptor.workspaceId}`,
        ]);
        const rights: AgentAccessConfig = {
          access: agentAccessOrPropose((defaults[0] as { default_access?: string } | undefined)?.default_access),
          areas: Object.fromEntries((areas as unknown as Array<{ area: string; access: string }>).map((entry) => [entry.area, agentAccessOrPropose(entry.access)])),
        };
        // A live session would bypass proposals and the change log: an agent edits live only where it may write.
        if (accessFor(rights, cloudAreaOf(row.filename ?? "")) !== "write") return "read";
      }
      return "write";
    },
    async load(descriptor) {
      if (!descriptor.documentId || !descriptor.workspaceId || !descriptor.userId) {
        throw new Error("Cloud sync requires document, workspace, and user ids.");
      }
      const rows = await sql`
        select d.id, d.workspace_id, d.filename, d.markdown, d.version
        from bloom_documents d
        join bloom_workspace_members m on m.workspace_id = d.workspace_id
        where d.id = ${descriptor.documentId}
          and d.workspace_id = ${descriptor.workspaceId}
          and m.user_id = ${descriptor.userId}
          and d.deleted_at is null
        limit 1
      `;
      const row = rows[0] as {
        id: string;
        workspace_id: string;
        filename: string;
        markdown: string;
        version: string | number;
      } | undefined;
      if (!row) throw new Error("Cloud document not found or access denied.");
      const document = parseFile(row.filename, row.markdown);
      document.storage = {
        mode: "database",
        documentId: row.id,
        workspaceId: row.workspace_id,
        version: Number(row.version),
      };
      return document;
    },

    async save(descriptor, document, operation) {
      if (!descriptor.documentId || !descriptor.workspaceId || !descriptor.userId) {
        throw new Error("Cloud sync requires document, workspace, and user ids.");
      }
      const expectedVersion = document.storage?.version;
      if (expectedVersion == null) throw new Error("Cloud document version is missing.");
      const markdown = serializeToMarkdown(document);
      const rows = await sql`
        update bloom_documents
        set markdown = ${markdown},
            frontmatter = ${jsonb(document.frontmatter)},
            version = version + 1,
            updated_by = ${descriptor.userId ?? null},
            updated_at = now(),
            sync_persistence_operation_id = ${operation?.id ?? null},
            sync_persistence_base_version = ${operation?.expectedVersion ?? null}
        where id = ${descriptor.documentId}
          and workspace_id = ${descriptor.workspaceId}
          and version = ${expectedVersion}
          and deleted_at is null
          and exists (
            select 1
            from bloom_workspace_members m
            where m.workspace_id = bloom_documents.workspace_id
              and m.user_id = ${descriptor.userId}
              and m.role in ('owner', 'editor')
          )
        returning version
      `;
      const row = rows[0] as { version: string | number } | undefined;
      if (!row) {
        throw new SyncDocumentVersionConflictError();
      }
      return {
        ...document,
        storage: {
          mode: "database",
          documentId: descriptor.documentId,
          workspaceId: descriptor.workspaceId,
          version: Number(row.version),
        },
      };
    },
    async confirmSave(descriptor, operation) {
      if (!descriptor.documentId || !descriptor.workspaceId || !descriptor.userId) {
        throw new Error("Cloud sync requires document, workspace, and user ids.");
      }
      const rows = await sql`
        select d.id, d.workspace_id, d.filename, d.markdown, d.version
        from bloom_documents d
        join bloom_workspace_members m on m.workspace_id = d.workspace_id
        where d.id = ${descriptor.documentId}
          and d.workspace_id = ${descriptor.workspaceId}
          and d.sync_persistence_operation_id = ${operation.id}
          and d.sync_persistence_base_version = ${operation.expectedVersion ?? null}
          and d.version = ${(operation.expectedVersion ?? -1) + 1}
          and d.deleted_at is null
          and m.user_id = ${descriptor.userId}
          and m.role in ('owner', 'editor')
        limit 1
      `;
      const row = rows[0] as {
        id: string;
        workspace_id: string;
        filename: string;
        markdown: string;
        version: string | number;
      } | undefined;
      if (!row) return null;
      const document = parseFile(row.filename, row.markdown);
      document.storage = {
        mode: "database",
        documentId: row.id,
        workspaceId: row.workspace_id,
        version: Number(row.version),
      };
      return document;
    },
    async create(descriptor, document) {
      if (!descriptor.workspaceId || !descriptor.userId) {
        throw new Error("Cloud sync requires workspace and user ids.");
      }
      const markdown = serializeToMarkdown(document);
      const rows = await sql`
        insert into bloom_documents (workspace_id, filename, markdown, frontmatter, created_by, updated_by)
        select ${descriptor.workspaceId}, ${descriptor.filename}, ${markdown},
               ${jsonb(document.frontmatter)}, ${descriptor.userId}, ${descriptor.userId}
        where exists (
          select 1
          from bloom_workspace_members m
          where m.workspace_id = ${descriptor.workspaceId}
            and m.user_id = ${descriptor.userId}
            and m.role in ('owner', 'editor')
        )
        on conflict (workspace_id, lower(filename)) where deleted_at is null do nothing
        returning id, workspace_id, filename, markdown, version
      `;
      const row = rows[0] as {
        id: string;
        workspace_id: string;
        filename: string;
        markdown: string;
        version: string | number;
      } | undefined;
      if (!row) throw new Error("DOCUMENT_FILENAME_CONFLICT");
      const created = parseFile(row.filename, row.markdown);
      created.storage = {
        mode: "database",
        documentId: row.id,
        workspaceId: row.workspace_id,
        version: Number(row.version),
      };
      return created;
    },
    async rename(descriptor, newFilename, expectedVersion) {
      if (!descriptor.documentId || !descriptor.workspaceId || !descriptor.userId) {
        throw new Error("Cloud sync requires document, workspace, and user ids.");
      }
      const rows = await sql`
        update bloom_documents d
        set filename = ${newFilename},
            updated_by = ${descriptor.userId},
            updated_at = now(),
            version = version + 1,
            sync_persistence_operation_id = null,
            sync_persistence_base_version = null
        where d.id = ${descriptor.documentId}
          and d.workspace_id = ${descriptor.workspaceId}
          and d.deleted_at is null
          and (${expectedVersion == null} or d.version = ${expectedVersion ?? 0})
          and exists (
            select 1
            from bloom_workspace_members m
            where m.workspace_id = d.workspace_id
              and m.user_id = ${descriptor.userId}
              and m.role in ('owner', 'editor')
          )
        returning d.id, d.filename, d.version
      `;
      const row = rows[0] as { id: string; filename: string; version: string | number } | undefined;
      if (!row) {
        if (expectedVersion != null) throw new SyncDocumentVersionConflictError();
        throw new SyncDocumentNotFoundError();
      }
      return { documentId: row.id, filename: row.filename, version: Number(row.version) };
    },
    async delete(descriptor, expectedVersion) {
      if (!descriptor.documentId || !descriptor.workspaceId || !descriptor.userId) {
        throw new Error("Cloud sync requires document, workspace, and user ids.");
      }
      const rows = await sql`
        update bloom_documents d
        set deleted_at = now(),
            updated_by = ${descriptor.userId},
            updated_at = now(),
            version = version + 1,
            sync_persistence_operation_id = null,
            sync_persistence_base_version = null
        where d.id = ${descriptor.documentId}
          and d.workspace_id = ${descriptor.workspaceId}
          and d.deleted_at is null
          and (${expectedVersion == null} or d.version = ${expectedVersion ?? 0})
          and exists (
            select 1
            from bloom_workspace_members m
            where m.workspace_id = d.workspace_id
              and m.user_id = ${descriptor.userId}
              and m.role in ('owner', 'editor')
          )
        returning d.id
      `;
      if (!rows[0]) {
        if (expectedVersion != null) throw new SyncDocumentVersionConflictError();
        throw new SyncDocumentNotFoundError();
      }
    },
  };
}
