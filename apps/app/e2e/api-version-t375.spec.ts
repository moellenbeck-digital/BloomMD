/**
 * Ticket #375 — `GET /api/version` lesend prüfen. Der Fall trägt @t375 und läuft gegen die `baseURL` der jeweiligen Config
 * (Standard-Config: lokaler Stack; `playwright.testsystem.config.ts`: laufendes Testsystem über `PLAYWRIGHT_BASE_URL`).
 * Es wird nichts angelegt oder abgeschickt; kein Browser-Seitenaufruf, nur die Fixture `request`.
 *
 * `shortSha` ist `null`, wenn keine Git-SHA bekannt ist (`apps/app/src/lib/build-info.ts`); der Test erzwingt deshalb
 * keinen nicht-leeren Wert, sondern: Schlüssel vorhanden, Wert `null` oder nicht leerer String.
 */
import { expect, test } from "@playwright/test";

test("GET /api/version liefert Version @t375", async ({ request }) => {
  const response = await request.get("/api/version");

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"] ?? "").toMatch(/application\/json/i);

  const body = (await response.json()) as Record<string, unknown>;

  expect(typeof body.version).toBe("string");
  expect((body.version as string).trim().length).toBeGreaterThan(0);

  expect(Object.prototype.hasOwnProperty.call(body, "shortSha")).toBe(true);
  const shortSha = body.shortSha;
  if (shortSha !== null) {
    expect(typeof shortSha).toBe("string");
    expect((shortSha as string).trim().length).toBeGreaterThan(0);
  }
});
