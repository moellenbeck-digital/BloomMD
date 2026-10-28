# BloomMD Wiki CLI

`bloommd-wiki` is the optional, local command-line tool for deterministic Markdown checks and
OKF/LLM Wiki bundles. It does not need a BloomMD server, an LLM, or an OpenClaw installation.

## Commands

```bash
# Wiki lifecycle
bloommd-wiki init ./wiki "My Knowledge Wiki"
bloommd-wiki status ./wiki
bloommd-wiki lint ./wiki
bloommd-wiki export ./wiki ./wiki-export --overwrite   # static, offline-readable copy
bloommd-wiki propose ./wiki ./changes.json ./proposal.json
bloommd-wiki approve ./proposal.json "reviewer"
bloommd-wiki apply ./wiki ./proposal.json
bloommd-wiki mcp ./wiki

# Live source checks: hashes come from the source folder, not from a hand-kept JSON file
bloommd-wiki status ./wiki --sources ./sources
bloommd-wiki lint ./wiki --sources ./sources
bloommd-wiki watch ./wiki --sources ./sources --state ./wiki-sources.state.json
bloommd-wiki watch ./wiki --sources ./sources --state ./wiki-sources.state.json --once --format json
bloommd-wiki mcp ./wiki --sources ./sources

# Markdown workspace checks
bloommd-wiki workspace lint ./docs --format github --strict
bloommd-wiki workspace check ./vault
bloommd-wiki workspace search "term" ./docs
bloommd-wiki workspace backlinks "Note.md" ./docs
```

The binary writes only where the command explicitly requests it: `init`, `index`, `log`,
`approve`, `apply`, and `export` (only into the target folder; a non-empty one needs `--overwrite` and must be an earlier export). `apply` needs a named approval and verifies source hashes before writing.

## Live source checks (`--sources`, `watch`)

A page cites a source with `sources[].resource` (a path relative to the source folder) and,
optionally, `contentHash`. With `--sources <folder>` the current hash of each cited local source is
read from that folder and compared with `contentHash`; no hash file is needed. The hash is
`sha256` over the raw bytes, which is what `contentHash` records for UTF-8 text and the only
meaningful value for binary files. A hash file given in addition is overridden by the live hashes.

| Finding | Meaning |
| --- | --- |
| `stale-source` | the source exists and its hash differs from `contentHash` |
| `missing-source` | the source file no longer exists (new; `status` counts it as `missingSourceFileCount`) |
| `missing-source-hash` | no current hash is available (unchanged meaning; `missingSourceCount`) |

`http(s)` sources are never fetched or watched; they are counted as `unmonitoredSourceCount` and
raise no finding. A path that is absolute, contains `..`, uses another scheme or leads out of the
folder through a symlink is never read.

`watch` prints one line per changed source and the pages that cite it (`--format json`: one JSON
object per line, `{"event":"changed|added|removed","source":…,"pages":[…]}`). Quick successive
writes are merged by a 300 ms debounce. `--state <file>` keeps hash, size and modification time per
source between runs, so a restart reports exactly what changed in between; without it every run
starts from scratch and reports all present sources as `added`. A file whose size and modification
time are unchanged is not read again. `--once` makes one pass and exits. The state file must not lie
inside the source folder or the bundle. `watch` uses `fs.watch` (recursive) instead of chokidar: it
needs no dependency in the compiled binary, and its events are only a trigger — the report always
comes from comparing the current sources with the previous state.

With `mcp --sources <folder>` the tool `knowledge_wiki_status` computes live. The folder is chosen
when a person starts the server; it is never a tool argument, and hashes an agent passes in are
ignored in that mode.

## Learning commands (`agent search|read|create|append|stale`)

Single commands for the learnings of a vault (`--vault <folder>`) or a cloud workspace (`--cloud <url>
[--workspace <id>]`, token in `BLOOMMD_TOKEN`), with **JSON on stdout** and messages on stderr. They are the
basis of the future adapter `wissen/bloommd` in `md-agents`. They run through the same service as the knowledge
MCP: the rights of the agent (read, propose, write per area), the change log and undo apply, and nothing here can
approve a proposal (a person does that with `agent approve`). All commands work in the area `Learnings` only.
`create` and `append` need `--ticket <id>` (at most 3 writes per ticket id, counted in `.bloommd/ticket-writes/`
of the vault) and `--name <agent>`.

```bash
# search: valid learnings only (not veraltet/ersetzt, not expired); --include-stale adds the rest; --limit defaults to 5
bloommd-wiki agent search "lockfile" --vault /data/learnings --name coder --rolle coder --tag bun --komponente Dockerfile
# {"treffer":[{"pfad":"Learnings/coder/Bun-Version.md","titel":"…","status":"neu","rolle":"coder","tags":["coder"],"auszug":"…","stale_after":"2027-01-25","abgelaufen":false}],"anzahl":1,"gesamt":1,"limit":5}

# read: frontmatter, content (Markdown without frontmatter) and version
bloommd-wiki agent read "Learnings/coder/Bun-Version.md" --vault /data/learnings
# {"pfad":"…","version":"d7e468b17e7313d7","bereich":"Learnings/coder","frontmatter":{"titel":"…","status":"neu","rolle":"coder","tags":[…],"scope":"…","stale_after":"…","abgelaufen":false,"verified":[]},"inhalt":"# …"}

# create: from the learning template; required: --titel --rolle --beleg --inhalt (text or "-" for stdin) --ticket --name
bloommd-wiki agent create --vault /data/learnings --name coder --ticket 113 --titel "Bun-Version je Repo festhalten" \
  --rolle coder --beleg https://github.com/org/repo/issues/113 --inhalt "Version je Repo festhalten" --komponente Dockerfile
# {"ok":true,"pfad":"Learnings/coder/Bun-Version je Repo festhalten.md","modus":"geschrieben","aenderung":"…","version":"…","status":"neu","ticket":"113","schreibvorgang":1,"limit":3}

# append: new node and/or evidence link, adds a verified entry (by = --name) and renews stale_after
bloommd-wiki agent append "Learnings/coder/Bun-Version.md" --vault /data/learnings --name tester --ticket 113 \
  --inhalt "Zweiter Vorfall" --beleg https://github.com/org/repo/actions/runs/1
# {"ok":true,"pfad":"…","modus":"geschrieben","verified":{"by":"tester","at":"2026-10-27"},"stale_after":"2027-01-25","ticket":"113","schreibvorgang":2,"limit":3}

# stale: expired learnings, with --days also those expiring within n days (the form `agent stale <folder>` stays the plain-text routine)
bloommd-wiki agent stale --vault /data/learnings --days 14
# {"stale":[{"pfad":"…","titel":"…","status":"neu","stale_after":"2026-10-20","tage_ueberfaellig":7,"abgelaufen":true,"scope":"…"}],"anzahl":1,"tage":14}
```

`create` refuses to file a learning when one with the same title (ignoring case and punctuation), or a very
similar one (title and tags, role included), exists: nothing is written, the exit code is 3 and the JSON is
`{"fehler":"…","duplicate":true,"pfad":"<existing>","titel":"…","aehnlichkeit":1}`; use `append` then. There is no
`--force`. A fourth write for one ticket id exits with 4 and `{"fehler":"…","limit":3,"ticket":"…","geschrieben":3}`.
Reading and searching never count. Errors are `{"fehler":"…"}` (a wrong call also has `"aufruf"`). Exit codes:
`0` ok, `1` error, `2` wrong call, `3` duplicate, `4` limit. `--help` per command prints the usage as text.
In a `propose` area the result has `"modus":"vorgeschlagen"` and a `"vorschlag"` id instead of a change.

## Library API

`@bloommd/wiki-cli` can also be imported without starting a process. It exposes `runWikiCli`,
`runWikiCommand`, `readWorkspace` and the report formatters for integrations that need the same
validation and output as the binary:

```ts
import { readWorkspace, runWikiCli } from "@bloommd/wiki-cli";

const workspace = await readWorkspace("./docs");
const exitCode = await runWikiCli(["workspace", "lint", "./docs", "--strict"]);
```

The `bloommd-wiki` executable lives in `src/cli.ts`; importing the package does not inspect
process arguments, write output, or start an MCP transport.

## Distribution

Release builds provide native Bun single binaries for macOS ARM64, Linux x86_64 and Linux ARM64.
They are useful for local automation, CI, and MCP clients. They are not required for the normal
BloomMD desktop or OpenClaw-agent installation.
