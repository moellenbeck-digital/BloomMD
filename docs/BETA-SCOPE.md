# BloomMD Private Beta — Scope

Stand: 9. August 2026 · Entscheidung: [Archiv #43](https://github.com/moellenbeck-digital/BloomMD-archiv/issues/43)

Dieses Dokument legt fest, was in der geschlossenen Beta enthalten ist und was nicht. Die Formulierungen
hier sind verbindlich: README, Website und Tester-Kommunikation verwenden dieselbe Sprache, damit
niemand etwas erwartet, das nicht existiert.

## Enthalten

| Bereich | Was Tester erwarten dürfen |
|---|---|
| **Desktop-App** | **Der empfohlene Weg.** Arbeitet direkt auf einem lokalen Ordner, rendert den Ordner als Workspace-Mindmap mit Datei-, Ordner- und Heading-Nodes plus Querverweis-Edges, erkennt externe Änderungen über File Watching und öffnet konkrete `.md`-Dateien per Datei-Node. Braucht **keinen** Account und **keine** Cloud. |
| **Web-App** | Dieselbe Oberfläche im Browser, für die Cloud-Beta nach Registrierung (offen; der Zugangsschalter `BLOOMMD_BETA_ACCESS=1` bleibt als Einladungsmodus erhalten). Command Palette, Fokus-, Outline- und Präsentationsmodus, gespeicherte Views. |
| **OKF / LLM-Wiki** | Wissensbündel im Open Knowledge Format v0.2 lesen und schreiben, Trust-Signale (`sources`, `generated`, `verified`, `status`, `stale_after`), deterministisches `status`/`lint`, und der Proposal-Workflow `propose → approve → apply` über CLI und MCP. Läuft lokal, ohne Modell und ohne Netzwerk. |
| **Kollaboration** | Realtime-Sync über Yjs mit Presence, dokumentgebundenen Tickets und Rollenprüfung. **Als Beta gekennzeichnet**, eine Instanz, nicht beworben. |
| **Obsidian-Kompatibilität** | Eine echte Obsidian-Notiz wird als BloomMD-Map visualisiert. Die vollständige Plugin-Beta-Verteilung über BRAT folgt in M2 (#89). |

## Ausdrücklich nicht enthalten

| Bereich | Warum |
|---|---|
| **Mobile Obsidian** | Die Touch-Matrix auf echten Geräten ist nicht gelaufen. `isDesktopOnly` bleibt `true`, `release:verify` erzwingt das. Siehe [#76](https://github.com/moellenbeck-digital/BloomMD/issues/76). |
| **Öffentlicher SaaS-Launch** | Die Registrierung für die Cloud-Beta ist offen, die Warteliste ist beendet. Ein öffentlicher SaaS-Launch (Preise, Support-Zusagen, Spamschutz) ist eine spätere, eigene Entscheidung mit eigenen Voraussetzungen. |
| **Billing / bezahlte Pläne** | `BLOOMMD_BILLING_ENABLED=0`. Checkout, Portal und Webhook antworten 404. Es werden keine Zahlungsdaten erhoben. |
| **Template-Marktplatz** | [#81](https://github.com/moellenbeck-digital/BloomMD/issues/81), kein Milestone. |
| **VS-Code-Extension** | [#80](https://github.com/moellenbeck-digital/BloomMD/issues/80), kein Milestone. |
| **Gehostete autonome Agenten** | [#90](https://github.com/moellenbeck-digital/BloomMD/issues/90). Der Agent-Workflow ist bewusst review-pflichtig und läuft lokal. Nichts schreibt ohne namentliche Freigabe. |

## Desktop-Plattformen

M1 Closed Beta ist **macOS-first** fuer die native Desktop-App. Linux und Windows werden bewusst als
eigene Beta-Releases nach M1 nachgezogen, damit der Closed-Beta-Start nicht an zusätzlichem
Plattform-Packaging und manueller Plattform-Evidence hängt.

| System | Stand | Erster Start |
|---|---|---|
| macOS (arm64) | **M1 unterstützt.** Lokal geprüft, App startet, gültiges DMG erzeugt | Rechtsklick → Öffnen (Gatekeeper) |
| Linux (x64) | **Nach M1.** Eigener Linux Beta Release | noch nicht Teil der Tester-Kommunikation |
| Windows (x64) | **Nach M1.** Eigener Windows Beta Release; #73 bleibt vor Cloud-Nutzung zu lösen oder klar zu begrenzen | noch nicht Teil der Tester-Kommunikation |

**M1-Builds sind ad-hoc signiert, aber nicht Developer-ID-signiert oder notarisiert.** Das `.app`-
Bundle ist intern konsistent und besteht `codesign --verify`. Die finale Developer-ID-Signatur und
Notarisierung warten auf die Freigabe des Apple Developer Accounts. Für eingeladene Tester ist der
Umweg über die Gatekeeper-Warnung zumutbar, solange er erklärt wird — das tut die `/beta`-Seite.

Ein `--env=stable`-Build legt die verteilbaren Dateien in `packages/desktop/artifacts/` ab, nicht in
`build/`: ein DMG (ca. 20 MB), ein komprimiertes App-Bundle und eine `update.json` für den
Auto-Updater. Auf macOS lokal erzeugt und als gültiges Disk-Image geprüft.

## Unabhängig vom Cloud-Zugang nutzbar

Wichtig für Tester, die keinen SaaS-Zugang haben oder ihn nicht wollen:

- **Desktop lokal** braucht keinen Account und keine Einladung. Dateien liegen in `~/bloommd`. Das ist der Hauptweg der Beta.
- **Lokale OKF-/Wiki-Bündel** funktionieren vollständig offline über `bloommd-wiki …` und den MCP-Transport.
- **Obsidian-Kompatibilität** wird lokal demonstriert; die vollständige Plugin-Verteilung folgt nach M1.
- **Öffentliche Demo und Templates** brauchen keine Einladung.

Gesperrt ist ausschließlich die **Registrierung für die Cloud-App**.

## Was Tester nicht hochladen sollen

Die Beta läuft auf einer frühen privaten Instanz. Plattform-Restore-Drill, explizites
CloudNativePG-S3-Backup-Ziel, externe Zielumgebungs-Smokes und Collaboration-Smoke sind fuer M1
technisch nachgewiesen ([Archiv #14](https://github.com/moellenbeck-digital/BloomMD-archiv/issues/14),
[Archiv #79](https://github.com/moellenbeck-digital/BloomMD-archiv/issues/79),
[Archiv #99](https://github.com/moellenbeck-digital/BloomMD-archiv/issues/99)). Trotzdem gibt es in M1 keine
individuelle Wiederherstellungszusage und keine Restore-SLA. Fuer Tester gilt deshalb:

- Keine personenbezogenen Daten Dritter.
- Keine Geschäftsgeheimnisse, Zugangsdaten, Schlüssel oder Tokens.
- Keine Inhalte, deren Verlust ein Problem wäre — **es gibt keine Wiederherstellungszusage**.
- Für echte Arbeit: lokal arbeiten, bevorzugt mit der Desktop-App. Das ist der empfohlene Weg.

## Bekannte Einschränkungen

- Sync läuft mit `SYNC_REPLICA_COUNT=1`. Mehr-Instanz-Koordination existiert nicht.
- Keine Konfliktauflösung als Diff-Oberfläche ([Archiv #29](https://github.com/moellenbeck-digital/BloomMD-archiv/issues/29)).
- Neue Dateien anderer Teilnehmer erscheinen nicht per Push, sondern erst über Polling, Fensterfokus oder Reload ([Archiv #1](https://github.com/moellenbeck-digital/BloomMD-archiv/issues/1)).
- Desktop-Auto-Reconnect zum Remote-Server ist unzuverlässig ([Archiv #2](https://github.com/moellenbeck-digital/BloomMD-archiv/issues/2)).
- Der Desktop-File-Watcher beobachtet `.md`-Dateien rekursiv; sehr schnelle externe Schreibvorgaenge werden ueber `awaitWriteFinish` zusammengezogen.

Diese Punkte sind bekannt und müssen nicht gemeldet werden. Alles andere schon.
