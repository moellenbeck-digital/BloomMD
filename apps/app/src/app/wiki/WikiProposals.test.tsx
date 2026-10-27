import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { WikiProposalView } from "../../lib/wiki-proposals";
import { WikiProposals, type WikiProposalsData } from "./WikiProposals";

const PAGE = "# Launch\n\nInitial.\n";

function proposal(overrides: Partial<WikiProposalView> = {}): WikiProposalView {
  return {
    id: "0d1ecb9d-6928-45ec-bc1e-73c5aa41dcb9",
    createdAt: "2026-10-27T10:00:00.000Z",
    changes: [{ path: "concepts/launch.md", reason: "Neuer Stand", sourceIds: ["docs:launch"], before: PAGE, after: `${PAGE}\nFreigegeben.\n`, pageChanged: false }],
    sources: [{ id: "docs:launch", resource: "docs/launch.md", title: null, contentHash: "sha256:a", hashStatus: "unchanged", paths: ["concepts/launch.md"] }],
    hasSources: true,
    pageChanged: false,
    validationErrors: [],
    canApprove: true,
    ...overrides,
  };
}

const render = (proposals: WikiProposalView[], locale: "de" | "en" = "de") => {
  const data: WikiProposalsData = { reviewer: "Ada Lovelace", sourceVerification: "verified", proposals };
  return renderToStaticMarkup(<WikiProposals data={data} locale={locale} onChanged={async () => undefined} />);
};

describe("WikiProposals", () => {
  test("lists the open proposals with count, creation time and affected pages", () => {
    const html = render([proposal(), proposal({ id: "second-proposal", changes: [{ path: "concepts/other.md", reason: "", sourceIds: [], before: null, after: "# Other\n", pageChanged: false }] })]);
    expect(html).toContain("2 offene Vorschläge");
    expect(html).toContain("concepts/launch.md");
    expect(html).toContain("concepts/other.md");
    expect(html).toContain("Erstellt:");
    expect(html).toContain("1 Seite");
  });

  test("says so when nothing is open", () => {
    expect(render([])).toContain("Keine offenen Vorschläge.");
  });

  test("shows a line diff per changed page and a new page as new", () => {
    const html = render([proposal()]);
    expect(html).toContain("wiki-proposal-diff");
    expect(html).toContain("+ Freigegeben.");
    expect(html).toContain("+2 hinzugefügt");
    const created = render([proposal({ changes: [{ path: "concepts/new.md", reason: "r", sourceIds: [], before: null, after: "# New\n", pageChanged: false }] })]);
    expect(created).toContain("Neue Seite");
  });

  test("names the reviewer under the approve button and requires a reason to discard", () => {
    const html = render([proposal()]);
    expect(html).toContain("Freigabe unter dem Namen Ada Lovelace");
    expect(html).toContain(">Freigeben<");
    expect(html).toContain(">Verwerfen<");
    expect(html).toContain("Begründung für das Verwerfen (Pflicht)");
    expect(html).toMatch(/<textarea[^>]*required/);
    expect(html).not.toMatch(/data-testid="wiki-proposal-approve"[^>]*disabled=""/);
  });

  test("shows the source hash states", () => {
    const sources: WikiProposalView["sources"] = [
      { id: "a", resource: "a.md", title: null, contentHash: "h", hashStatus: "unchanged", paths: ["p.md"] },
      { id: "b", resource: "b.md", title: null, contentHash: "h", hashStatus: "changed", paths: ["p.md"] },
      { id: "c", resource: "c.md", title: null, contentHash: null, hashStatus: "no-hash", paths: ["p.md"] },
    ];
    const html = render([proposal({ sources })]);
    expect(html).toContain("Quelle unverändert");
    expect(html).toContain("Quelle hat sich geändert");
    expect(html).toContain("ohne Hash");
  });

  test("a proposal without source is recognisable in the list and the detail", () => {
    const html = render([proposal({ sources: [], hasSources: false })]);
    expect(html).toContain("wiki-proposal-no-sources");
    expect(html).toContain("Dieser Vorschlag nennt keine Quelle");
    expect(html).toContain("Ohne Quelle");
  });

  test("a changed page shows the warning and blocks approving", () => {
    const html = render([proposal({
      pageChanged: true,
      canApprove: false,
      changes: [{ path: "concepts/launch.md", reason: "r", sourceIds: [], before: PAGE, after: "x\n", pageChanged: true }],
    })]);
    expect(html).toContain("Seite hat sich seit Erstellung des Vorschlags geändert");
    expect(html).toContain("wiki-proposal-page-changed");
    expect(html).toMatch(/data-testid="wiki-proposal-approve"[^>]*disabled=""/);
    // Discarding stays possible: it is the way out of a stale proposal.
    expect(html).not.toMatch(/data-testid="wiki-proposal-discard"[^>]*disabled=""/);
  });

  test("an invalid proposal is explained and cannot be approved", () => {
    const html = render([proposal({ canApprove: false, validationErrors: ["Proposal content hash is invalid: concepts/launch.md"] })]);
    expect(html).toContain("Dieser Vorschlag lässt sich nicht anwenden");
    expect(html).toContain("Proposal content hash is invalid");
    expect(html).toMatch(/data-testid="wiki-proposal-approve"[^>]*disabled=""/);
  });

  test("renders in English", () => {
    const html = render([proposal({ pageChanged: true, canApprove: false })], "en");
    expect(html).toContain("1 open proposal<");
    expect(html).toContain("Approved as Ada Lovelace");
    expect(html).toContain("Page has changed since the proposal was created");
    expect(html).toContain(">Approve<");
    expect(html).toContain(">Discard<");
    expect(html).toContain("Reason for discarding (required)");
  });
});
