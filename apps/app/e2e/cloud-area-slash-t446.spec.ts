/**
 * Ticket #446 — Cloud-API: `/` im Dateinamen wird auf `Bereich › Unterbereich – Titel` abgebildet (statt still zu `-`).
 *
 * An der API prüfbar (Testmarke @t446):
 * - POST `Team/ops/Übersicht.md` → 201, `filePath` = `Team › ops – Übersicht.md`; `Team/Übersicht.md` → `Team – Übersicht.md`.
 * - Ein Name ohne `/` bleibt wie bisher.
 * - Die Liste zeigt die Karte unter dem umgewandelten Namen (nicht als `Team-ops-Übersicht.md`).
 * - Umbenennen auf `Team/ops/Neu.md` liefert `Team › ops – Neu.md`.
 *
 * Voraussetzung ist die Cloud (Datenbankmodus). Das Standard-Testsystem läuft im Dateimodus und lehnt Schreiben auf
 * `/api/mindmaps` mit 500 ab (siehe #380); dann gibt es nichts zu prüfen, der Fall vermerkt das und endet. Die Umwandlung
 * selbst und die Rechteprüfung auf dem umgewandelten Namen belegen die Bun-Tests (`agent-ledger.test.ts`, `mindmaps/route.test.ts`,
 * `mindmaps/[filename]/route.test.ts`). Die Fälle legen Testkarten `e2e-t446-*` an und löschen sie wieder.
 */
import { expect, test, type APIRequestContext } from "@playwright/test";

const SAME_ORIGIN_HEADERS = { origin: (process.env.PLAYWRIGHT_BASE_URL?.trim() || `http://localhost:${process.env.PLAYWRIGHT_PORT ?? "3211"}`).replace(/\/$/, "") };

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function login(request: APIRequestContext) {
  const response = await request.post("/api/auth/login", {
    headers: SAME_ORIGIN_HEADERS,
    form: { email: `e2e-t446-${runId}@example.com`, password: "E2E-Bereich-t446-Passwort!", next: "/app" },
    maxRedirects: 0,
  });
  expect(response.status(), "Anmeldung über den E2E-Bypass").toBe(303);
}

test.describe("Cloud-Bereich über / im Dateinamen (#446)", () => {
  test("@t446 POST und Umbenennen bilden / auf Bereich › Unterbereich – Titel ab", async ({ page }) => {
    const request = page.request;
    await login(request);
    const created: string[] = [];
    const create = (filename: string) => request.post("/api/mindmaps", { headers: SAME_ORIGIN_HEADERS, data: { filename, markdown: `# ${filename}\n` } });
    try {
      const nested = await create(`e2e-t446-${runId}/ops/Übersicht.md`);
      if (!nested.ok()) {
        test.info().annotations.push({ type: "dateimodus", description: `POST /api/mindmaps -> ${nested.status()}` });
        return;
      }
      const nestedBody = (await nested.json()) as { filePath: string };
      expect(nested.status()).toBe(201);
      expect(nestedBody.filePath).toBe(`e2e-t446-${runId} › ops – Übersicht.md`);
      created.push(nestedBody.filePath);

      const flat = await create(`e2e-t446-${runId}/Übersicht.md`);
      expect(flat.status()).toBe(201);
      const flatBody = (await flat.json()) as { filePath: string };
      expect(flatBody.filePath).toBe(`e2e-t446-${runId} – Übersicht.md`);
      created.push(flatBody.filePath);

      const plain = await create(`e2e-t446-${runId}-Notiz.md`);
      expect(plain.status()).toBe(201);
      const plainBody = (await plain.json()) as { filePath: string };
      expect(plainBody.filePath).toBe(`e2e-t446-${runId}-Notiz.md`);
      created.push(plainBody.filePath);

      const list = await request.get("/api/mindmaps");
      const names = ((await list.json()) as { files: Array<{ filename: string }> }).files.map((file) => file.filename);
      expect(names).toContain(nestedBody.filePath);
      expect(names).not.toContain(`e2e-t446-${runId}-ops-Übersicht.md`);

      const renamed = await request.patch(`/api/mindmaps/${encodeURIComponent(plainBody.filePath)}`, {
        headers: SAME_ORIGIN_HEADERS,
        data: { newFilename: `e2e-t446-${runId}/ops/Neu.md` },
      });
      expect(renamed.status()).toBe(200);
      const renamedBody = (await renamed.json()) as { newFilename: string };
      expect(renamedBody.newFilename).toBe(`e2e-t446-${runId} › ops – Neu.md`);
      created[created.indexOf(plainBody.filePath)] = renamedBody.newFilename;
    } finally {
      for (const filename of created) await request.delete(`/api/mindmaps/${encodeURIComponent(filename)}`, { headers: SAME_ORIGIN_HEADERS });
    }
  });
});
