---
title: "Two small tools for local BloomMD automation"
description: "The agent runtime and Wiki CLI ship separately, making OpenClaw, CI and local workflows easier to understand."
date: 2026-09-12
tags:
  - OpenClaw
  - Automation
  - Wiki
  - Developer tools
---

# Two small tools for local BloomMD automation

BloomMD is splitting the terminal functions that had grown together into two clearly named tools: `bloommd-agent` for controlled workspace agents and `bloommd-wiki` for local Markdown and Wiki workflows.

The normal OpenClaw path does not change. The BloomMD plugin already contains the runtime and skill, so no additional download is required. The new single binaries are optional – for CI, MCP clients, diagnostics and custom automation.

The release pipeline builds native binaries for Apple Silicon macOS plus Linux x86_64 and ARM64. Every release also includes SHA-256 checksums.

Read the [command-line tools guide](/docs/command-line-tools?lang=en) and [why BloomMD uses two tools instead of one large CLI](/en/blog/why-bloommd-has-two-tools).
