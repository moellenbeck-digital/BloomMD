---
title: Optional command-line tools
description: Native BloomMD binaries for local Wiki workflows, CI and controlled agent automation.
order: 7
---

# Optional command-line tools

The BloomMD desktop app and the OpenClaw plugin work without additional command-line tools. The two native binaries are intended for local automation, CI and integration development:

- **`bloommd-wiki`** checks Markdown folders, manages OKF/LLM Wiki bundles and provides an MCP transport.
- **`bloommd-agent`** is the controlled agent runtime for diagnostics and automation. Normal OpenClaw use already includes it in the BloomMD plugin.

## Download the right binary

The [Download page](/download?lang=en) provides current binaries for Apple Silicon macOS plus Linux x86_64 and ARM64. You can also use these always-current URLs:

```bash
# Apple Silicon macOS
curl -fL https://bloommd.io/command-tools/bloommd-wiki-darwin-arm64 -o bloommd-wiki

# Intel/AMD Linux
curl -fL https://bloommd.io/command-tools/bloommd-wiki-linux-x64 -o bloommd-wiki

# ARM64 Linux
curl -fL https://bloommd.io/command-tools/bloommd-wiki-linux-arm64 -o bloommd-wiki

chmod 755 bloommd-wiki
./bloommd-wiki --help
```

For reproducible automation, download the asset and its SHA-256 checksum from the matching `cli-v<version>` release on the [BloomMD releases page](https://github.com/moellenbeck-digital/BloomMD/releases). Keep the binary in a private tools directory such as `~/.local/bin`, not in a workspace repository.

## Check Wiki bundles and Markdown

```bash
bloommd-wiki workspace lint ./docs --format github --strict
bloommd-wiki workspace check ./vault
bloommd-wiki workspace index ./docs
bloommd-wiki init ./wiki "Project knowledge"
bloommd-wiki status ./wiki
bloommd-wiki mcp ./wiki
```

`workspace index` shows, per file and per heading, who links to it (a link with an anchor counts for the heading, one without for the file) and reports three findings: broken or ambiguous links, stale targets (an anchor without a heading; a target file with status `veraltet`/`ersetzt` or a past `stale_after`, naming `replaced_by` as the successor) and duplicate `bloommd:id`s. Options as for `workspace lint`: `--format text|json|github`, `--strict`, `--quiet`; errors (broken links) exit 1, with `--strict` warnings do too. `workspace lint` is unchanged.

Only `init`, `index`, `log`, `approve`, and `apply` write to the explicitly named Wiki directory. `propose` writes only the named proposal file. The other commands read and report.

## Propose Wiki changes

`propose` turns a list of changes into a proposal. The proposal does not change any Wiki page yet. `approve` approves it with the name of the reviewer. Only then does `apply` write it to the Wiki directory.

```bash
bloommd-wiki propose ./wiki ./changes.json ./proposal.json
bloommd-wiki approve ./proposal.json "Reviewer name"
bloommd-wiki apply ./wiki ./proposal.json
```

Arguments of `propose <path> <changes.json> <proposal.json>`, all three required:

- **`<path>`**: the Wiki directory. `propose` reads the current state of every affected page there.
- **`<changes.json>`**: a JSON array. Each entry has `path` (page relative to the Wiki directory, ending in `.md`), `content` (the complete new page content), `reason` and optionally `sourceIds`.
- **`<proposal.json>`**: the target file for the proposal. An existing file is overwritten.

```json
[
  {
    "path": "concepts/launch.md",
    "content": "---\ntype: concept\n---\n# Launch\n\nNew plan.\n",
    "reason": "Update the plan",
    "sourceIds": ["docs:launch"]
  }
]
```

The proposal file contains `version: 1`, an `id`, `createdAt` and the changes. Each change also carries `beforeHash` (SHA-256 of the page at proposal time, `null` for a new page) and `afterHash`. There is no separate status field: without `approvedBy` and `approvedAt` the proposal is not approved, and `apply` rejects it. `apply` also rejects it when a page has changed since the proposal.

On success `propose` prints JSON, for example `{ "ok": true, "command": "wiki propose", "proposalId": "…", "outputPath": "…" }`, and exits 0.

`propose` exits 2 and writes no file when an argument is missing, a `path` is absolute, contains `..` or does not end in `.md`, a `path` appears twice, or a `content` is larger than 2,000,000 bytes. `propose` does not enforce a source: `sourceIds` is optional.

Through `bloommd-wiki mcp`, agents can propose changes. `approve` and `apply` are available to them only when the server was started with `--allow-agent-approval`.

## Use the agent runtime only for automation

Normal pairing remains an OpenClaw command:

```bash
openclaw bloommd pair --server https://bloommd.app \
  --bloommd-profile research \
  --pairing-code-file ~/.config/bloommd/pairing-code
```

Install `bloommd-agent` only when you intentionally automate or diagnose the runtime outside the plugin. Pairing codes always belong in a private file, never in shell history, a prompt or a repository:

```bash
# Apple Silicon macOS: darwin-arm64
# Intel/AMD Linux: linux-x64
# ARM64 Linux: linux-arm64
curl -fL https://bloommd.io/command-tools/bloommd-agent-linux-x64 -o bloommd-agent
chmod 755 bloommd-agent

bloommd-agent status --profile research
bloommd-agent cron install --profile research --interval-seconds 60
```

The runtime also starts a model only after it has claimed its own explicitly assigned task. Results remain proposals until a human accepts them in BloomMD.

Next: [OpenClaw agents in a workspace](/docs/openclaw-agent?lang=en) or [LLM Wiki](/docs/okf-wiki?lang=en).
