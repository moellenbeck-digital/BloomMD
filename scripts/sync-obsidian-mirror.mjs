import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const root = resolve(process.env.BLOOMMD_MIRROR_ROOT ?? process.cwd());
const target = resolve(process.env.BLOOMMD_MIRROR_TARGET ?? "");
const mode = process.env.BLOOMMD_MIRROR_MODE ?? "sync";

if (!target) throw new Error("BLOOMMD_MIRROR_TARGET is required");

const pluginSource = join(root, "plugins", "obsidian");
const coreParserSource = join(root, "packages", "core", "src", "obsidian-markdown.ts");
const coreTypesSource = join(root, "packages", "core", "src", "types.ts");
const sharedDependenciesSource = join(pluginSource, "src", "shared-dependencies.ts");
const sharedRuntimeEntry = join(root, "scripts", "obsidian-mirror-shared-runtime.ts");
const sharedRuntimeTypesSource = join(root, "scripts", "obsidian-mirror-shared-runtime.d.ts");
// Handwriting is shared with the BloomMD apps in packages/ink. In the monorepo the plugin re-exports
// it; the standalone mirror carries a snapshot under the same file names, so imports stay unchanged.
const inkSource = join(root, "packages", "ink", "src");
// Learning progress (format and scheduling) is shared Core code; the mirror carries a snapshot too.
const learningSource = join(root, "packages", "core", "src", "learning.ts");
const generatedLearningPath = "src/learning.ts";
const inkModules = ["ink-geometry.ts", "ink-document.ts", "ink-state.ts", "ink-preview.tsx", "ink-editor.tsx", "pen-gestures.ts", "ink.css"];

// Agent rules shared with the wiki CLI: the plugin re-exports packages/core/src/agent-ledger.ts; the
// mirror carries a snapshot that imports the generated Markdown module instead of the Core entry.
const agentLedgerSource = join(root, "packages", "core", "src", "agent-ledger.ts");
const generatedAgentLedgerPath = "src/agent-ledger.ts";

const generatedParserPath = "src/markdown-document.ts";
const generatedTypesPath = "src/core-types.ts";
const generatedSharedDependenciesPath = "src/shared-dependencies.ts";
const generatedSharedRuntimePath = "src/shared-dependencies-runtime.js";
const generatedSharedRuntimeTypesPath = "src/shared-dependencies-runtime.d.ts";
const generatedMirrorPath = "MIRROR.json";

const excludedCanonicalPaths = new Set([
  "main.js",
  "shared-runtime.js",
  "styles.css",
  "bun.lock",
  "MIRROR.json",
  "package.json",
  generatedParserPath,
  generatedAgentLedgerPath,
  generatedSharedDependenciesPath,
  generatedLearningPath,
  ...inkModules.map((file) => `src/${file}`),
]);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if ([".git", "node_modules", "release"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

async function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readBytes(path) {
  return readFile(path);
}

async function hashManifest(entries) {
  const hash = createHash("sha256");
  for (const entry of entries.sort((left, right) => left.path.localeCompare(right.path))) {
    hash.update(entry.path);
    hash.update("\0");
    hash.update(entry.bytes);
    hash.update("\0");
  }
  return hash.digest("hex");
}

function manifestEntry(path, bytes) {
  return { path, bytes: Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes) };
}

function git(args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

async function canonicalManifest() {
  const pluginFiles = await walk(pluginSource);
  const entries = [];
  for (const path of pluginFiles) {
    const pathFromPlugin = relative(pluginSource, path);
    if (excludedCanonicalPaths.has(pathFromPlugin)) continue;
    entries.push({ path: `plugins/obsidian/${pathFromPlugin}`, bytes: await readBytes(path) });
  }
  entries.push({
    path: "packages/core/src/obsidian-markdown.ts",
    bytes: await readBytes(coreParserSource),
  });
  entries.push({ path: "packages/core/src/types.ts", bytes: await readBytes(coreTypesSource) });
  entries.push({ path: "packages/core/src/learning.ts", bytes: await readBytes(learningSource) });
  entries.push({ path: "packages/core/src/agent-ledger.ts", bytes: await readBytes(agentLedgerSource) });
  // The plugin's handwriting modules are re-exports of packages/ink: hash the shared sources.
  for (const file of inkModules) {
    entries.push({ path: `packages/ink/src/${file}`, bytes: await readBytes(join(inkSource, file)) });
  }
  entries.push({ path: "plugins/obsidian/src/shared-dependencies.ts", bytes: await readBytes(sharedDependenciesSource) });
  entries.push({ path: "scripts/obsidian-mirror-shared-runtime.ts", bytes: await readBytes(sharedRuntimeEntry) });
  entries.push({ path: "scripts/obsidian-mirror-shared-runtime.d.ts", bytes: await readBytes(sharedRuntimeTypesSource) });
  return entries;
}

async function buildSharedRuntime() {
  const result = await Bun.build({
    entrypoints: [sharedRuntimeEntry],
    target: "browser",
    format: "esm",
    minify: true,
    sourcemap: "none",
    write: false,
    // Obsidian's final esbuild pass owns the shared Yjs dependency. Leaving it external
    // here prevents a second Yjs constructor inside `shared-runtime.js`.
    external: ["yjs"],
  });
  if (!result.success) {
    const messages = result.logs.map((log) => log.message).join("\n");
    throw new Error(`Could not build standalone Obsidian shared runtime:\n${messages}`);
  }
  const output = result.outputs.find((entry) => entry.path.endsWith(".js"));
  if (!output) throw new Error("Standalone Obsidian shared runtime emitted no JavaScript output.");
  return Buffer.from(await output.arrayBuffer());
}

function sharedRuntimeTypes() {
  return `/**\n * GENERATED FILE — DO NOT EDIT.\n * Type contract for the standalone shared-document browser runtime.\n */\nimport type * as Y from "yjs";\nimport type { MindMapDocument } from "./core-types";\n\nexport type SharedDocumentConnectionState = "connected" | "offline" | "conflict" | "revoked";\n\nexport interface SharedDocumentBinding {\n  schemaVersion: 1;\n  workspaceId: string;\n  documentId: string;\n  cloudFilename: string;\n  lastAcknowledgedMarkdownHash: string;\n  lastKnownCloudVersion: number;\n  connectionState: SharedDocumentConnectionState;\n}\n\nexport interface SharedDocumentMirrorFileAdapter {\n  readMarkdown(): Promise<string>;\n  writeMarkdown(markdown: string): Promise<void>;\n}\n\nexport type SharedDocumentMirrorPublishResult =\n  | { kind: "acknowledged"; cloudVersion: number; markdownHash?: string }\n  | { kind: "conflict" }\n  | { kind: "revoked" };\n\nexport interface SharedDocumentMirrorOptions {\n  binding: SharedDocumentBinding;\n  file: SharedDocumentMirrorFileAdapter;\n  hashMarkdown(markdown: string): string;\n  publishLocalMarkdown(markdown: string, expectedCloudVersion: number): Promise<SharedDocumentMirrorPublishResult>;\n  onBindingChange?(binding: SharedDocumentBinding): void;\n  classifyPublishError?(error: unknown): "offline" | "revoked";\n}\n\nexport declare class SharedDocumentMirror {\n  constructor(options: SharedDocumentMirrorOptions);\n  getBinding(): SharedDocumentBinding;\n  handleLocalMarkdown(markdown: string): Promise<unknown>;\n  applyRemoteMarkdown(markdown: string, cloudVersion: number): Promise<unknown>;\n  markConnectionRestored(): Promise<SharedDocumentBinding>;\n  markConnectionLost(): Promise<SharedDocumentBinding>;\n  markAccessRevoked(): Promise<SharedDocumentBinding>;\n}\n\nexport interface WorkspaceSyncClientConfig {\n  baseUrl: string;\n  accessToken: string;\n  fetchImpl?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;\n}\n\nexport interface WorkspaceSyncWorkspace {\n  id: string;\n  name: string;\n  slug: string;\n  kind: "personal" | "team";\n  role: "owner" | "editor" | "viewer";\n}\n\nexport interface WorkspaceSyncContext {\n  workspace: WorkspaceSyncWorkspace | null;\n  workspaces: WorkspaceSyncWorkspace[];\n}\n\nexport declare class WorkspaceSyncClient {\n  constructor(config: WorkspaceSyncClientConfig);\n  listWorkspaces(): Promise<WorkspaceSyncContext>;\n  selectWorkspace(workspaceId: string): Promise<WorkspaceSyncContext>;\n  createDocument(filename: string, markdown: string): Promise<{ documentId: string; cloudVersion: number }>;\n  fetchSyncTicket(filename: string): Promise<{ websocketUrl: string; expiresAt: string; permission: "read" | "write" }>;\n  recordSharedDocumentBinding(action: "bound" | "unbound", documentId: string): Promise<void>;\n}\n\nexport type SyncStatus = "disconnected" | "connecting" | "reconnecting" | "connected" | "failed";\n\nexport interface SyncProviderOptions {\n  url: string;\n  doc: Y.Doc;\n  refreshUrl?: () => Promise<string>;\n  onStatusChange?: (status: SyncStatus) => void;\n  onAccessRevoked?: () => void;\n}\n\nexport declare class SyncProvider {\n  constructor(options: SyncProviderOptions);\n  getStatus(): SyncStatus;\n  setConnectionUrl(url: string, refreshUrl?: () => Promise<string>): void;\n  connect(): void;\n  disconnect(): void;\n}\n\nexport declare function createLocalSharedDocumentState(localMarkdownHash: string): { kind: "local"; localMarkdownHash: string };\nexport declare function transitionSharedDocumentState(state: unknown, event: unknown): unknown;\nexport declare function hashSharedDocumentMarkdown(markdown: string): string;\nexport declare function parseFile(filePath: string, raw: string): MindMapDocument;\nexport declare function serializeToMarkdown(document: MindMapDocument): string;\nexport declare function documentToYDoc(document: MindMapDocument, existingDoc?: Y.Doc, origin?: unknown): Y.Doc;\nexport declare function yDocToDocument(document: Y.Doc): MindMapDocument;\n`;
}

async function expectedFiles() {
  const parser = await readFile(coreParserSource, "utf8");
  const generatedParser = [
    "/**",
    " * GENERATED FILE — DO NOT EDIT.",
    " *",
    " * This standalone release snapshot is generated from",
    " * packages/core/src/obsidian-markdown.ts by the BloomMD mirror sync.",
    ` * Source SHA-256: ${await sha256(Buffer.from(parser))}`,
    " */",
    parser.replace('from "./types";', 'from "./core-types";'),
  ].join("\n");
  const agentLedger = await readFile(agentLedgerSource, "utf8");
  const agentLedgerSha256 = await sha256(Buffer.from(agentLedger));
  const generatedAgentLedger = [
    "/**",
    " * GENERATED FILE — DO NOT EDIT.",
    " * Snapshot of packages/core/src/agent-ledger.ts by the BloomMD mirror sync.",
    ` * Source SHA-256: ${agentLedgerSha256}`,
    " */",
    agentLedger.replace('from "./obsidian-markdown";', 'from "./markdown-document";'),
  ].join("\n");
  const types = await readFile(coreTypesSource, "utf8");
  const typesSha256 = await sha256(types);
  const generatedTypes = [
    "/**",
    " * GENERATED FILE — DO NOT EDIT.",
    " * Snapshot of packages/core/src/types.ts.",
    ` * Source SHA-256: ${typesSha256}`,
    " */",
    types,
  ].join("\n");
  const learning = await readFile(learningSource, "utf8");
  const learningSha256 = await sha256(Buffer.from(learning));
  const generatedLearning = [
    "/**",
    " * GENERATED FILE — DO NOT EDIT.",
    " * Snapshot of packages/core/src/learning.ts by the BloomMD mirror sync.",
    ` * Source SHA-256: ${learningSha256}`,
    " */",
    learning,
  ].join("\n");
  const sharedRuntime = await buildSharedRuntime();
  const generatedSharedDependencies = [
    "/**",
    " * GENERATED FILE — DO NOT EDIT.",
    " * Standalone facade for the embedded browser-safe shared-document runtime.",
    " */",
    "export { SharedDocumentMirror, WorkspaceSyncClient, createLocalSharedDocumentState, documentToYDoc, hashSharedDocumentMarkdown, parseFile, serializeToMarkdown, transitionSharedDocumentState, yDocToDocument, SyncProvider } from \"./shared-dependencies-runtime.js\";",
    "export type { SharedDocumentBinding, SharedDocumentConnectionState } from \"./shared-dependencies-runtime.js\";",
    "",
  ].join("\n");
  const packageJson = JSON.parse(await readFile(join(pluginSource, "package.json"), "utf8"));
  if (packageJson.dependencies?.["@bloommd/core"]) {
    delete packageJson.dependencies["@bloommd/core"];
  }
  if (packageJson.dependencies?.["@bloommd/ui"]) {
    delete packageJson.dependencies["@bloommd/ui"];
  }
  if (packageJson.dependencies?.["@bloommd/ink"]) {
    delete packageJson.dependencies["@bloommd/ink"];
  }
  const inkSnapshots = [];
  for (const file of inkModules) {
    const source = await readFile(join(inkSource, file), "utf8");
    const sourceSha256 = await sha256(Buffer.from(source));
    const generated = [
      "/**",
      " * GENERATED FILE — DO NOT EDIT.",
      ` * Snapshot of packages/ink/src/${file} by the BloomMD mirror sync.`,
      ` * Source SHA-256: ${sourceSha256}`,
      " */",
      source,
    ].join("\n");
    inkSnapshots.push({ file, sourceSha256, generated: Buffer.from(generated) });
  }
  // Obsidian's community-plugin review previously flagged the React 19 bundle for dynamic script
  // resource injection. Keep the public release snapshot on the reviewed React 18.3 line while
  // the monorepo itself follows the workspace-wide React 19 toolchain.
  packageJson.dependencies.react = "^18.3.1";
  packageJson.dependencies["react-dom"] = "^18.3.1";
  packageJson.devDependencies["@types/react"] = "^18.3.12";
  packageJson.devDependencies["@types/react-dom"] = "^18.3.1";
  const manifest = JSON.parse(await readFile(join(pluginSource, "manifest.json"), "utf8"));
  const sourceManifestSha256 = await hashManifest(await canonicalManifest());
  const sourceCommit = git(["rev-parse", "HEAD"]);
  const dirtyPaths = git([
    "status",
    "--porcelain",
    "--",
    "plugins/obsidian",
    "packages/core/src/obsidian-markdown.ts",
    "packages/core/src/types.ts",
    "packages/core/src/learning.ts",
    "packages/core/src/agent-ledger.ts",
    "plugins/obsidian/src/shared-dependencies.ts",
    "scripts/obsidian-mirror-shared-runtime.ts",
    "scripts/obsidian-mirror-shared-runtime.d.ts",
    "packages/ink/src",
  ]);
  const generated = new Map([
    [generatedParserPath, Buffer.from(generatedParser)],
    [generatedTypesPath, Buffer.from(generatedTypes)],
    [generatedLearningPath, Buffer.from(generatedLearning)],
    [generatedAgentLedgerPath, Buffer.from(generatedAgentLedger)],
    [generatedSharedDependenciesPath, Buffer.from(generatedSharedDependencies)],
    [generatedSharedRuntimePath, sharedRuntime],
    [generatedSharedRuntimeTypesPath, await readBytes(sharedRuntimeTypesSource)],
    ["package.json", Buffer.from(`${JSON.stringify(packageJson, null, 2)}\n`)],
    ...inkSnapshots.map((entry) => [`src/${entry.file}`, entry.generated]),
  ]);

  // This attestation describes the exact static source snapshot that is copied into the public
  // mirror. Unlike sourceManifestSha256 (which identifies canonical monorepo inputs), it can be
  // recomputed by the standalone release verifier. A tag therefore cannot carry a stale mirror
  // attestation after the generated source snapshot has changed.
  const releaseSnapshotEntries = [];
  for (const [path, bytes] of generated) releaseSnapshotEntries.push(manifestEntry(path, bytes));
  for (const path of await walk(pluginSource)) {
    const pathFromPlugin = relative(pluginSource, path);
    if (excludedCanonicalPaths.has(pathFromPlugin)) continue;
    releaseSnapshotEntries.push(manifestEntry(pathFromPlugin, await readBytes(path)));
  }

  const mirror = {
    format: 1,
    mode: "release-mirror",
    canonicalRepository: "moellenbeck-digital/BloomMD",
    canonicalPath: "plugins/obsidian",
    sourceCommit,
    sourceDirty: dirtyPaths.length > 0,
    sourceManifestSha256,
    releaseSnapshotSha256: await hashManifest(releaseSnapshotEntries),
    pluginVersion: manifest.version,
    core: {
      sourcePath: "packages/core/src/obsidian-markdown.ts",
      sourceSha256: await sha256(Buffer.from(parser)),
      generatedPath: generatedParserPath,
      generatedSha256: await sha256(Buffer.from(generatedParser)),
    },
    coreTypes: {
      sourcePath: "packages/core/src/types.ts",
      sourceSha256: typesSha256,
      generatedPath: generatedTypesPath,
      generatedSha256: await sha256(Buffer.from(generatedTypes)),
    },
    learning: {
      sourcePath: "packages/core/src/learning.ts",
      sourceSha256: learningSha256,
      generatedPath: generatedLearningPath,
      generatedSha256: await sha256(Buffer.from(generatedLearning)),
    },
    agentLedger: {
      sourcePath: "packages/core/src/agent-ledger.ts",
      sourceSha256: agentLedgerSha256,
      generatedPath: generatedAgentLedgerPath,
      generatedSha256: await sha256(Buffer.from(generatedAgentLedger)),
    },
    ink: await Promise.all(inkSnapshots.map(async (entry) => ({
      sourcePath: `packages/ink/src/${entry.file}`,
      sourceSha256: entry.sourceSha256,
      generatedPath: `src/${entry.file}`,
      generatedSha256: await sha256(entry.generated),
    }))),
    sharedRuntime: {
      sourcePath: "scripts/obsidian-mirror-shared-runtime.ts",
      sourceSha256: await sha256(await readBytes(sharedRuntimeEntry)),
      generatedPath: generatedSharedRuntimePath,
      generatedSha256: await sha256(sharedRuntime),
    },
  };

  return new Map([
    ...generated,
    [generatedMirrorPath, Buffer.from(`${JSON.stringify(mirror, null, 2)}\n`)],
  ]);
}

async function compare(path, expected) {
  try {
    const actual = await readBytes(join(target, path));
    return actual.equals(expected);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

const generated = await expectedFiles();

if (mode === "sync") {
  for (const [path, bytes] of generated) {
    await writeFile(join(target, path), bytes);
  }
  console.log(`Prepared standalone Obsidian mirror metadata in ${target}`);
} else if (mode === "check") {
  const mismatches = [];
  for (const [path, bytes] of generated) {
    if (!(await compare(path, bytes))) mismatches.push(path);
  }

  const pluginFiles = await walk(pluginSource);
  const expectedPaths = new Set(generated.keys());
  for (const path of pluginFiles) {
    const pathFromPlugin = relative(pluginSource, path);
    if (excludedCanonicalPaths.has(pathFromPlugin)) continue;
    expectedPaths.add(pathFromPlugin);
    const expected = await readBytes(path);
    if (!(await compare(pathFromPlugin, expected))) mismatches.push(pathFromPlugin);
  }

  // Build output, the standalone lockfile, and the release staging directory are intentionally
  // public-repository artifacts. Any other public-only file means the mirror has drifted or was
  // edited outside the canonical source tree.
  const targetFiles = await walk(target);
  for (const path of targetFiles) {
    const pathFromTarget = relative(target, path);
    if (["main.js", "shared-runtime.js", "styles.css", "bun.lock"].includes(pathFromTarget)) continue;
    if (pathFromTarget.endsWith("/.DS_Store") || pathFromTarget === ".DS_Store") continue;
    if (!expectedPaths.has(pathFromTarget)) mismatches.push(`unexpected ${pathFromTarget}`);
  }

  if (mismatches.length > 0) {
    console.error("Obsidian public mirror is out of sync:");
    for (const mismatch of [...new Set(mismatches)].sort()) console.error(`- ${mismatch}`);
    process.exitCode = 1;
  } else {
    console.log(`Obsidian public mirror matches the canonical monorepo inputs: ${target}`);
  }
} else {
  throw new Error(`Unknown BLOOMMD_MIRROR_MODE: ${mode}`);
}
