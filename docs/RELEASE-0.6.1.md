# Navigation release verification

Owner request: #459. Related fixes: #453 and #458.

Artifacts: Desktop 0.6.1 (`v0.6.1`), Mobile 1.1.0 (`mobile-v1.1.0`), Obsidian 0.8.0 (`0.8.0` in the generated public mirror). These have separate existing version lines. Hosted App/Sync and CLI are not deployed by this release.

Implementation: initial workspace folding and viewport culling; shared typed load diagnostics and dismissible notice; title/path search and ancestor reveal; explicit center action; native WebView initial fitting without reliance on animation frames. Obsidian preserves its Vault integration and loads file previews on demand.

Local validation (2026-11-27):
- Desktop: 258 unit tests passed; native 4,571-node workspace navigation and load-notice flows verified.
- Mobile: 133 unit tests passed; 12 browser touch checks across iPhone SE, iPad portrait and Pixel 5 passed. Bundle budgets passed.
- Obsidian: 386 unit/runtime tests passed; all 59 real-Obsidian clean-vault smoke steps passed with mobile emulation at source 5cc38db5. Screenshots and report: `artifacts/obsidian-ink-smoke/`.
- Desktop, Mobile, UI and Obsidian typechecks passed. The standalone mirror is checked separately before publication.

Physical iPad/Pencil confirmation was supplied by the owner on 2026-11-27: checklist passed on iPad Pro 11-inch with Obsidian 1.15. The owner received `BloomMD-iPad-Test-0.8.0.zip`, including a neutral vault, instructions, the manual matrix and SHA-256 hashes of the four plugin files. The manual result and exact tested package hashes are recorded in `plugins/obsidian/MOBILE-MATRIX.md`.

Native CI and Desktop/iOS signing and uploads passed; see the evidence below. PR #462 and release issue #459 collect final run URLs and artifacts. News publication follows through the separate Marketing workflow and GitOps rollout.

Simplest solution: Desktop and Mobile share the existing search, canvas and load notice; the Obsidian host adapts its existing search and Vault preview flow.

## CI and delivery evidence

- Source PR [#462](https://github.com/moellenbeck-digital/BloomMD/pull/462), merged as `890f18a2aae79d2092caaa1d382868763af62984`; tags `v0.6.1` and `mobile-v1.1.0` point to that commit.
- [CI](https://github.com/moellenbeck-digital/BloomMD/actions/runs/46011161292): verify and full E2E passed.
- [Desktop matrix](https://github.com/moellenbeck-digital/BloomMD/actions/runs/46011161315): macOS arm64, Linux ARM64/x86_64 and Pacman passed.
- [iOS](https://github.com/moellenbeck-digital/BloomMD/actions/runs/46011161415): device Release build and native iPad-simulator self-test passed. The same ad-hoc-signed simulator self-test passed locally in 84 seconds.
- [Android](https://github.com/moellenbeck-digital/BloomMD/actions/runs/46011161556): build, app/Kotlin tests and native tablet-emulator self-test passed.
- [Mobile touch](https://github.com/moellenbeck-digital/BloomMD/actions/runs/46011161299): all three viewport profiles passed.
- The isolated Obsidian mirror passed typecheck, build, QA package contract and all 386 tests. The owner confirmed the physical iPad/Pencil checklist on iPad Pro 11-inch, Obsidian 1.15.
- [Desktop release workflow](https://github.com/moellenbeck-digital/BloomMD/actions/runs/46014226110) and [iOS upload workflow](https://github.com/moellenbeck-digital/BloomMD/actions/runs/46014227131) passed. Desktop 0.6.1 is public; the production update endpoint returns 0.6.1. iOS 1.1.0 was uploaded to App Store Connect and awaits Apple processing for TestFlight.
- [Android release workflow](https://github.com/moellenbeck-digital/BloomMD/actions/runs/46014227145): signed AAB, version 1.1.0 / versionCode 228, artifact `android-release-228`. Google Play upload was skipped because `PLAY_SERVICE_ACCOUNT_JSON` is absent; this is not a completed Play rollout.

The release issue #459 records final publication and live-site verification. No physical iPad success or store rollout is inferred from a green build.
