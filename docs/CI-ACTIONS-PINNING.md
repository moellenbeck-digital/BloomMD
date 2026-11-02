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
