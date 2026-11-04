# BloomMD Beta — aktueller Umfang

Stand: 2. November 2026 · Historischer M1-Beschluss: [Archiv #43](https://github.com/moellenbeck-digital/BloomMD-archiv/issues/43)

Dieses Dokument beschreibt den aktuell veröffentlichten Beta-Umfang. Der Produktionsstand und die
Funktionen auf `main` können sich unterscheiden: Die gehostete App verlangt derzeit noch eine
Einladung, obwohl die offene Registrierung im Code vorbereitet ist. Die Umstellung erfolgt erst mit
dem freigegebenen [Produktions-Rollout #164](https://github.com/moellenbeck-digital/BloomMD/issues/164).
README, Website und Tester-Kommunikation verwenden dieselbe Sprache, damit niemand etwas erwartet,
das noch nicht ausgeliefert ist.

## Enthalten

| Bereich | Was Tester erwarten dürfen |
|---|---|
| **Desktop-App** | **Der empfohlene Weg.** Arbeitet direkt auf einem lokalen Ordner, rendert den Ordner als Workspace-Mindmap mit Datei-, Ordner- und Heading-Nodes plus Querverweis-Edges, erkennt externe Änderungen über File Watching und öffnet konkrete `.md`-Dateien per Datei-Node. Braucht **keinen** Account und **keine** Cloud. |
| **Web-App** | Dieselbe Oberfläche im Browser. Der produktive Cloud-Zugang ist derzeit auf Einladungen beschränkt; nach Freigabe von #164 kann das vorbereitete offene Signup aktiviert werden. Command Palette, Fokus-, Outline- und Präsentationsmodus, gespeicherte Views. |
| **OKF / LLM-Wiki** | Wissensbündel im Open Knowledge Format v0.2 lesen und schreiben, Trust-Signale (`sources`, `generated`, `verified`, `status`, `stale_after`), deterministisches `status`/`lint`, und der Proposal-Workflow `propose → approve → apply` über CLI und MCP. Läuft lokal, ohne Modell und ohne Netzwerk. |
| **Kollaboration** | Realtime-Sync über Yjs mit Presence, dokumentgebundenen Tickets und Rollenprüfung. **Als Beta gekennzeichnet**, eine Instanz, nicht beworben. |
| **Obsidian-Plugin** | Die öffentlich verteilte Plugin-Beta 0.7.1 läuft auf Desktop, iPad, iPhone und Android. Sie bearbeitet lokale Vault-Notizen als Maps, ohne BloomMD-Konto. Das ist von der eigenständigen Mobile-App getrennt. |

## Ausdrücklich nicht enthalten

| Bereich | Warum |
|---|---|
| **Eigenständige Mobile-App in App Stores** | Der Capacitor-Build ist in Entwicklung; ein öffentlicher App-Store-Release ist ein eigener Lieferumfang. Das veröffentlichte Obsidian-Plugin auf Mobilgeräten ist davon unabhängig. |
| **Öffentlicher SaaS-Launch** | Die produktive Cloud-Beta ist noch einladungspflichtig. Offene Registrierung und Ende der Warteliste sind vorbereitet, aber noch nicht produktiv ausgerollt. Ein allgemeiner SaaS-Launch (Preise, Support-Zusagen, Spamschutz) ist eine weitere Entscheidung. |
| **Billing / bezahlte Pläne** | `BLOOMMD_BILLING_ENABLED=0`. Checkout, Portal und Webhook antworten 404. Es werden keine Zahlungsdaten erhoben. |
| **Template-Marktplatz** | [#81](https://github.com/moellenbeck-digital/BloomMD/issues/81), kein Milestone. |
| **VS-Code-Extension** | [#80](https://github.com/moellenbeck-digital/BloomMD/issues/80), kein Milestone. |
| **Gehostete autonome Agenten** | [#90](https://github.com/moellenbeck-digital/BloomMD/issues/90). Der Agent-Workflow ist bewusst review-pflichtig und läuft lokal. Nichts schreibt ohne namentliche Freigabe. |

## Desktop-Plattformen

M1 startete **macOS-first**. Die lokale Desktop-Beta ist inzwischen auch fuer Omarchy/Arch Linux
verfuegbar. Windows bleibt ein eigener spaeterer Beta-Release.

| System | Stand | Erster Start |
|---|---|---|
| macOS (arm64) | Lokale Beta, DMG auf der Downloadseite | Freigabehinweise auf der Downloadseite beachten |
| Omarchy/Arch Linux (x86_64, ARM64) | Lokale Beta als Pacman-Paket auf der Downloadseite | Paket installieren und lokalen Markdown-Ordner öffnen |
| Windows (x64) | **Nach M1.** Eigener Windows Beta Release. Das Secure-Store-Backend für Token (Windows Credential Manager, #73) ist vorhanden und per Unit-Test belegt, aber noch nicht auf echtem Windows geprüft; das gehört vor den Windows-Beta-Release | noch nicht Teil der Tester-Kommunikation |

Der historische M1-Build war ad-hoc signiert. Aktuelle Signatur und Installationshinweise stehen
bei den jeweiligen Artefakten auf der [Downloadseite](https://bloommd.io/download); alte M1-Angaben
sind keine Aussage ueber spaetere Desktop-Releases.

Ein `--env=stable`-Build legt die verteilbaren Dateien in `packages/desktop/artifacts/` ab, nicht in
`build/`: ein DMG (ca. 20 MB), ein komprimiertes App-Bundle und eine `update.json` für den
Auto-Updater. Auf macOS lokal erzeugt und als gültiges Disk-Image geprüft.

## Unabhängig vom Cloud-Zugang nutzbar

Wichtig für Tester, die keinen SaaS-Zugang haben oder ihn nicht wollen:

- **Desktop lokal** braucht keinen Account und keine Einladung. Dateien liegen standardmaessig in `~/bloommd`. Das ist der Hauptweg der Beta.
- **Lokale OKF-/Wiki-Bündel** funktionieren vollständig offline über `bloommd-wiki …` und den MCP-Transport.
- **Obsidian-Plugin 0.7.1** ist fuer Desktop, iPad, iPhone und Android oeffentlich verfuegbar und arbeitet lokal im Vault.
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
- Der Desktop-File-Watcher beobachtet `.md`-Dateien rekursiv; sehr schnelle externe Schreibvorgaenge werden ueber `awaitWriteFinish` zusammengezogen.

Aktuelle Bugs und Plattformgrenzen werden im [BloomMD-Board](https://github.com/orgs/moellenbeck-digital/projects/3)
gepflegt; historische M1-Befunde gelten nicht automatisch fuer die aktuellen Builds.
