/**
 * Runs every test file in its own `bun test` process.
 *
 * Bun shares `mock.module` replacements between test files of one process, even with `--isolate`,
 * so a partial mock of lib/db in one route test could break another test depending on file order.
 * One process per file makes the result independent of order. Extra arguments go to `bun test`.
 */
import { availableParallelism } from "node:os";
import { relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const extraArgs = process.argv.slice(2);
const files = [...new Bun.Glob("src/**/*.test.{ts,tsx}").scanSync({ cwd: root })].sort();
const concurrency = Math.max(1, Math.min(files.length, availableParallelism()));

interface Result {
  file: string;
  exitCode: number;
  output: string;
}

async function run(file: string): Promise<Result> {
  const child = Bun.spawn([process.execPath, "test", ...extraArgs, `./${file}`], { cwd: root, stdout: "pipe", stderr: "pipe", env: process.env });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  return { file, exitCode, output: `${stdout}${stderr}` };
}

const queue = [...files];
const results: Result[] = [];
await Promise.all(Array.from({ length: concurrency }, async () => {
  for (let file = queue.shift(); file; file = queue.shift()) results.push(await run(file));
}));

let passed = 0;
let failed = 0;
for (const result of results.sort((a, b) => a.file.localeCompare(b.file))) {
  passed += Number(/^\s*(\d+) pass/m.exec(result.output)?.[1] ?? 0);
  failed += Number(/^\s*(\d+) fail/m.exec(result.output)?.[1] ?? 0);
  if (result.exitCode !== 0) {
    console.log(`\n✗ ${relative(root, `${root}/${result.file}`)}\n${result.output.trim()}`);
  }
}
const broken = results.filter((result) => result.exitCode !== 0).length;
console.log(`\n${passed} pass, ${failed} fail across ${files.length} files${broken ? ` (${broken} files failed)` : ""}`);
process.exit(broken ? 1 : 0);
