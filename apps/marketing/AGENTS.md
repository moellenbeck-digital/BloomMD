<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## SEO content maintenance

After committing changes to documentation or static marketing pages, run `bun run seo:dates` from this directory in a full-history checkout and commit the generated inventory. Dates are source commit dates, never build times. Shared components can affect multiple routes: review affected route dates when changing them. For articles with translated filenames, set the English `translationKey` to the German filename stem; same-stem pairs need no key. Article templates own the H1; a leading Markdown H1 is removed independently of the SEO title.
