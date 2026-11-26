<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## SEO content maintenance

Sitemap `lastmod` comes from source commit dates, never build times:

- Static routes: newest commit of the sources listed in `src/lib/seo-routes.ts`. Routes with `null` sources (roadmap, loaded live from GitHub) have no `lastmod` on purpose. A new static sitemap route needs an entry there.
- Docs: commit date of the published file in `content/docs`. Templates: commit date of `templates/<slug>/`.
- `/blog`, `/news` and their English variants: date of the newest published article.

After committing changes to these sources, run `bun run seo:dates` from this directory in a full-history checkout and commit the regenerated `src/lib/content-modified.json`. It contains only paths the sitemap consumes; `src/app/sitemap.test.ts` fails when a route, published doc or template is missing.

Articles: `title` is the editorial title (H1, lists, feed). Optional `seoTitle` only shortens `<title>` and social previews; keep the meaning, add no claims, keep German and English consistent. `<title>` with ` · BloomMD` stays at 60 characters or fewer, descriptions at 155 (see `docs/seo/titel-2026-11-26.md`). For translated filenames, set the English `translationKey` to the German filename stem; same-stem pairs need no key. Article templates own the H1; a leading Markdown H1 is removed.

`next.config.mjs` sets `htmlLimitedBots: /.*/` so title, canonical and hreflang render in the raw `<head>` for every user agent. Removing it lets Next stream metadata into `<body>`; `e2e/release-contracts.spec.ts` guards this.
