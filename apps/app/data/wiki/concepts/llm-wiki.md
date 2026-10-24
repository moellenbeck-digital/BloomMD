---
type: concept
id: llm-wiki
okf_version: '0.1'
updated: '2026-08-06'
sources:
  - id: product:bloommd-wiki
    contentHash: local-demo
---

# BloomMD as an LLM Wiki

BloomMD is a visual interface for a maintained Markdown knowledge base. The Markdown files remain the source of truth while the map makes structure, references and open questions easier to inspect.

## Three layers

- **Raw sources** stay unchanged and keep their original provenance.
- **Wiki pages** contain distilled, cross-linked knowledge in Markdown.
- **Schema and workflows** define how pages are created, reviewed and refreshed.

## Workflow

1. Ingest a source and record where it came from.
2. Update the affected Wiki pages through a reviewed agent or human workflow.
3. Query the Wiki instead of repeatedly reconstructing context from raw documents.
4. Run deterministic checks for missing links, invalid resources and stale provenance.

BloomMD currently exposes this bundle through a read-only browser. Editing and agent actions belong in an explicit CLI, MCP or authenticated workspace workflow.

See also: [Collaboration with Yjs](collaboration.md).
