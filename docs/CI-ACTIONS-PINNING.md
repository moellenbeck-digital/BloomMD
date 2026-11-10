# Pinning GitHub Actions to commit SHAs

Tags and branches of third-party actions can be moved or rewritten. A
compromised action repository could then run arbitrary code in our workflows,
including release jobs that have access to secrets. Therefore every `uses:`
reference in a workflow points to an immutable 40-character commit SHA.

## Rule

- Never reference a third-party action by tag or branch (`@v4`, `@main`).
- Pin it to the full commit SHA and name the release in a trailing comment.
- Local actions (`uses: ./...`) are exempt.
- This covers `.github/workflows/*.yml` and
  `plugins/obsidian/.github/workflows/release.yml`.

## Format

```yaml
uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
```

`uses: owner/repo@<40-hex-sha> # vX.Y.Z` — name the concrete release tag, not
only the major version. The pin stays on the major version already in use;
a major upgrade is a separate, deliberate change.

## Finding the SHA for a tag

Resolve it from the action repository itself, never from memory or a
third-party list:

```bash
git ls-remote https://github.com/<owner>/<repo> "refs/tags/<tag>" "refs/tags/<tag>^{}"
```

For an annotated tag, the `^{}` line holds the commit SHA; use that one. For a
lightweight tag there is only one line. To find the exact release behind a
moving major tag such as `v4`, list the tags that share its SHA:

```bash
git ls-remote --tags https://github.com/<owner>/<repo> | grep <sha>
```

The tag must come from the action repository (not a fork), so the SHA is
traceable to a published release.

## Updating an action

1. Check the new release tag in the action repository.
2. Read its changelog for breaking changes and changed inputs.
3. Resolve the new SHA as above.
4. Replace the SHA and the version comment in **every** occurrence in the
   repo (`grep -rn "<owner>/<repo>@" .github plugins --include=*.yml`);
   the same action and major version uses the same SHA everywhere.
5. Open a PR and let the CI run. Release, desktop, and mobile workflows do
   not run on PRs; say in the PR which ones were only checked statically.

## Automated updates (Dependabot)

`.github/dependabot.yml` lets Dependabot propose action updates so the pins do
not go stale.

- **Schedule:** weekly.
- **Grouped:** all minor and patch updates of the actions arrive in one pull
  request per directory (group `actions-minor-patch`). Commit and PR titles
  start with `ci:`.
- **SHA and comment:** for an action pinned as `@<sha> # vX.Y.Z`, Dependabot
  replaces the SHA and rewrites the version comment to the new release tag in
  the same change. It only rewrites the comment when the old comment names a
  release tag of the old SHA; check the diff for that (see below).
- **Major upgrades** are not part of the group. Dependabot opens each one as
  its own pull request, which stays a deliberate, separately reviewed change as
  required in [Format](#format). Where an action is deliberately used in two
  major versions (for example `actions/upload-artifact` v7 and v4), Dependabot
  may also propose the newer major for the older usage; close such a pull
  request if the old major is intended.
- **Coverage:** two entries, because for `github-actions` the directory `/`
  makes Dependabot scan `/.github/workflows`, and any other directory is
  scanned for workflow files directly. `/plugins/obsidian/.github/workflows`
  covers the nested `plugins/obsidian/.github/workflows/release.yml`.
  Sources: [Dependabot options reference, `directories` or
  `directory`](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#directories-or-directory-)
  and the [file fetcher of
  dependabot-core](https://github.com/dependabot/dependabot-core/blob/main/github_actions/lib/dependabot/github_actions/file_fetcher.rb).
  New workflow folders elsewhere in the repo need their own entry.

Dependabot does not replace the review. Reviewers still follow "Updating an
action": read the changelog of the new release for breaking changes and
changed inputs, and run the check below on the pull request branch. Release,
desktop, and mobile workflows do not run on PRs; the PR must say which ones
were only checked statically.

Not part of this setup: Dependabot alerts and Dependabot security updates.
This file configures version updates only.

## Check

Every line must end in a 40-hex SHA (plus the version comment); this prints
offenders and must output nothing:

```bash
grep -rnE "uses:" .github plugins --include=*.yml \
  | grep -vE "uses:[[:space:]]+\./" \
  | grep -vE "@[0-9a-f]{40}( #.*)?$"
```

## Exceptions

If an action only publishes tags or branches and no resolvable release
commit, ask a maintainer before using it. Do not fall back to a tag silently.
