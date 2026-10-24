import { readFile } from "node:fs/promises";

export type MatrixStatus = "Auto" | "Hybrid" | "Manual" | "Gap";

export interface AutomationMetadata {
  id: string;
  sourceIds: string;
  automationTarget: string;
  testType: string;
  testFile: string;
  selector: string;
  fixture: string;
  assertionType: string;
  manualReason: string;
  issue: string;
  line: number;
}

export interface MatrixCase {
  id: string;
  section: string;
  functionName: string;
  testData: string;
  steps: string;
  expectedUx: string;
  edgeCases: string;
  status: MatrixStatus;
  evidence: string;
  automation: AutomationMetadata;
  line: number;
}

export interface MatrixSummary {
  total: number;
  byStatus: Record<MatrixStatus, number>;
}

const CASE_ID = /^(DUI|CUI|EUI|TUI|SUI|WUI|PUI|AUI|KUI|RUI|WIN-UI)-[0-9]+$/;
const STATUSES = new Set<MatrixStatus>(["Auto", "Hybrid", "Manual", "Gap"]);

interface AutomationMetadataRow {
  sourceIds: string;
  automationTarget: string;
  testType: string;
  testFile: string;
  selector: string;
  fixture: string;
  assertionType: string;
  manualReason: string;
  issue: string;
  line: number;
}

function cellText(value: string | undefined): string {
  return (value ?? "")
    .replaceAll("<br>", "\n")
    .replaceAll("<br/>", "\n")
    .replaceAll("<br />", "\n")
    .trim();
}

function splitMarkdownRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cellText(cell));
}

export function parseUiMatrix(markdown: string): MatrixCase[] {
  const casesWithoutMetadata: Omit<MatrixCase, "automation">[] = [];
  const metadataRows: AutomationMetadataRow[] = [];
  let section = "";
  const lines = markdown.split(/\r?\n/);

  lines.forEach((line, index) => {
    if (line.startsWith("## ")) {
      section = line.replace(/^##\s+/, "").trim();
      return;
    }

    if (!line.startsWith("| ")) return;
    const cells = splitMarkdownRow(line);
    if (section === "Automation Metadata") {
      const [
        sourceIds,
        automationTarget,
        testType,
        testFile,
        selector,
        fixture,
        assertionType,
        manualReason,
        issue,
      ] = cells;
      if (!sourceIds || sourceIds === "IDs" || sourceIds.startsWith("---")) return;
      if (cells.length !== 9) {
        throw new Error(`Expected 9 automation metadata cells on line ${index + 1}, got ${cells.length}`);
      }
      metadataRows.push({
        sourceIds,
        automationTarget: automationTarget ?? "",
        testType: testType ?? "",
        testFile: testFile ?? "",
        selector: selector ?? "",
        fixture: fixture ?? "",
        assertionType: assertionType ?? "",
        manualReason: manualReason ?? "",
        issue: issue ?? "",
        line: index + 1,
      });
      return;
    }

    const [id, functionName, testData, steps, expectedUx, edgeCases, status, evidence] = cells;
    if (!id || !CASE_ID.test(id)) return;
    if (!STATUSES.has(status as MatrixStatus)) {
      throw new Error(`Unknown status "${status}" for ${id} on line ${index + 1}`);
    }
    if (cells.length !== 8) {
      throw new Error(`Expected 8 cells for ${id} on line ${index + 1}, got ${cells.length}`);
    }

    casesWithoutMetadata.push({
      id,
      section,
      functionName: functionName ?? "",
      testData: testData ?? "",
      steps: steps ?? "",
      expectedUx: expectedUx ?? "",
      edgeCases: edgeCases ?? "",
      status: status as MatrixStatus,
      evidence: evidence ?? "",
      line: index + 1,
    });
  });

  const metadataById = expandAutomationMetadata(metadataRows, casesWithoutMetadata.map((testCase) => testCase.id));
  const cases = casesWithoutMetadata.map((testCase) => {
    const automation = metadataById.get(testCase.id);
    if (!automation) throw new Error(`Missing automation metadata for ${testCase.id}`);
    return { ...testCase, automation };
  });

  validateAutomationMetadata(cases);
  return cases;
}

export function summarizeMatrix(cases: MatrixCase[]): MatrixSummary {
  const byStatus: Record<MatrixStatus, number> = { Auto: 0, Hybrid: 0, Manual: 0, Gap: 0 };
  for (const testCase of cases) byStatus[testCase.status] += 1;
  return { total: cases.length, byStatus };
}

export function isMacRelevant(testCase: MatrixCase): boolean {
  if (testCase.id.startsWith("WIN-UI-")) return false;
  if (testCase.id === "DUI-034") return false;
  return true;
}

function expandAutomationMetadata(rows: AutomationMetadataRow[], caseIds: string[]): Map<string, AutomationMetadata> {
  const knownCaseIds = new Set(caseIds);
  const metadataById = new Map<string, AutomationMetadata>();

  for (const row of rows) {
    for (const id of expandIdSpec(row.sourceIds, caseIds)) {
      if (!knownCaseIds.has(id)) throw new Error(`Automation metadata references unknown test ID ${id} on line ${row.line}`);
      if (metadataById.has(id)) throw new Error(`Duplicate automation metadata for ${id} on line ${row.line}`);
      metadataById.set(id, {
        id,
        sourceIds: row.sourceIds,
        automationTarget: row.automationTarget,
        testType: row.testType,
        testFile: row.testFile,
        selector: row.selector,
        fixture: row.fixture,
        assertionType: row.assertionType,
        manualReason: row.manualReason,
        issue: row.issue,
        line: row.line,
      });
    }
  }

  return metadataById;
}

function expandIdSpec(spec: string, caseIds: string[]): string[] {
  const expanded: string[] = [];
  for (const rawToken of spec.split(",")) {
    const token = rawToken.trim();
    if (!token) continue;
    if (token.endsWith("*")) {
      const prefix = token.slice(0, -1);
      expanded.push(...caseIds.filter((id) => id.startsWith(prefix)));
      continue;
    }

    const rangeMatch = token.match(/^([A-Z-]+)-(\d+)\.\.([A-Z-]+)-(\d+)$/);
    if (rangeMatch) {
      const [, startPrefix, startRaw, endPrefix, endRaw] = rangeMatch;
      if (startPrefix !== endPrefix || !startRaw || !endRaw) {
        throw new Error(`Invalid automation metadata range "${token}"`);
      }
      const width = startRaw.length;
      const start = Number(startRaw);
      const end = Number(endRaw);
      if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) {
        throw new Error(`Invalid automation metadata range "${token}"`);
      }
      for (let value = start; value <= end; value += 1) {
        expanded.push(`${startPrefix}-${String(value).padStart(width, "0")}`);
      }
      continue;
    }

    expanded.push(token);
  }

  return expanded;
}

function validateAutomationMetadata(cases: MatrixCase[]): void {
  const requiredFields: Array<keyof Omit<AutomationMetadata, "id" | "sourceIds" | "line">> = [
    "automationTarget",
    "testType",
    "testFile",
    "selector",
    "fixture",
    "assertionType",
    "manualReason",
    "issue",
  ];

  for (const testCase of cases) {
    for (const field of requiredFields) {
      if (!testCase.automation[field]) {
        throw new Error(`Missing automation metadata field "${field}" for ${testCase.id}`);
      }
    }
    if (testCase.status === "Manual" && testCase.automation.manualReason === "n/a") {
      throw new Error(`Manual test ${testCase.id} needs a concrete manualReason`);
    }
    const issueReference = testCase.automation.issue;
    const archiveIssuePrefix = "https://github.com/moellenbeck-digital/BloomMD-archiv/issues/";
    const linkedIssue = /^#[0-9]+$/.test(issueReference) ||
      (issueReference.startsWith(archiveIssuePrefix) &&
        /^[0-9]+$/.test(issueReference.slice(archiveIssuePrefix.length)));
    if (testCase.status === "Gap" && !linkedIssue) {
      throw new Error(`Gap test ${testCase.id} needs a linked issue`);
    }
  }
}

export interface PlanGate {
  command: string;
  section: string;
}

export function parseM1PlanGates(markdown: string): PlanGate[] {
  const gates: PlanGate[] = [];
  let section = "";
  let inFence = false;
  let currentFence: string[] = [];
  let fenceSection = "";

  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith("## ")) section = line.replace(/^##\s+/, "").trim();
    if (line.startsWith("```")) {
      if (!inFence) {
        inFence = true;
        currentFence = [];
        fenceSection = section;
      } else {
        inFence = false;
        if (fenceSection === "Automatische Gates") {
          for (const rawCommand of currentFence) {
            const command = rawCommand.trim();
            if (command && !command.startsWith("#")) gates.push({ command, section: fenceSection });
          }
        }
      }
      continue;
    }
    if (inFence) currentFence.push(line);
  }

  return gates;
}

export async function readUiMatrix(path = "docs/M1-UI-QA-MATRIX.md"): Promise<MatrixCase[]> {
  return parseUiMatrix(await readFile(path, "utf8"));
}

export async function readM1PlanGates(path = "docs/M1-TESTPLAN.md"): Promise<PlanGate[]> {
  return parseM1PlanGates(await readFile(path, "utf8"));
}
