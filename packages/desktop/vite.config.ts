import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const packageDir = import.meta.dirname;
const root = resolve(packageDir, "../..");
const require = createRequire(import.meta.url);

// Custom plugin to resolve bare imports from the workspace root
function monorepoResolve(worker = false): Plugin {
  const rootModules = resolve(root, "node_modules");
  const desktopModules = resolve(packageDir, "node_modules");
  const coreModules = resolve(packageDir, "../core/node_modules");
  const uiModules = resolve(packageDir, "../ui/node_modules");
  const webModules = resolve(packageDir, "../web/node_modules");

  return {
    name: "monorepo-resolve",
    enforce: "pre",
    resolveId(source, importer) {
      // Only handle bare module imports (not relative, not absolute)
      if (source.startsWith(".") || source.startsWith("/") || source.startsWith("\0")) {
        return null;
      }
      // Skip our own aliases and Node builtins
      if (source.startsWith("@bloommd/")) return null;
      // Let Vite/Rolldown read ESM exports instead of forcing CommonJS entrypoints.
      if (source.startsWith("@codemirror/") || source.startsWith("@lezer/")) return null;
      // Let Vite handle lib0 (has browser/node conditional exports)
      if (source.startsWith("lib0/") || source === "lib0") return null;
      if (source.startsWith("node:") || ["fs", "path", "os", "crypto", "stream", "buffer", "util", "events", "url", "http", "https", "net", "tls", "zlib", "assert", "child_process", "cluster", "dgram", "dns", "domain", "module", "querystring", "readline", "repl", "string_decoder", "tty", "v8", "vm", "worker_threads", "fs/promises"].includes(source)) return null;

      try {
        // Try desktop node_modules first, then root
        // Dagre's source guards CommonJS imports with typeof require and falls back to
        // window. Its self-contained distribution also works in native Web Workers.
        const resolved = require.resolve(worker && source === "dagre" ? "dagre/dist/dagre.js" : source, {
          paths: [desktopModules, rootModules, coreModules, uiModules, webModules],
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
  worker: { plugins: () => [monorepoResolve(true)] },
  root: "src/mainview",
  build: {
    outDir: "../../dist",
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
  },
  resolve: {
    preserveSymlinks: true,
    dedupe: ["react", "react-dom"],
    alias: {
      "@bloommd/core/browser": resolve(packageDir, "../core/src/browser.ts"),
      "@bloommd/core": resolve(packageDir, "../core/src/index.ts"),
      "@bloommd/ui/rename-dialog": resolve(packageDir, "../ui/src/components/RenameMindmapDialog.tsx"),
      "@bloommd/ui/visible-layout": resolve(packageDir, "../ui/src/hooks/visible-layout.ts"),
      "@bloommd/ui": resolve(packageDir, "../ui/src/index.ts"),
    },
  },
  server: {
    fs: {
      allow: [root],
    },
  },
});
