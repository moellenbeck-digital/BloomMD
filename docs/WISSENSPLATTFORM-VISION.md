# BloomMD: Wissens- und Handlungsschicht / Knowledge and action layer

> **Entwurf zur Produktplanung / Product planning draft.** Dieses Dokument ordnet den ersten Pilot und die nächsten Entscheidungen ein. Die [verbindliche Grundlage #188](https://github.com/moellenbeck-digital/BloomMD/issues/188) bestimmt die Produktstrategie, sobald sie freigegeben ist. Weder dieses Dokument noch die Reihenfolge unten sind Release-Zusagen. Das [GitHub Project Board](https://github.com/orgs/moellenbeck-digital/projects/3) bleibt die verbindliche Aufgabenquelle. / This document frames the first pilot and the next decisions. The foundation in issue #188 governs product strategy once approved. Neither this document nor the sequence below commits a release. The GitHub Project Board remains the source of truth for work.

## Deutsch

### Zielbild und Grenzen

BloomMD macht gewöhnliche Markdown-Dateien visuell bearbeitbar. Aus diesem Kern kann eine offene Wissens- und Handlungsschicht für Menschen und Agenten wachsen: Quellen bleiben auffindbar, Aussagen überprüfbar, Rechte wirksam und Änderungen nachvollziehbar. Die Map ist eine Ansicht auf Wissen; sie ersetzt weder die Dateien noch zwingt sie Nutzer in einen Cloud-Dienst.

Für jede Ausbaustufe gelten diese Produktprinzipien:

- **Markdown bleibt das native und portable Format.** Lokale Nutzung ohne Konto und Import/Export ohne Cloud-Bindung bleiben möglich.
- **Sync ist ein früher strategischer Baustein und für lokale Workspaces optional.** Er verbindet Markdown mit anderen Geräten und Quellen, ohne lokale Dateien still in einen zentralen Datenbestand umzuwandeln oder Konflikte zu verdecken.
- **Agenten handeln mit begrenzten Rechten.** Quellen, Identität, Zeitpunkt und Grund einer Änderung sind sichtbar; riskante Änderungen brauchen einen überprüfbaren Vorschlag, Freigabe oder eine Rücknahme.
- **Suche respektiert Rechte.** Weder semantische noch föderierte Suche darf Inhalte außerhalb des erlaubten Bereichs erschließen.
- **Produktbehauptungen folgen Nachweisen.** Vision, laufende Arbeit und ausgelieferter Stand werden getrennt beschrieben.

Die bestehende [README](../README.md), [Architektur](ARCHITECTURE.md) und der [Beta-Umfang](BETA-SCOPE.md) beschreiben den heutigen Produktkern. Dieses Dokument erweitert deren Richtung und ändert ihre aktuellen Zusagen nicht.

### Erster interner Nutzungsfall

Der [Learnings-Pilot #116](https://github.com/moellenbeck-digital/BloomMD/issues/116) ist der erste interne Nutzungsfall der Backend-Plattform. Er prüft, ob das Brand- und Dev-Team bestätigte Learnings als Markdown pflegen, mit Quellen und Gültigkeit finden und Änderungen von Agenten nachvollziehen kann. Dieser Pilot ist kein Ersatz für den lokalen Editor und keine Voraussetzung für dessen Nutzung.

Der Pilot verwendet die bereits geplanten Bausteine für [Trust-Felder und Suche #110](https://github.com/moellenbeck-digital/BloomMD/issues/110), [Bereichsrechte #111](https://github.com/moellenbeck-digital/BloomMD/issues/111), [Betrieb #112](https://github.com/moellenbeck-digital/BloomMD/issues/112), [Dev-Team-Anbindung #113](https://github.com/moellenbeck-digital/BloomMD/issues/113) und [Preflight #171](https://github.com/moellenbeck-digital/BloomMD/issues/171). Die Entscheidung über den Speicherort und die Abnahmebedingungen bleiben in diesen Tickets. Brand-Wissen wird nicht allein für den Pilot in die öffentliche App-Beta verschoben.

### Reihenfolge für die Planung

| Schritt | Zu prüfendes Ergebnis | Voraussetzung |
| --- | --- | --- |
| 1. Pilot und Vertrauensbasis | Quellen, Verantwortliche, Gültigkeit und Korrekturen sind im echten Learnings-Ablauf prüfbar. | #116 und seine bestehenden Teilaufgaben |
| 2. Sync-Grundlage | Änderungen, Konflikte, Offline-Warteschlange und führende Quelle sind für Markdown-Dateien definiert und testbar. | Quellen- und Versionsmodell aus Schritt 1 |
| 3. Erste Konnektoren | Ein begrenzter Quellmodus (Mirror, Sync oder Reference) ist je Integration klar definiert; Schreibzugriffe warten auf passende Rechte. | Sync- und Konfliktmodell; konkrete Nutzerfrage |
| 4. Identität und Rechte | Mensch und Agent erhalten nur den benötigten Bereich und eine widerrufbare Berechtigung; Entscheidungen sind protokolliert. | Rechtemodell und Tests, insbesondere #111 |
| 5. Suche mit Belegen | Ein begrenzter Anwendungsfall liefert relevante, zitierbare Antworten ausschließlich aus erlaubten Quellen. | Schritte 1 und 4; Bewertung gegen Referenzfragen |
| 6. Wissenslebenszyklus und Handlungen | Vorschläge, Freigaben, Veraltung und Rücknahme sind für Menschen verständlich und testbar. | Quellen, Rechte und Änderungsprotokoll |
| 7. Erweiterung | Föderierte Suche und größere Organisationsfunktionen werden einzeln geprüft. | Bedarf und Nachweis aus den vorigen Schritten |

SSO/SCIM, Ende-zu-Ende-Verschlüsselung, DLP und breit föderierte Suche sind mögliche spätere Themen. Ihre Aufnahme in diese Vision ist keine Entscheidung über Architektur, Termin oder Release. Für größere Ausbaustufen entstehen erst nach Scope- und Kapazitätsentscheidung konkrete Issues und Meilensteine.

### Übergabe und nächste Entscheidung

Lesereihenfolge für den Chief of Staff:

1. [README](../README.md) und [Beta-Umfang](BETA-SCOPE.md): heutiger Produktkern und aktuelle Zusagen.
2. [Architektur](ARCHITECTURE.md): Datenformat, lokale Nutzung, Sync und bestehende Sicherheitsgrenzen.
3. [Learnings-Modell](LEARNINGS.md) und [Learnings-Ablage](LEARNINGS-ABLAGE.md): vorhandene Regeln und Betrieb des ersten internen Pilots.
4. [Grundlage #188](https://github.com/moellenbeck-digital/BloomMD/issues/188) mit [Draft-PR #189](https://github.com/moellenbeck-digital/BloomMD/pull/189): verbindliche Positionierung, separat freizugeben.
5. Dieses Visionsdokument und [Pilot #116](https://github.com/moellenbeck-digital/BloomMD/issues/116): Einordnung, offene Entscheidungen und erster realer Nutzen.

Briefing für den Brand Chief of Staff:

> BloomMD bleibt ein offener, lokal nutzbarer Markdown-Workspace. #116 ist unser erster interner Test der Backend-Funktionen für bestätigte Learnings. Bitte prüfe den Pilot anhand der vorhandenen Tickets und benenne Nutzer, Erfolgskriterien, zulässigen Speicherort und Rechte. Schlage erst nach der Abnahme den nächsten Anwendungsfall vor. Die größere Wissensplattform-Vision ist eine Richtung, keine Freigabe für zusätzliche Releases.

Der Chief of Staff beantwortet dabei vier Fragen: Wer nutzt den Pilot? Woran messen wir seinen Nutzen und seine Zuverlässigkeit? Welcher Speicherort und welche Rechte sind zulässig? Welcher nächste Anwendungsfall folgt nur bei erfolgreicher Abnahme? Die [verbindliche Grundlage #188](https://github.com/moellenbeck-digital/BloomMD/issues/188) und ihr [Draft-PR #189](https://github.com/moellenbeck-digital/BloomMD/pull/189) haben eine eigene Freigabe und werden durch dieses Dokument nicht ersetzt.

Die Reihenfolge folgt der verbindlichen Grundlage aus #188: Markdown-Kern, Sync-Grundlage, erste Konnektoren, Identität/Rechte, Suche, Lebenszyklus, Agenten-Workflows und später Enterprise-Funktionen. Der Pilot #116 prüft den ersten internen Nutzen innerhalb dieses Wegs; er verschiebt Sync nicht ans Ende. Die Reihenfolge gehört ins Epic und in verlinkte Teil-Issues im BloomMD-Board. Ein neuer Meilenstein entsteht erst für einen beschlossenen, testbaren Lieferumfang einschließlich Versionen, Artefakten, Dokumentation und Release-Kommunikation.

## English

### Direction and boundaries

BloomMD makes ordinary Markdown files visually editable. From that foundation, it may grow into an open knowledge and action layer for people and agents: sources remain traceable, claims verifiable, permissions effective, and changes reviewable. The map is a view of knowledge. It does not replace the files or require a cloud service.

Every stage must preserve these product principles:

- **Markdown remains the native, portable format.** Local use without an account and import/export without cloud lock-in remain possible.
- **Sync is an early strategic capability and optional for local workspaces.** It connects Markdown to other devices and sources without silently turning local files into centrally owned data or hiding conflicts.
- **Agents have scoped rights.** The source, identity, time, and reason for a change are visible; consequential changes require a reviewable proposal, approval, or recovery path.
- **Search enforces permissions.** Semantic and federated search must not reveal content outside the caller's authorized scope.
- **Claims follow evidence.** The vision, work in progress, and shipped behavior are described separately.

The [README](../README.md), [architecture](ARCHITECTURE.md), and [beta scope](BETA-SCOPE.md) describe the current product. This document extends their direction without changing current delivery commitments.

### First internal use case

The [learnings pilot #116](https://github.com/moellenbeck-digital/BloomMD/issues/116) is the backend platform's first internal use case. It tests whether the brand and development teams can maintain confirmed learnings as Markdown, find them with source and validity context, and trace agent changes. It does not replace the local editor or make the editor depend on a backend.

The pilot builds on existing work for [trust fields and search #110](https://github.com/moellenbeck-digital/BloomMD/issues/110), [scoped rights #111](https://github.com/moellenbeck-digital/BloomMD/issues/111), [operations #112](https://github.com/moellenbeck-digital/BloomMD/issues/112), [development team integration #113](https://github.com/moellenbeck-digital/BloomMD/issues/113), and [preflight #171](https://github.com/moellenbeck-digital/BloomMD/issues/171). Storage and acceptance decisions remain with those issues. The pilot does not require moving brand knowledge into the public app beta.

### Planning sequence

1. Test provenance, ownership, validity, and correction in the real learnings workflow.
2. Define and test Markdown change tracking, conflicts, offline queues, and source ownership for sync.
3. Test a small set of connectors with an explicit mirror, sync, or reference mode; defer write access until rights are established.
4. Establish revocable human and agent rights with an auditable decision trail.
5. Evaluate permission-aware search with citations against a limited set of reference questions.
6. Make knowledge review, proposals, approvals, and recovery understandable and testable.
7. Consider federated search and broader organizational features when earlier stages establish a need.

SSO/SCIM, end-to-end encryption, DLP, and broad federated search remain possible later directions, not architecture or release commitments.

### Handoff and next decision

Reading order for the Chief of Staff:

1. [README](../README.md) and [beta scope](BETA-SCOPE.md): current product foundation and commitments.
2. [Architecture](ARCHITECTURE.md): file format, local use, sync, and existing security boundaries.
3. [Learnings model](LEARNINGS.md) and [learnings storage](LEARNINGS-ABLAGE.md): existing rules and operations for the first internal pilot.
4. [Foundation issue #188](https://github.com/moellenbeck-digital/BloomMD/issues/188) and [draft PR #189](https://github.com/moellenbeck-digital/BloomMD/pull/189): authoritative positioning, subject to separate approval.
5. This vision draft and [pilot #116](https://github.com/moellenbeck-digital/BloomMD/issues/116): framing, open decisions, and first real use.

Brief for the brand Chief of Staff:

> BloomMD remains an open, locally usable Markdown workspace. #116 is our first internal test of backend capabilities for confirmed learnings. Please assess the pilot through the existing issues and identify its users, success criteria, acceptable storage, and permissions. Propose the next use case after the pilot has passed acceptance. The broader knowledge platform vision is a direction, not approval for additional releases.

The brief asks who will use the pilot, how its value and reliability will be measured, which storage and rights model is acceptable, and which use case should follow a successful pilot. The separate [foundation issue #188](https://github.com/moellenbeck-digital/BloomMD/issues/188) and [draft PR #189](https://github.com/moellenbeck-digital/BloomMD/pull/189) retain their own approval requirement.

The sequence follows the foundation in #188: Markdown core, sync, initial connectors, identity and rights, search, knowledge lifecycle, agent workflows, and later enterprise capabilities. Pilot #116 tests the first internal value along this path; it does not move sync to the end. The epic and linked issues establish execution order in the BloomMD board. A new milestone is warranted only for an agreed, testable delivery scope with versions, artifacts, documentation, and release communication.
