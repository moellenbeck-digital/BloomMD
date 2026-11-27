# Navigation release verification

Owner request: #459. Related fixes: #453 and #458.

Artifacts: Desktop 0.6.1 (`v0.6.1`), Mobile 1.1.0 (`mobile-v1.1.0`), Obsidian 0.8.0 (`0.8.0` in the generated public mirror). These have separate existing version lines. Hosted App/Sync and CLI are not deployed by this release.

Implementation: initial workspace folding and viewport culling; shared typed load diagnostics and dismissible notice; title/path search and ancestor reveal; explicit center action; native WebView initial fitting without reliance on animation frames. Obsidian preserves its Vault integration and loads file previews on demand.

Local validation (2026-11-27):
- Desktop: 258 unit tests passed; native 4,571-node workspace navigation and load-notice flows verified.
- Mobile: 133 unit tests passed; 12 browser touch checks across iPhone SE, iPad portrait and Pixel 5 passed. Bundle budgets passed.
- Obsidian: 386 unit/runtime tests passed; all 59 real-Obsidian clean-vault smoke steps passed with mobile emulation at source 5cc38db5. Screenshots and report: `artifacts/obsidian-ink-smoke/`.
- Desktop, Mobile, UI and Obsidian typechecks passed. The standalone mirror is checked separately before publication.

Physical iPad/Pencil confirmation is pending and must not be inferred from emulation. The owner received `BloomMD-iPad-Test-0.8.0.zip`, including a neutral vault, instructions, the manual matrix and SHA-256 hashes of the four plugin files. The plugin remains unpublished until the manual result is recorded.

Native CI, signing, uploads and publication remain in progress. PR #462 and release issue #459 collect final run URLs and artifacts. Public news remains a draft until the described releases are available.

Simplest solution: Desktop and Mobile share the existing search, canvas and load notice; the Obsidian host adapts its existing search and Vault preview flow.
