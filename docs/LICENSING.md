# BloomMD licensing and release boundaries

The BloomMD source tree from the Marketing 0.5.1 release commit
`2c98e37ea243f1cafc29a19e5497bc71b9d56cca` onward uses the
[Elastic License 2.0](../LICENSE). Package metadata in a later source commit
describes that source tree; it does not change the license of an already
published artifact.

Earlier release tags retain their original terms. In particular, Desktop
`v0.5.14` is MIT licensed. The previous MIT notice is kept in
[LICENSE-MIT-legacy](../LICENSE-MIT-legacy) and accompanies future artifacts
where applicable.

The separately released Obsidian plugin uses
[ELv2](../plugins/obsidian/LICENSE) from its next public release. Published plugin
versions through `0.5.12` remain MIT licensed. Its public mirror is generated from
`plugins/obsidian` and includes Core and Ink snapshots under the same ELv2 terms.
Both license texts accompany future plugin release snapshots.

## Artifact checks for future releases

| Artifact | License evidence |
| --- | --- |
| Desktop macOS/Linux app | `LICENSE` and `LICENSE-MIT-legacy` in the app bundle; verify signed release artifacts after packaging. |
| Arch/Pacman package | SPDX `Elastic-2.0` metadata and both files under `/usr/share/licenses/bloommd-desktop/`. |
| Core/UI npm package | `Elastic-2.0` package metadata and both license files in the tarball. |
| Capacitor native package | `Elastic-2.0` npm and CocoaPods metadata; both files in the package, with the Podspec pointing to `LICENSE`. |
| CLI GitHub release | Both license files attached alongside the versioned binaries and checksums. |
| OpenClaw plugin archive/image | Both license files in the npm archive and the final image. |
| Obsidian public mirror | `Elastic-2.0` package metadata, both license texts in the snapshot, and the ELv2 text in the versioned release package. |
| Hosted app/marketing/sync | Only the versions actually deployed change their visible SemVer; the image SHA and digest identify the source tree. |

Each release must verify the license evidence in the actual built artifact.
The App license page change in source is for its next versioned deployment;
the currently deployed App 0.5.0 is not relabeled.
