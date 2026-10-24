import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";

const packageDir = import.meta.dirname;
const root = resolve(packageDir, "../..");
const require = createRequire(import.meta.url);

// Resolve bare imports from all workspace node_modules
function monorepoResolve(): Plugin {
  const mobileModules = resolve(packageDir, "node_modules");
  const rootModules = resolve(root, "node_modules");
  const coreModules = resolve(packageDir, "../core/node_modules");
  const uiModules = resolve(packageDir, "../ui/node_modules");
  const lib0Root = resolve(require.resolve("lib0/package.json", { paths: [uiModules, rootModules] }), "..");

  return {
    name: "monorepo-resolve",
    enforce: "pre",
    async resolveId(source, importer, options) {
      // Lexical keeps editor state in module scope, so it must be bundled exactly once. With
      // symlinks preserved, the same file reached through two package links (@mdxeditor's and
      // @lexical/*'s) became two modules, and the node editor crashed the app as soon as it opened
      // (Lexical error #195). Resolve normally, then collapse to the real file path.
      if (source === "lexical" || source.startsWith("@lexical/")) {
        const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
        return resolved && !resolved.external ? { ...resolved, id: realpathSync(resolved.id) } : null;
      }
      if (source.startsWith(".") || source.startsWith("/") || source.startsWith("\0")) {
        return null;
      }
      if (source.startsWith("@bloommd/")) return null;
      // Let Vite/Rolldown read ESM exports instead of forcing CommonJS entrypoints.
      if (source.startsWith("@codemirror/") || source.startsWith("@lezer/")) return null;

      // Let Vite select the browser export conditions for the collaboration stack.
      // require.resolve() selects lib0's Node/CommonJS entry and pulls node:crypto
      // into the mobile bundle.
      if (source.startsWith("lib0/")) return resolve(lib0Root, `${source.slice("lib0/".length)}.js`);
      if (source === "yjs" || source.startsWith("y-protocols/")) return null;
      if (source.startsWith("node:") || ["fs", "path", "os", "crypto", "stream", "buffer", "util", "events", "url", "http", "https", "net", "tls", "zlib", "assert", "child_process", "module", "querystring", "fs/promises"].includes(source)) return null;

      try {
        const resolved = require.resolve(source, {
          paths: [mobileModules, rootModules, coreModules, uiModules],
        });
        return resolved;
      } catch {
        return null;
      }
    },
  };
}

export default defineConfig({
  plugins: [monorepoResolve(), react(), tailwindcss()],
  root: "src",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "editor-core",
              test: /node_modules[\\/](?:\.bun[\\/])?(?:@mdxeditor|@lexical|lexical)/,
              priority: 30,
              maxSize: 1_000_000,
            },
            {
              name: "editor-codemirror",
              test: /node_modules[\\/](?:\.bun[\\/])?(?:@codemirror|@lezer)/,
              priority: 20,
              maxSize: 1_000_000,
            },
          ],
        },
      },
    },
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true,
    },
  },
  resolve: {
    preserveSymlinks: true,
    dedupe: ["react", "react-dom"],
    alias: {
      "@bloommd/core/browser": resolve(packageDir, "../core/src/browser.ts"),
      "@bloommd/core": resolve(packageDir, "../core/src/index.ts"),
      "@bloommd/ui": resolve(packageDir, "../ui/src/index.ts"),
    },
  },
  server: {
    port: 5174,
    fs: {
      allow: [root],
    },
  },
});
