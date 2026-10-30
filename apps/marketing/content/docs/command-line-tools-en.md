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

Only `init`, `index`, `log`, `approve`, and `apply` write to the explicitly named Wiki directory. The other commands read and report.

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
