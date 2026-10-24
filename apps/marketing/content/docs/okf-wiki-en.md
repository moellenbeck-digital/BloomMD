---
title: OKF and LLM Wiki
description: Knowledge pages with inspectable provenance.
order: 5
---

# OKF and LLM Wiki

An OKF Wiki Bundle is a folder of Markdown files in the **Open Knowledge Format** (OKF v0.2). It is
not a database format or an export; the same files can be opened in Obsidian and committed to git.

## Why it matters

AI-written documentation can sound authoritative while being difficult to verify. OKF records the
origin of every page:

- **Trust tier:** reviewed by a human, AI-generated and unreviewed, or unattributed.
- **Sources** with content hashes. If a source changes, the page is marked as drifted.
- **Lifecycle:** draft, stable, or deprecated, with an optional expiry date.

## Previews are opt-in

A Wiki page does **not** load external images automatically. A preview requires a click and names
the server that will be contacted. Broken references and missing files remain visible.

## AI proposals

An agent may **propose** changes but cannot write directly. Every proposal needs explicit approval,
and content hashes are checked again before applying it. A changed page causes the proposal to be
rejected instead of overwriting someone else's work. The same rule applies to OpenAI, Anthropic,
local models, and MCP clients.
