# BloomMD als Wissens- und Handlungsschicht

> **Verbindliche Grundlage für alle Arbeiten an BloomMD** (Wissensdb, Tickets, Entwicklung).
> Quelle: Max Möllenbeck, 30.10.2026 (Matrix, #infrastruktur). Inhalt unverändert übernommen.
> Gilt für den BloomMD-Chief-of-Staff und das Dev-Team `bloommd`. Tickets, die dieser Grundlage nicht
> entsprechen oder veraltet sind, werden nicht weiterverfolgt, sondern zur Bereinigung vorgeschlagen
> (Schließen/Zusammenführen nur nach Freigabe Max).

## Zielbild

BloomMD könnte sich von einer visuellen Markdown-Map zu einer lokalen, offenen Wissens- und Handlungsschicht entwickeln, in der Menschen und Agenten sicher auf gemeinsames Wissen zugreifen und daran arbeiten.

## Geschärfte Positionierung

BloomMD sollte den Anspruch **„Markdown visuell“** ausdrücklich behalten. Externe Systeme erweitern den Kern, ersetzen ihn aber nicht. BloomMD ist damit ein ergänzendes System mit eigenem Zentrum:

> **BloomMD ist die visuelle Wissensschicht für Markdown – lokal nutzbar, mit externen Systemen verbunden und für Menschen und Agenten bearbeitbar.**

Die Rollenverteilung:

1. **Kern:** offene Markdown-Dateien, visuelle Maps, lokale Kontrolle und Versionsfähigkeit
2. **Verbindung:** externe Systeme werden gespiegelt, synchronisiert, referenziert oder föderiert durchsucht
3. **Handlungsschicht:** Suche, Agentic RAG, Rollen, Berechtigungen und Agenten-Workflows

Andere Systeme bleiben für ihre jeweilige Ablage oder Kommunikation zuständig. BloomMD macht die Beziehungen zwischen Wissen, Menschen und Agenten sichtbar und bearbeitbar.

Für jede externe Quelle sollte der Modus klar sein:

- **Mirror:** Inhalte werden als Markdown gespiegelt.
- **Sync:** Änderungen werden bidirektional abgeglichen.
- **Reference:** Inhalte bleiben am Ursprungsort; BloomMD hält Verknüpfung und Metadaten.
- **Federated Search:** Die Quelle bleibt extern, wird aber durchsucht und visuell verknüpft.

## 1. Wissensmodell und Provenienz

- Quellen und Belege
- Autor, Ersteller und Verantwortlicher
- Versionen und zeitliche Gültigkeit
- Beziehungen zwischen Dokumenten, Personen, Projekten und Entscheidungen
- Vertrauensgrad und Aktualität
- Widersprüche zwischen Quellen
- Entwürfe, gültiges und archiviertes Wissen
- vollständige Provenienz: „Woher stammt diese Antwort?“

Das ist die Grundlage für belastbares Agentic RAG.

## 2. Agentic RAG und Suche

Agentic RAG sollte mehr sein als reine Vektorsuche:

- hybride Suche: Volltext, semantisch und strukturell
- Graphsuche über Beziehungen
- ACL-bewusste Suche
- zeitbezogene Suche
- Quellenzitate und Nachvollziehbarkeit
- Aktualitäts- und Vertrauensbewertung
- Suchfeedback und Relevanzlernen
- föderierte Suche über lokale und externe Systeme
- Antwort-Evaluation gegen Referenzantworten

**Wichtig:** Semantische Suche darf niemals Berechtigungen umgehen.

## 3. Synchronisation und Offline-Fähigkeit

- lokale-first Datenhaltung
- Ereignislog oder CRDT-basierte Konfliktauflösung
- Offline-Warteschlangen
- Wiederaufnahme unterbrochener Synchronisation
- Konfliktansicht und manuelle Zusammenführung
- idempotente Änderungen
- Geräte- und Sitzungsverwaltung
- selektive Synchronisation einzelner Wissensräume
- Ende-zu-Ende-Verschlüsselung und Schlüsselverwaltung
- Import/Export ohne Cloud-Lock-in

Zentrale Frage: Was passiert, wenn zwei Agenten oder Menschen offline dieselbe Datei verändern?

## 4. Identität, Rollen und Delegation

- Menschen und Agenten als gleichwertige Identitäten
- Rollen und Gruppen
- Rechte auf Organisation, Workspace, Projekt, Ordner und Datei
- Rechte für Lesen, Erstellen, Ändern, Löschen, Senden und Ausführen
- Delegation und Stellvertretung
- Ablaufdatum und Widerruf
- Notfallzugriff („break glass“)
- vollständige Audit-Spur

Eine Berechtigung sollte ausdrücken:

> Wer darf was mit welchen Daten unter welchen Bedingungen bis wann?

Beispielrollen:

- **Chief of Staff:** Lesen und Schreiben in definierten Wissensräumen
- **Coding-Agent:** Lesen, aber kein direktes Schreiben
- **Research-Agent:** Lesen und Vorschläge erstellen
- **Publisher-Agent:** Veröffentlichen nur nach klarer Freigabe

Agenten sollten den kanonischen Wissensbestand nicht unkontrolliert überschreiben. Sinnvoll ist ein Lebenszyklus:

1. Vorschlag
2. Änderung
3. Review
4. Veröffentlichung
5. Rücknahme oder Wiederherstellung

## 5. Sicherheit und Governance

- Mandantentrennung
- SSO, SCIM und Gruppen aus dem Identity Provider
- Rollenvererbung
- Datenklassifizierung
- sensible Inhalte und DLP-Regeln
- Aufbewahrung und Löschung
- Export und Datenportabilität
- DSGVO-Prozesse
- Audit-Logs
- Verschlüsselung ruhender und übertragener Daten
- Datenresidenz und selbst betreibbare Komponenten

## 6. Konnektoren und offene Schnittstellen

Mögliche Quellen und Integrationen:

- Git und GitHub
- Obsidian, Notion und andere Wissenssysteme
- Google Drive, OneDrive und SharePoint
- Slack, Teams und E-Mail
- Ticketsysteme
- CRM und Projektmanagement
- Datenbanken und APIs
- MCP, Webhooks und ein eigenes SDK

Für jede Quelle muss klar sein, ob sie nur gelesen, gespiegelt oder als führendes System behandelt wird.

## 7. Wissenslebenszyklus

- neue Inhalte erkennen
- veraltete Inhalte markieren
- Verantwortliche benennen
- Review-Daten und Ablaufzeiten
- Dubletten erkennen
- widersprüchliche Aussagen melden
- Inhalte zusammenfassen oder konsolidieren
- Archivierung und Wiederherstellung
- Begründung, warum ein Dokument noch existiert

## 8. Agenten-Workflows

- Trigger auf neue oder geänderte Inhalte
- periodische Wissensprüfungen
- Aufgaben und Folgeaktionen
- Übergabe zwischen mehreren Agenten
- Eskalation an Menschen
- Dry-Run-Modus
- geplante Aktionen
- Budgets und Limits
- Rollback von Agentenänderungen
- standardisierte Tool- und Workflow-Verträge

## 9. Transparenz und Vertrauen

Nutzer sollten sehen können:

- welche Quellen verwendet wurden
- welche Quellen ausgeschlossen wurden
- welche Berechtigung eine Aktion erlaubt hat
- warum ein Agent eine Änderung vorgenommen hat
- welche Unsicherheit besteht
- welcher Agent oder welches Modell beteiligt war
- welche Daten an ein externes Modell übertragen wurden

## 10. Betrieb und Administration

- Sync- und Connector-Monitoring
- Indexierungsstatus
- fehlgeschlagene Importe
- Modell- und API-Kosten
- Rate-Limits und Quotas
- Gesundheitsstatus von Agenten
- Admin-Dashboard
- Test- und Simulationsumgebung für Berechtigungen
- Wiederherstellung nach Fehlern
- Backup und Disaster Recovery

## Empfohlene Umsetzungsreihenfolge

Die Positionierung als visuelle Markdown-Schicht verschiebt Sync deutlich nach vorn. Sync sollte früh kommen, aber nicht als Sammlung einzelner Integrationen. Zuerst braucht BloomMD ein stabiles Änderungs-, Konflikt- und Quellenmodell.

1. **Markdown-Kern und Wissensmodell schärfen** – Dateien, Beziehungen, Quellen, Versionen, Herkunft und Status
2. **Sync-Grundlage bauen** – Änderungsmodell, Konflikte, Offline-Warteschlange, Idempotenz und führende Quelle
3. **Erste hochwertige Connectoren** – zum Beispiel Git/GitHub, Obsidian und Google Drive
4. **Identität, Rollen und Agentenrechte** – Lesen, synchronisieren, ändern, veröffentlichen und delegieren
5. **Suche und Agentic RAG** – zunächst über lokale und synchronisierte Markdown-Inhalte, danach ACL-bewusst föderiert
6. **Wissenslebenszyklus und Governance**
7. **Agenten-Workflows, Review, Rollback und Automatisierung**
8. **Enterprise-Funktionen** – Mandanten, SSO, SCIM, Compliance, DLP und Administration

## Wichtigster zusätzlicher Themenblock

Neben Agentic RAG, Synchronisation und Suche ist **Agent Identity, Delegation & Governance** der entscheidende Baustein.

Ohne diese Schicht bleibt Agentic RAG nützlich, ist aber für echte persönliche und organisatorische Zusammenarbeit riskant.

## Konsequenz für die Produktstrategie

BloomMD muss nicht versuchen, Notion, SharePoint, Slack oder Git zu ersetzen. Die stärkere Position ist eine offene, visuelle und agentische Schicht über Markdown, die diese Systeme bei Bedarf verbindet. Sync ist deshalb kein nachgelagertes Komfortfeature, sondern ein identitätsstiftender Teil des Produkts: Er hält Markdown als offene, lokale Wissensbasis mit der Realität in externen Systemen verbunden.
