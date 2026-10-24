import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { isMacRelevant, parseM1PlanGates, parseUiMatrix, summarizeMatrix } from "./parse-ui-matrix";

test("parses the M1 UI-QA matrix with stable status counts", async () => {
  const markdown = await readFile("docs/M1-UI-QA-MATRIX.md", "utf8");
  const cases = parseUiMatrix(markdown);
  const summary = summarizeMatrix(cases);

  expect(summary.total).toBe(108);
  expect(summary.byStatus).toEqual({
    Auto: 81,
    Gap: 0,
    Hybrid: 17,
    Manual: 10,
  });
  expect(cases.every((testCase) => testCase.section.length > 0)).toBe(true);
  expect(cases.every((testCase) => testCase.evidence.length > 0)).toBe(true);
  expect(cases.every((testCase) => testCase.automation.id === testCase.id)).toBe(true);
  expect(cases.every((testCase) => testCase.automation.automationTarget.length > 0)).toBe(true);
  expect(cases.every((testCase) => testCase.automation.testFile.length > 0)).toBe(true);
  expect(cases.every((testCase) => testCase.automation.selector.length > 0)).toBe(true);
});

test("filters Windows-only UI cases out of the macOS QA scope", async () => {
  const markdown = await readFile("docs/M1-UI-QA-MATRIX.md", "utf8");
  const cases = parseUiMatrix(markdown);

  expect(isMacRelevant(cases.find((testCase) => testCase.id === "DUI-030")!)).toBe(true);
  expect(isMacRelevant(cases.find((testCase) => testCase.id === "DUI-034")!)).toBe(false);
  expect(isMacRelevant(cases.find((testCase) => testCase.id === "WIN-UI-001")!)).toBe(false);
});

test("parses automatic gates from the M1 release test plan", async () => {
  const markdown = await readFile("docs/M1-TESTPLAN.md", "utf8");
  const commands = parseM1PlanGates(markdown).map((gate) => gate.command);

  expect(commands).toContain("bun install --frozen-lockfile");
  expect(commands).toContain("bun run typecheck");
  expect(commands).toContain("bun run test:qa");
  expect(commands).toContain("bun run build:release-artifacts");
  expect(commands).toContain("bun run --cwd apps/app test:e2e:visual");
  expect(commands).toContain("bun run --cwd apps/app release:check && bun run --cwd apps/marketing release:check");
  expect(commands).toContain("bun audit");
  expect(commands).toContain("bun run --cwd packages/desktop test");
  expect(commands).toContain("bun run build:desktop-macos");
});

test("requires concrete manual reasons and linked issues in automation metadata", async () => {
  const markdown = await readFile("docs/M1-UI-QA-MATRIX.md", "utf8");
  const cases = parseUiMatrix(markdown);
  const manualCases = cases.filter((testCase) => testCase.status === "Manual");
  const gapCases = cases.filter((testCase) => testCase.status === "Gap");

  expect(manualCases.length).toBe(10);
  expect(manualCases.every((testCase) => testCase.automation.manualReason !== "n/a")).toBe(true);
  expect(gapCases.every((testCase) => {
    const issue = testCase.automation.issue;
    const archivePrefix = "https://github.com/moellenbeck-digital/BloomMD-archiv/issues/";
    return /^#[0-9]+$/.test(issue) ||
      (issue.startsWith(archivePrefix) && /^[0-9]+$/.test(issue.slice(archivePrefix.length)));
  })).toBe(true);
});
