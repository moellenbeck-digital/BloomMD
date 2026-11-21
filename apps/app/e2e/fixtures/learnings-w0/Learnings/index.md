---
type: index
title: "Learnings (Beispielbündel W0: minimales Schema)"
okf: "0.2"
okf_version: "0.2"
---

# Learnings (Beispielbündel W0: minimales Schema)

> **Beispiel.** Dieses Bündel zeigt das minimale Learning-Schema (W0, Ticket #259) an vier Dateien (im E2E-Lauf von Ticket #345 kommt `neu.md` dazu). Die Fakten stammen aus dem bestätigten Beispiel `docs/learnings-beispiel/bun-lockfile-version.md`; `korrigiert.md` und `unbelegt.md` sind Beispielaussagen zur Veranschaulichung und beschreiben keinen echten Vorfall. Schema: `docs/LEARNINGS.md`, Abschnitt „Minimales Schema (W0)“.

Ein Learning je Lebenszyklus-Fall und eine normale Wiki-Seite zum Vergleich:

- [Bun-Version je Repo festhalten, das dev-team-Image braucht Bun 1.4 oder neuer](./gueltig.md) (`bestätigt`, gültig)
- [Eine Bun-Version reicht für alle Repos](./korrigiert.md) (`ersetzt`, korrigiert durch `gueltig.md`)
- [Auch andere Vault-Items könnten Platzhalter enthalten](./unbelegt.md) (`unbestätigt`, ohne Beleg)
- [Vergleich: Learning-Seite und normale Wiki-Seite](./vergleich.md) (kein Learning, `stable`)
- [Bun-Version des Repos im Lockfile-Check der CI festhalten](./neu.md) (`neu`, mit Quelle; wird im E2E-Lauf bestätigt)
