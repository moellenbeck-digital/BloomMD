/**
 * Screenshot build: the real app (`src/App.tsx`) behind a small driver entry that opens the demo
 * vault and puts the interface into the state of one store screenshot. Never shipped; the store
 * build keeps using `vite.config.ts` with `src/main.tsx`.
 *
 *   cd packages/mobile && bunx vite build --config store/screenshots/harness/vite.config.ts
 */
import { mergeConfig } from "vite";
import { resolve } from "node:path";
import base from "../../../vite.config";

const harness = import.meta.dirname;

export default mergeConfig(base, {
  root: harness,
  build: { outDir: resolve(harness, "../../../dist"), emptyOutDir: true },
  server: { fs: { allow: [resolve(harness, "../../../../..")] } },
});
