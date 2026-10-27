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

# Markdown workspace checks
bloommd-wiki workspace lint ./docs --format github --strict
bloommd-wiki workspace check ./vault
bloommd-wiki workspace search "term" ./docs
bloommd-wiki workspace backlinks "Note.md" ./docs
```

The binary writes only where the command explicitly requests it: `init`, `index`, `log`,
`approve`, `apply`, and `export` (only into the target folder; a non-empty one needs `--overwrite` and must be an earlier export). `apply` needs a named approval and verifies source hashes before writing.

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
