# BloomMD: Wissens- und Handlungsschicht / Knowledge and action layer

> **Entwurf zur Produktplanung / Product planning draft.** Dieses Dokument ordnet den ersten Pilot und die nächsten Entscheidungen ein. Weder dieses Dokument noch die Reihenfolge unten sind Release-Zusagen. Das [GitHub Project Board](https://github.com/orgs/moellenbeck-digital/projects/3) bleibt die verbindliche Aufgabenquelle. / This document frames the first pilot and the next decisions. Neither this document nor the sequence below commits a release. The GitHub Project Board remains the source of truth for work.

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

Der [Learnings-Pilot #116](https://github.com/moellenbeck-digital/BloomMD/issues/116) nutzt einen lokalen Markdown-Vault auf einem Volume im Brand-Cluster, ohne eigenen Server und ohne Cloud-Workspace. Er prüft, ob das Brand- und Dev-Team bestätigte Learnings pflegen, mit Quellen und Gültigkeit finden und Änderungen von Agenten nachvollziehen kann. Ein Cloud-Workspace kommt erst in Betracht, wenn mehrere Pods schreibend zusammenarbeiten müssen. Brand-Wissen liegt für diesen Pilot nicht auf bloommd.app.

Der Pilot verwendet die Bausteine für [Trust-Felder und Suche #110](https://github.com/moellenbeck-digital/BloomMD/issues/110), [lokalen Betrieb #112](https://github.com/moellenbeck-digital/BloomMD/issues/112), [Dev-Team-Anbindung #113](https://github.com/moellenbeck-digital/BloomMD/issues/113) und [Preflight #171](https://github.com/moellenbeck-digital/BloomMD/issues/171). [Bereichsrechte #111](https://github.com/moellenbeck-digital/BloomMD/issues/111) werden bei einem späteren Cloud-Workspace relevant. Die Abnahmebedingungen bleiben in diesen Tickets.

### Reihenfolge für die Planung

| Schritt | Zu prüfendes Ergebnis | Voraussetzung |
| --- | --- | --- |
| 1. Markdown- und Wissenskern | Dateien bleiben portabel; Quellen, Verantwortliche, Gültigkeit und Korrekturen sind prüfbar. | #116 prüft den ersten internen Ablauf. |
| 2. Sync-Grundlage | Änderungen, Konflikte, Offline-Warteschlange und führende Quelle sind für Markdown-Dateien definiert und testbar. | Quellen- und Versionsmodell aus Schritt 1. |
| 3. Erste Konnektoren | Ein begrenzter Quellmodus (Mirror, Sync oder Reference) ist je Integration klar definiert; Schreibzugriffe warten auf passende Rechte. | Sync- und Konfliktmodell; konkrete Nutzerfrage. |
| 4. Identität und Rechte | Mensch und Agent erhalten nur den benötigten Bereich und eine widerrufbare Berechtigung; Entscheidungen sind protokolliert. | Rechtemodell und Tests, insbesondere #111. |
| 5. Suche mit Belegen | Relevante, zitierbare Antworten kommen ausschließlich aus erlaubten Quellen; föderierte Suche wird bei nachgewiesenem Bedarf geprüft. | Schritte 1 und 4; Bewertung gegen Referenzfragen. |
| 6. Wissenslebenszyklus | Prüfung, Freigabe, Veraltung und Rücknahme sind für Menschen verständlich und testbar. | Quellen, Rechte und Änderungsprotokoll. |
| 7. Agenten-Workflows | Vorschläge und Folgeaktionen bleiben begrenzt, nachvollziehbar und rücknehmbar. | Schritte 4 und 6. |
| 8. Enterprise-Funktionen | Größere Organisationsfunktionen werden einzeln nach Bedarf geprüft. | Nachweis aus den vorigen Schritten. |

SSO/SCIM, Ende-zu-Ende-Verschlüsselung, DLP und breit föderierte Suche sind mögliche spätere Themen. Ihre Aufnahme in diese Vision ist keine Entscheidung über Architektur, Termin oder Release. Die M1-Closed-Beta für macOS hat Vorrang; diese Vision schafft weder einen Meilenstein noch eine Kapazitätszusage. Für größere Ausbaustufen entstehen erst nach Scope- und Kapazitätsentscheidung konkrete Issues und Meilensteine.

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

The [learnings pilot #116](https://github.com/moellenbeck-digital/BloomMD/issues/116) uses a local Markdown vault on a volume in the brand cluster, without a separate server or cloud workspace. It tests whether the brand and development teams can maintain confirmed learnings, find them with source and validity context, and trace agent changes. A cloud workspace becomes relevant only if multiple pods need to write together. This pilot does not place brand knowledge on bloommd.app.

The pilot builds on work for [trust fields and search #110](https://github.com/moellenbeck-digital/BloomMD/issues/110), [local operations #112](https://github.com/moellenbeck-digital/BloomMD/issues/112), [development team integration #113](https://github.com/moellenbeck-digital/BloomMD/issues/113), and [preflight #171](https://github.com/moellenbeck-digital/BloomMD/issues/171). [Scoped rights #111](https://github.com/moellenbeck-digital/BloomMD/issues/111) become relevant for a later cloud workspace. Acceptance criteria remain with those issues.

### Planning sequence

1. Preserve portable Markdown and test provenance, ownership, validity, and correction in the real learnings workflow.
2. Define and test Markdown change tracking, conflicts, offline queues, and source ownership for sync.
3. Test initial connectors with an explicit mirror, sync, or reference mode; defer write access until rights are established.
4. Establish revocable human and agent rights with an auditable decision trail.
5. Evaluate permission-aware search with citations against reference questions; consider federated search when demand is demonstrated.
6. Make knowledge review, approval, staleness, and recovery understandable and testable.
7. Keep agent proposals and follow-up actions scoped, traceable, and reversible.
8. Consider broader organizational functions when earlier stages establish a need.

SSO/SCIM, end-to-end encryption, DLP, and broad federated search remain possible later directions, not architecture or release commitments. The M1 macOS closed beta takes priority; this vision creates neither a milestone nor a capacity commitment. Larger stages receive concrete issues and milestones only after scope and capacity decisions.
