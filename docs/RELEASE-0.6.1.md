# Navigation release verification

Owner request: #459. Related fixes: #453 and #458.

Artifacts: Desktop 0.6.1 (`v0.6.1`), Mobile 1.1.0 (`mobile-v1.1.0`), Obsidian 0.8.0 (`0.8.0` in the generated public mirror). These have separate existing version lines. Hosted App/Sync and CLI are not deployed by this release.

Implementation: initial workspace folding and viewport culling; shared typed load diagnostics and dismissible notice; title/path search and ancestor reveal; explicit center action; native WebView initial fitting without reliance on animation frames. Obsidian preserves its Vault integration and loads file previews on demand.

Validation in progress: unit/type checks, Mobile touch profiles, real Obsidian with mobile emulation, native CI builds and signing workflows. Physical iPad/Pencil confirmation is separate from emulation and must not be inferred from it. The release issue collects final run URLs and artifacts.

Simplest solution: Desktop and Mobile share the existing search, canvas and load notice; the Obsidian host adapts its existing search and Vault preview flow.
