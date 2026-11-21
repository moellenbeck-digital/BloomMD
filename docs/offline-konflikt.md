# Offline-Bearbeitung und Konfliktregel A (#261)

Zwei Web-App-Clients bearbeiten dieselbe Markdown-Datei getrennt offline und verbinden sich danach
wieder. Es geht kein Bearbeitungsstand verloren; ein echter Inhaltskonflikt wird sichtbar und lässt
sich auflösen.

## Fall (Ausgangslage)

- `offline-alpha.md`: Wurzel mit den Knoten „Alpha“, „Beta“, „Gamma“.
- `offline-vergleich.md`: unveränderte Vergleichsdatei (muss nach dem Lauf byte-gleich bleiben).
- A benennt offline „Alpha“ in „Alpha-A“ um und legt „Delta“ an. B benennt offline „Alpha“ in
  „Alpha-B“ um. Danach gehen beide online.

Ergebnis: Beide sehen „Delta“. Bei „Alpha“ ist ein Konflikt sichtbar; eine Fassung steht im Knoten,
die andere als Geschwisterknoten „Konflikt: …“ mit Gerät und Zeit.

## Konfliktregel A

- Führend ist der Server-Raum mit seiner Markdown-Datei. Der Client ist eine Replik.
- Konflikt: derselbe Knoten (Titel oder Inhalt) wurde seit dem gemeinsamen Stand auf beiden Seiten
  geändert. Erkannt wird das beim Reconnect.
- Im Knoten gewinnt der zuletzt beim Server angekommene Stand; der andere bleibt als
  „Konflikt: …“-Kopie erhalten.
- Nicht überlappende Änderungen werden ohne Hinweis gemischt.
- Auflösung: der Benutzer übernimmt eine Fassung oder löscht die Kopie. Nichts wird still verworfen.

## Bausteine

| Teil | Ort |
| --- | --- |
| Regel A (Erkennung, Konfliktkopie) | `packages/core/src/offline-conflict.ts` |
| Server: Offline-Merge, Snapshot vor dem Mischen | `packages/sync/src/offline-merge.ts`, `snapshots.ts` |
| Client: lokale Warteschlange (IndexedDB), Reconnect | `packages/ui/src/sync/offline-queue.ts`, `SyncProvider.ts` |
| Konflikt-UI | `packages/ui/src/components/SyncStatus.tsx`, `useMindMapStore.ts` |

Der Reconnect läuft über den normalen Yjs-Sync (State-Vector-Abgleich) und ist idempotent:
erneute Zustellung erzeugt keine doppelten Knoten.

## Snapshots und Wiederherstellung

Vor dem Mischen legt der Server unter `<BLOOMMD_DIR>/.snapshots/<raum>/<id>/` ab: `server.md`
(Raum vor dem Mischen), `client.md` (mitgebrachter Stand) und `meta.json`. Verzeichnis
überschreibbar mit `SYNC_SNAPSHOT_DIR`.
`restoreSnapshot()` (`packages/sync/src/snapshots.ts`) schreibt beide Fassungen als
„<Name> (Snapshot <id> Server).md“ / „… Client).md“ neben die Datei und überschreibt nichts.

## Testbefehle

```bash
# Unit-/Integrationstests (gezielt)
bun test packages/core/src/offline-conflict.test.ts
bun test packages/sync/src/offline-merge.test.ts
bun test packages/ui/src/sync/offline-queue.test.ts packages/ui/src/hooks/useMindMapStore.offline.test.ts

# E2E @t261 (zwei Browser-Kontexte, Offline über Playwright)
bun run --cwd apps/app test:e2e:offline
```

## Reset-Verfahren (#346)

Der Lauf setzt sich selbst zurück (`apps/app/playwright-offline-setup.ts`). Manuell:

1. Testraum und Snapshots löschen: `rm -rf .qa/playwright-offline-workspace` (enthält `.snapshots`).
2. Ausgangsdateien neu anlegen: `apps/app/e2e/fixtures/offline-workspace/*.md` nach
   `.qa/playwright-offline-workspace/` kopieren.
3. Browser-Speicher der Clients leeren (IndexedDB-Warteschlange), sonst werden alte Offline-Änderungen
   erneut zugestellt.
