# Rechte und Delegation: Scope und Vorschlag (Ticket #262)

**Status: Scope-Dokument und Vorschlag. Keine Funktionszusage, kein Termin, kein Produktivcode.**
Die Entscheidung in Abschnitt 3 ist ein Vorschlag und wartet auf die Owner-Entscheidung. Die Abnahmefälle in
Abschnitt 5 sind zur Übernahme in [#347](https://github.com/moellenbeck-digital/BloomMD/issues/347) vorgesehen.
Planung: W2/Backlog, [#415](https://github.com/moellenbeck-digital/BloomMD/issues/415) hat weiter Vorrang.

Stand der Code-Aussagen: **Commit `d5bfd8a`** (`main`, 28.11.2026). Jede Aussage zum Ist-Zustand nennt Datei und
Zeile; ändert sich der Code, gilt die Zeile dieses Commits. „Belegt“ heißt: im Code gefunden und gelesen.
„Fehlt“ heißt: dort nicht gefunden (Suche nach Aufrufen von `agentGate`, `accessFor` und Rollenprüfung in den
genannten Dateien und Routen). Roadmap-Einordnung: Thema 4 in
[WISSENSPLATTFORM-ROADMAP.md](WISSENSPLATTFORM-ROADMAP.md). Grundlagen:
[#34](https://github.com/moellenbeck-digital/BloomMD/issues/34) (Agent-Tokens),
[#111](https://github.com/moellenbeck-digital/BloomMD/issues/111) (Agent-Rechte),
[#260](https://github.com/moellenbeck-digital/BloomMD/issues/260) (Suche).
Diese Tickets bleiben unverändert.

## Inhalt

1. [Anwendungsfall und Sicherheitsgrenze](#1-anwendungsfall-und-sicherheitsgrenze)
2. [Rechtematrix](#2-rechtematrix)
3. [Entscheidung (Vorschlag)](#3-entscheidung-vorschlag)
4. [Eine serverseitige Grenze](#4-eine-serverseitige-grenze)
5. [Abnahmefälle](#5-abnahmefälle)
6. [Offene Punkte und vorgeschlagene Folgetickets](#6-offene-punkte-und-vorgeschlagene-folgetickets)
7. [English summary](#7-english-summary)

## 1. Anwendungsfall und Sicherheitsgrenze

### 1.1 Anwendungsfall

Die Namen sind Platzhalter. **Team A** hält internes Wissen zurück. Menschen und Agenten von **Team B** dürfen
davon nichts bekommen, auf keinem dieser Wege:

- Suche, Treffer-Titel und Metadaten (Dateiname, Bereichsname, Frontmatter),
- Zusammenfassungen und Antworten, die aus dem Inhalt gebildet sind,
- Verlauf (Versionen), Export und Sync,
- einen berechtigten Agenten, der für Team B antwortet.

### 1.2 Was BloomMD zusagen kann und was nicht

- **Nicht zurückholbar:** Klartext, der schon an einen externen Agenten, ein Modell oder einen Menschen
  ausgeliefert wurde, kann BloomMD nicht zurückholen. Ein späterer Widerruf verhindert nur weitere Auslieferung.
  Auch eine Kopie im Kontext einer Agentensitzung, in einem Modellanbieter oder in einer Erinnerung des Agenten
  liegt außerhalb von BloomMD.
- **Zusage nur für einen kontrollierten Ablauf:** Eine Zusage kann nur für einen definierten Ablauf gelten, in dem
  BloomMD die Auslieferung kontrolliert: Agentenlaufzeit und Werkzeuge sind benannt, der Agent erhält Inhalt nur
  über die serverseitige Grenze aus Abschnitt 4, und der Ablauf endet bei Widerruf. Wer einen eigenen Agenten
  außerhalb dieses Ablaufs betreibt, trägt das Restrisiko selbst; die Dokumentation nennt es.
- **Keine geteilten Owner-Zugangsdaten.** Ein Agent oder Dienst nutzt nie das Konto, die Sitzung oder den Token
  eines Menschen mit. Jede Identität hat eigene, widerrufbare Zugangsdaten (heute: Agent-Token mit Name,
  Workspace-Bindung und Ablauf, `apps/app/src/lib/agent-gate.ts:39`, `packages/sync/src/persistence.ts:186`).

## 2. Rechtematrix

Alle Zellen sind **Soll-Vorschlag**, nicht Ist-Zustand. Der Ist-Zustand steht in Abschnitt 4.

**Zustände:** `kein` = kein Zugriff (auch nicht auf Existenz, Titel und Metadaten), `Lesen`, `Vorschlagen`
(Änderung wird als Vorschlag gespeichert, ein Mensch übernimmt), `Schreiben`.
**Bereiche:** `privat A` (nur Team A), `privat B` (nur Team B), `gemeinsam` (Team A und B).

### 2.1 Zustand je Akteur und Bereich

| Akteur | privat A | privat B | gemeinsam |
| --- | --- | --- | --- |
| **Team A (Mensch)** | Rolle des Menschen: Lesen oder Schreiben | kein | Rolle des Menschen: Lesen oder Schreiben |
| **Team B (Mensch)** | kein | Rolle des Menschen: Lesen oder Schreiben | Rolle des Menschen: Lesen oder Schreiben |
| **Agent A** (von Team A beauftragt) | höchstens Lesen oder Vorschlagen; Schreiben nur ausdrücklich je Aufgabe | kein | höchstens Lesen oder Vorschlagen |
| **Agent B** (von Team B beauftragt) | kein | höchstens Lesen oder Vorschlagen; Schreiben nur ausdrücklich je Aufgabe | höchstens Lesen oder Vorschlagen |
| **Autonome Dienstidentität** (ohne Beauftragenden, z. B. geplanter Lauf) | kein, solange nicht ausdrücklich zugewiesen | kein, solange nicht ausdrücklich zugewiesen | höchstens Vorschlagen |

Regeln zur Matrix:

1. **Delegation = Schnittmenge.** Ein Agent darf, was **alle drei** erlauben: die Rechte des beauftragenden
   Menschen, die eigenen Rechte des Agenten (Token) und der Umfang der konkreten Aufgabe (Dokument, Bereich,
   Zeitraum). Der Agent erweitert nie die Rechte seines Beauftragenden. Berechnet wird bei **jeder** Anfrage, nicht
   nur beim Start der Aufgabe.
2. **Der Antwortempfänger zählt.** Antwortet Agent A einem Menschen, gelten zusätzlich dessen Rechte: Der Agent
   gibt dem Empfänger nichts aus, was der Empfänger selbst nicht lesen dürfte (Fall 5.2).
3. **Die Dienstidentität hat keine eigenen Inhaltsrechte.** Sie arbeitet nur im zugewiesenen Aufgabenumfang. Wer
   ihr einen Umfang zuweist, muss ihn selbst haben.
4. **Schreiben und Suchen folgen derselben Grenze** (Abschnitt 4). Was ein Akteur nicht lesen darf, darf er auch
   nicht vorschlagen, verschieben, kopieren oder per Suche finden.
5. **Ohne Zuordnung gilt `kein`.** Heute fällt ein fehlender oder kaputter Eintrag auf `propose` zurück
   (`packages/core/src/agent-ledger.ts:172`, `apps/app/src/lib/db.ts:5163`), und `propose` schließt Lesen ein.
   Für `kein` müsste der Rückfall eine Absage sein (Abschnitt 3.4).

### 2.2 Weitergabe, Export, Ablauf, Widerruf

| Akteur | Weitergabe / Export | Ablauf | Widerruf |
| --- | --- | --- | --- |
| **Team A / Team B (Mensch)** | Export und Weitergabelinks nur für Bereiche mit Leserecht; Export enthält nie fremde Bereiche | Mitgliedschaft bis zum Entzug; keine Frist vorgeschlagen | Entzug der Mitgliedschaft wirkt auf neue Anfragen, offene Streams und Caches (Fall 5.14) |
| **Agent A / Agent B** | Kein Export, kein Weitergabelink ohne Schreibrecht im Bereich **und** ausdrückliche Freigabe des Tokens (so heute für Weitergabelinks, `apps/app/src/app/api/mindmaps/[filename]/share-links/route.ts:15,62-65`) | Delegation hat ein Ablaufdatum; Aufgaben enden mit der Aufgabe (Token-Ablauf heute belegt, `packages/sync/src/persistence.ts:187`) | Widerruf bricht laufende Aufgaben und Streams ab und leert warme Caches. **Widerrufsfrist: offen** (Abschnitt 6) |
| **Autonome Dienstidentität** | Kein Export, kein Weitergabelink | Kurze Laufzeit je Auftrag; Verlängerung nur durch einen Menschen | Wie Agent; zusätzlich kann der Beauftragende den Auftrag einzeln widerrufen |

## 3. Entscheidung (Vorschlag)

> **Vorschlag zur Owner-Entscheidung. Nicht beschlossen.**

### 3.1 Vorschlag

**Workspace- oder Vault-Trennung zuerst. Unterbereichsrechte nur, wenn der Fall sie nachweislich braucht.**
Team A und Team B arbeiten in getrennten Workspaces (Cloud) oder getrennten Vaults (lokal). Ein gemeinsamer Bereich
ist ein dritter Workspace oder Vault mit eigener Mitgliederliste. Ein Agent-Token ist an genau die Workspaces
gebunden, die er braucht.

### 3.2 Begründung

- **Die vorhandene Grenze ist hart und mehrfach durchgesetzt.** Mitgliedschaft entscheidet in der Abfrage selbst
  (`apps/app/src/lib/db.ts:2433-2446` Direktabruf, `:4882-4888` Export), der Agent-Token ist an Workspaces gebunden
  (`apps/app/src/lib/token-workspace.ts:9`), und der Sync-Server prüft Mitgliedschaft und Token bei Verbindung und
  bei jeder Nachricht (`packages/sync/src/persistence.ts:175-210`, `packages/sync/src/server.ts:189-205,256`).
- **Ein Leseverbot für Unterbereiche gibt es heute nicht.** `AgentAccessConfig.areas` deckt Bereichsrechte fürs
  **Schreiben** ab (`read`/`propose`/`write`, `packages/core/src/agent-ledger.ts:12,15-20`), `accessFor` wählt die
  längste passende Bereichsregel (`:190`). **Ein Zustand „kein Zugriff“ fürs Lesen fehlt**: `read` ist die
  niedrigste Stufe (`STRICTNESS`, `:182`), und der GET-Handler prüft keine Bereiche
  (`apps/app/src/app/api/mindmaps/[filename]/route.ts:40-56`).

### 3.3 Was das für die Wahl zwischen Workspace und Unterbereich bedeutet

| Frage | Workspace / Vault trennen | Unterbereichsrecht |
| --- | --- | --- |
| Schutz vor Team B | Besteht schon: Nichtmitglieder erhalten das Dokument nicht (`db.ts:2438`) | Müsste neu gebaut werden: Zustand `kein`, Rückfall `kein`, Lesefilter an jedem Weg aus Abschnitt 4 |
| Menschen | Rolle `owner`/`editor`/`viewer` je Workspace (`db.ts:617-621`) | Menschen haben **keine** Bereichsrechte; `areas` gilt nur für Agent-Tokens (`agent-gate.ts:39-44`). Bereichsrechte für Menschen wären neu |
| Metadaten-Leck | Keine: Liste enthält nur Dokumente des eigenen Workspace | Dateiname trägt Bereich und Titel (`agent-ledger.ts:137`); die Liste (`mindmap-storage.ts:115`) müsste filtern, sonst verrät sie Titel |
| Aufwand | Konfiguration, kein Code | Änderung an Typ, Gate, Liste, Direktabruf, Suche, Historie, Export, Sync-Ticket, Rooms, Agentenkontext, Audit |
| Preis | Querverweise und gemeinsame Suche über Workspaces hinweg gibt es nicht; wer in mehreren Workspaces arbeitet, wechselt | Ein Workspace, gemeinsame Sicht, dafür dauerhafte Pflicht, jeden neuen Lesepfad zu prüfen |

**Folgerung:** Reicht die Trennung in Workspaces, braucht der Fall **keine** neue Lesegrenze. Unterbereichsrechte
lohnen sich erst, wenn ein belegter Fall einen gemeinsamen Workspace mit Querverweisen **und** ein Leseverbot
braucht. Dann ist `kein` ein neuer Zustand mit Rückfall `kein`, und alle Wege aus Abschnitt 4 müssen vor der ersten
Zusage durch dieselbe Grenze laufen.

### 3.4 Vertrauensgrenzen und verantwortliche Komponenten

| Grenze | Wer sie hält | Was sie schützt | Was sie nicht schützt |
| --- | --- | --- | --- |
| Nutzer ↔ App-API | App-API (`apps/app`): Identität, Workspace-Mitgliedschaft, Token-Bindung | Direktabruf, Liste, Schreibwege | Inhalt, der schon beim Empfänger liegt |
| Nutzer/Agent ↔ Sync-Server | Sync-Server (`packages/sync`): Ticket, Mitgliedschaft und Token-Prüfung je Nachricht | Live-Bearbeitung, Widerruf offener Verbindungen (Schließen mit Code 4003) | Leserecht je Bereich (Ticket gibt es für jedes lesbare Dokument, `sync-ticket/route.ts:34-36`) |
| Agent ↔ Dokument | Agent-Gate und Ledger (`agent-gate.ts`, `agent-ledger.ts`): `read`/`propose`/`write` je Bereich, Vorschläge, Änderungsprotokoll | Schreiben und Weitergabelinks | Lesen nach Bereich |
| Frage ↔ Treffer | Suche und Index (`packages/core/src/workspace-search.ts`, `packages/wiki-cli/src/knowledge-service.ts`) | nichts: Funktion nimmt Dateien entgegen und filtert nicht nach Rechten (`workspace-search.ts:71`) | Treffer, Titel, Auszug |
| Agent ↔ Modell/Werkzeug | Agent-Laufzeit (`packages/agent-runtime`, Plugin, externe Agenten) | Kontext je Aufgabe (ein Dokument, `ARCHITECTURE.md`, Abschnitt „Workspace Agents“) | Erinnerungen, Modell-Caches, Kopien beim Anbieter |
| Prozess ↔ Datei | Lokales Dateisystem mit OS- und Container-Rechten | Lokale Vaults: Rechte in `.bloommd/agent.json` setzt nur der CLI-/Plugin-Prozess durch | Ein Prozess mit Dateizugriff liest am Rechtecheck vorbei; hier schützen nur Betriebssystem und Container |

Wichtig für die Zusage: Die Grenze **Agent ↔ Modell/Werkzeug** und **Prozess ↔ Datei** liegt außerhalb der App.
Die Zusage gilt dort nur für eine benannte, kontrollierte Laufzeit (Abschnitt 1.2).

## 4. Eine serverseitige Grenze

Ziel: **Eine** Prüfung entscheidet über jeden Weg, serverseitig und vor Ranking und Antwort. Clients, Suche, Agenten
und Caches fragen diese Grenze, statt eigene Regeln zu führen. Schreib- und Suchrechte folgen derselben Grenze.

Spalte „Ist“: **belegt** = Prüfung vorhanden, **teils** = für einen Teil der Akteure, **fehlt** = nicht gefunden.
Pfade sind relativ zum Repository, Stand `d5bfd8a`.

| Weg | Ist (Stand `d5bfd8a`) | Soll |
| --- | --- | --- |
| **Direktabruf** | **Teils.** `GET` liest über `store.read` (`apps/app/src/app/api/mindmaps/[filename]/route.ts:40-56`, `apps/app/src/lib/mindmap-storage.ts:122`); Workspace-Mitgliedschaft entscheidet (`db.ts:2438`). Ein Agent-Token ruft `agentGate` im GET nicht auf, liest also jedes Dokument seines Workspace. Bereichsprüfung fehlt | Eine Rechteprüfung je Dokument vor dem Lesen; `kein` antwortet wie „nicht vorhanden“ (gleicher Status und Text), damit Existenz und Titel nicht verraten werden |
| **Liste** | **Fehlt (Bereiche).** `GET /api/mindmaps` liefert alle Dokumente des Workspace (`apps/app/src/app/api/mindmaps/route.ts:54`, `mindmap-storage.ts:115`); der Dateiname trägt Bereich und Titel (`agent-ledger.ts:137`) | Liste enthält nur, was der Akteur lesen darf; Bereichsnamen anderer Bereiche erscheinen nirgends |
| **Suche** | **Fehlt.** Keine Suchroute unter `apps/app/src/app/api`; Suche läuft in `searchWorkspace` (`packages/core/src/workspace-search.ts:71`, „files in, hits out“) und `KnowledgeService.search` (`packages/wiki-cli/src/knowledge-service.ts:455`) über die Dateien, die Liste und Abruf liefern. Sie erbt deren Lücke. Der Kommentar bei `knowledge-service.ts:434` beschreibt Absicht („a cloud area the token may not see“), im Server-GET ist dazu kein Filter belegt | Rechtefilter **vor** Index und Ranking, nicht erst am Treffer; Trefferzahl, Reihenfolge und „keine Treffer“ dürfen nichts über geschützte Dokumente verraten. [#260](https://github.com/moellenbeck-digital/BloomMD/issues/260) |
| **Vorschau (Auszug)** | **Fehlt.** `WorkspaceSearchHit.excerpt` (`workspace-search.ts:36`) hängt an der Suche. Die öffentliche Wiki-Route liest nur das Bundle aus `BLOOMMD_WIKI_DIR` (`apps/app/src/app/api/wiki/route.ts:20-30`), keinen Workspace-Inhalt | Auszug nur aus Dokumenten, die die Grenze freigibt; ein geschützter Bereich darf nie in ein öffentliches Wiki-Bundle gelangen |
| **Zitat** | **Fehlt.** Kein eigener Zitatpfad mit Rechteprüfung gefunden; ein Zitat ist heute so sicher wie der Kontext, aus dem es stammt | Zitat nennt nur Quellen, die der **Empfänger** lesen darf; sonst fehlt das Zitat, ohne Hinweis auf die Quelle |
| **Historie** | **Teils.** Agent-Tokens sind ausgeschlossen (`mindmaps/[filename]/history/route.ts:15,21,51`). Menschen sehen den Verlauf jedes Dokuments im Workspace, `viewer` stellt nicht wieder her (`:37`); keine Bereichsprüfung | Verlauf folgt dem Leserecht des **aktuellen** Dokuments; ein Umzug in einen geschützten Bereich schützt auch alte Versionen |
| **Export** | **Teils.** `GET /api/account/export` nur mit Sitzung, nicht mit Token (`apps/app/src/app/api/account/export/route.ts:5-18`); `exportAccountData` liefert alle Dokumente aller Workspaces des Kontos (`db.ts:4845`, `:4882-4888`), nach Mitgliedschaft, nicht nach Bereich. Weitergabelinks verlangen für Agenten Schreibrecht im Bereich und Freigabe des Tokens (`share-links/route.ts:15,62-65`) | Export und Weitergabelink nur für lesbare Dokumente; Agenten und Dienstidentitäten exportieren nichts |
| **Sync** | **Teils.** Ticket für Agenten ist auf Lesen begrenzt, wo kein Schreibrecht besteht (`apps/app/src/app/api/sync-ticket/route.ts:34-36`); der Sync-Server prüft Token (nicht widerrufen, nicht abgelaufen, an Workspace gebunden) und Bereichsrecht bei Verbindung (`packages/sync/src/persistence.ts:175-210`) sowie Mitgliedschaft bei jeder Nachricht, Schließen mit 4003 (`packages/sync/src/server.ts:189-205,256`). Ein Ticket für **Lesen** gibt es für jedes Dokument des Workspace | Ticket und jede Nachricht prüfen das Leserecht neu; Widerruf schließt die Verbindung. Offener Punkt: Wie lange Räume Inhalt im Speicher halten (`packages/sync/src/rooms.ts:29`, ruhende Räume behalten ihren Yjs-Verlauf für Wiederverbindung) |
| **Agentenkontext** | **Teils.** Ein beauftragter Workspace-Agent erhält genau einen begrenzten Kontext: ein Dokument, Version, Workspace-Name, Aufgaben-ID (`docs/ARCHITECTURE.md`, Abschnitt „Workspace Agents“, ab Zeile 129). Ob der **Empfänger** der Antwort das Dokument lesen darf, wird nicht geprüft | Kontext = Schnittmenge aus Beauftragendem, Agent, Aufgabe **und** Antwortempfänger; Antwort an einen Unberechtigten enthält nichts aus geschütztem Kontext |
| **Caches / Erinnerungen** | **Fehlt (außerhalb BloomMD).** Agentensitzungen, Modellkontexte und Erinnerungen liegen in der Agentenlaufzeit; BloomMD kennt sie nicht | Kontrollierter Ablauf: keine dauerhaften Erinnerungen aus geschütztem Inhalt, Kontext endet mit der Aufgabe, Widerruf leert Caches; für andere Agenten dokumentierte Restrisiko-Zusage (Abschnitt 1.2) |
| **Schreiben** (Speichern, Anlegen, Umbenennen, Löschen) | **Belegt für Agent-Tokens.** `agentGate` vor `PUT`/`PATCH`/`DELETE` (`mindmaps/[filename]/route.ts:89,182-183,244`) und `POST` (`mindmaps/route.ts:92`); beim Umbenennen werden alter und neuer Name geprüft (`:183`). Ohne Cloud-Datenbank sind Agent-Tokens für Änderungen gesperrt (`mindmap-storage.ts:175`) | Unverändert, plus Prüfung gegen die gemeinsame Grenze; Verschieben und Kopieren prüfen Quelle und Ziel |
| **Audit** | **Teils.** Schreibvorgänge mit Agent-Token werden protokolliert (`apps/app/src/lib/agent-audit.ts:5`); Sicherheitsereignisse sind inhaltsfrei (`docs/ARCHITECTURE.md`, Abschnitt „Security Boundary“). Lesen und **abgelehnte** Zugriffe werden nicht aufgezeichnet | Jede Entscheidung (erlaubt und abgelehnt) nennt Akteur, Bereich, Aktion, Entscheidung und Zeit, ohne Inhalt, Titel und Dateinamen |

## 5. Abnahmefälle

Zur Übernahme in [#347](https://github.com/moellenbeck-digital/BloomMD/issues/347). Aufbau: zwei Workspaces
(privat A, privat B), optional ein gemeinsamer Bereich. „Erwartet“ gilt für den Soll-Zustand aus Abschnitt 4.
Fälle ohne Unterbereichsrecht (nur Workspace-Trennung) sind mit **[W]** markiert, sie gelten auch bei der
vorgeschlagenen Trennung zuerst.

### A. Negative Fälle (Zugriff muss scheitern)

| Nr. | Akteur | Aktion | Erwartet |
| --- | --- | --- | --- |
| 5.1 | Team B (Mensch) | Sucht nach einem Titel aus Team A, nach einem Wort aus dem Inhalt und nach einem Bereichsnamen | Keine Treffer, kein Titel, kein Auszug, keine Metadaten; Trefferzahl und Antwortform unterscheiden sich nicht von „nichts gefunden“ **[W]** |
| 5.2 | Agent A (berechtigt) im Auftrag von Team B (Mensch) | Team B fragt nach einer Information, die nur in privat A steht | Agent antwortet nicht aus geschütztem Kontext (Antwortempfänger zählt); Antwort enthält keine Zusammenfassung, kein Zitat und keinen Titel aus A |
| 5.3 | Team B (Mensch) | Ruft ein Dokument von A direkt per Dateiname auf | Antwort identisch zu „nicht vorhanden“; kein Hinweis auf Existenz **[W]** |
| 5.4 | Team B (Mensch) | Liest die Dokumentliste | Kein Dokument, kein Bereichsname von A **[W]** |
| 5.5 | Team B (Mensch) | Verschiebt ein gemeinsames Dokument in privat A und liest danach (auch Verlauf und Liste) | Verschieben erweitert den Schutz nicht: B verliert den Zugriff auf das verschobene Dokument samt alter Versionen, oder die Aktion wird abgelehnt; eine Zielprüfung ist nötig |
| 5.6 | Team A (Mensch) | Kopiert ein Dokument aus privat A nach gemeinsam | Kopie trägt nicht heimlich den Schutz ab: entweder abgelehnt oder ausdrückliche Bestätigung mit Audit-Eintrag; der Schutz des Originals bleibt unverändert |
| 5.7 | Team A (Mensch) | Benennt ein Dokument um (Titel oder Bereichsname) | Schutz folgt dem Dokument, nicht dem Namen; kein Name erscheint bei Team B, auch nicht in Verlauf oder Audit |
| 5.8 | Team B (Mensch) | Verlauf eines Dokuments aus A aufrufen oder alte Version wiederherstellen | Abgelehnt wie 5.3 |
| 5.9 | Team B (Mensch) | Konto-Export und Weitergabelink | Export enthält nur Workspaces mit Mitgliedschaft; Link für Dokument aus A nicht möglich **[W]** |
| 5.10 | Agent B | Liest, schlägt vor oder schreibt in privat A | Abgelehnt; kein Vorschlag landet bei Team A, kein Eintrag verrät den Titel |
| 5.11 | Agent B | Fordert Sync-Ticket oder Live-Verbindung für ein Dokument aus A | Abgelehnt; bestehende Verbindung wird geschlossen, wenn die Berechtigung entfällt |
| 5.12 | Autonome Dienstidentität | Greift ohne zugewiesene Aufgabe auf privat A oder privat B zu | Abgelehnt; mit Aufgabe nur im Aufgabenumfang und nie über die Rechte des Beauftragenden hinaus |
| 5.13 | Delegation nach Ablauf | Agent A ruft nach Ablauf der Delegation ein Dokument auf | Abgelehnt ab dem Ablaufzeitpunkt, auch bei offener Verbindung |
| 5.14 | Team A (Mensch) | Widerruft den Agent-Token oder die Mitgliedschaft während einer laufenden Aufgabe und eines offenen Streams | Laufende Aufgabe und Stream brechen ab, kein weiterer Inhalt wird ausgeliefert, **warme Caches** (Sync-Räume, Suchindex, Agentenkontext) werden geleert; neue Anfrage scheitert. Erst nach Ablauf der festgelegten Widerrufsfrist gilt der Fall als bestanden (Frist offen, Abschnitt 6) |
| 5.15 | Agent A | Veranlasst Export oder Weitergabelink ohne Schreibrecht oder ohne freigegebenen Token | Abgelehnt (heute für Weitergabelinks belegt) |

### B. Positive Fälle (Zugriff muss gelingen)

| Nr. | Akteur | Aktion | Erwartet |
| --- | --- | --- | --- |
| 5.16 | Team A (Mensch, `editor`) | Sucht, liest, bearbeitet ein Dokument in privat A | Treffer, Inhalt und Speichern wie bisher **[W]** |
| 5.17 | Team A und Team B | Beide öffnen ein Dokument im gemeinsamen Bereich | Beide lesen; Schreiben je Rolle (`viewer` liest nur) **[W]** |
| 5.18 | Agent A mit Aufgabe in privat A, Recht `propose` | Liest das Zieldokument und reicht eine Änderung ein | Vorschlag wird gespeichert (Status 202), Team A übernimmt oder verwirft; Antwort an Team A darf Inhalt aus A enthalten |
| 5.19 | Agent A mit Recht `write` für einen Bereich | Speichert direkt im erlaubten Bereich | Änderung gespeichert und mit Änderungs-ID protokolliert, Rücknahme möglich |
| 5.20 | Team A (Mensch) | Erteilt Agent A eine Delegation mit Ablauf und widerruft sie später | Zugriff während der Laufzeit, kein Zugriff nach Widerruf; neue Delegation stellt ihn nur im neuen Umfang her |

### C. Audit (Pflichtfall)

| Nr. | Akteur | Aktion | Erwartet |
| --- | --- | --- | --- |
| 5.21 | Alle | Jeder Fall 5.1 bis 5.20, erlaubt **und** abgelehnt | Ein Audit-Eintrag nennt **Akteur** (Mensch, Agent oder Dienst, mit Identität), **Bereich**, **Aktion** und **Entscheidung**; er enthält keinen Inhalt, keinen Titel und keinen Dateinamen. Der Eintrag ist für Team B nicht sichtbar, wenn er Team A betrifft |

## 6. Offene Punkte und vorgeschlagene Folgetickets

### 6.1 Offene Punkte

1. **Widerrufsfrist:** Die Zeit zwischen Widerruf und wirksamem Entzug (laufende Aufgaben, Streams, Caches, Sync-Räume)
   wird **vor der Umsetzung** festgelegt. Eine Zahl wird hier nicht genannt; sie folgt aus der Messung der Wege
   aus Abschnitt 4 und der Owner-Entscheidung.
2. **Owner-Entscheidung zu Abschnitt 3:** Workspace-/Vault-Trennung zuerst, oder Unterbereichsrechte jetzt?
3. **Rückfall ohne Eintrag:** `propose` (Ist) oder `kein`? Betrifft bestehende Agent-Tokens und deren Migration.
4. **Rechte für Menschen:** Genügt `owner`/`editor`/`viewer` je Workspace, oder braucht der Fall Bereichsrechte auch
   für Menschen? Heute gibt es sie nicht.
5. **Dienstidentität:** Welche Aufgaben laufen ohne beauftragenden Menschen, und wer vergibt ihren Umfang?
6. **Sync-Räume im Speicher:** Wie lange hält ein Raum Inhalt nach Widerruf (`rooms.ts:29`)? Ist ein sofortiges
   Verwerfen nötig?
7. **Agenten außerhalb der kontrollierten Laufzeit:** Welche Restrisiko-Aussage steht in der Dokumentation?
8. **Heutige Protokolle:** Das Änderungsprotokoll der Agenten speichert Inhalte (`beforeMarkdown`,
   `apps/app/src/lib/agent-access.ts:44`). Prüfen, ob das zu „Audit ohne Inhalt“ passt.

### 6.2 Vorgeschlagene Folgetickets (nur Liste, nicht angelegt)

| Vorschlag | Inhalt |
| --- | --- |
| Rechtekern: Zustand `kein`, Rückfall und Schnittmenge | Typ, `accessFor`, Migration bestehender Tokens (nur wenn Abschnitt 3 Unterbereiche wählt) |
| Eine Lesegrenze in der App-API | Direktabruf, Liste, Historie, Export hinter einer gemeinsamen Prüfung |
| Rechtegefilterte Suche | Filter vor Index und Ranking, Auszug, Zitat (Abstimmung mit #260) |
| Sync und Caches beim Widerruf | Verbindungen schließen, Räume verwerfen, Suchindex und Agentenkontext leeren |
| Audit ohne Inhalt | Erlaubt- und Abgelehnt-Einträge mit Akteur, Bereich, Aktion, Entscheidung |
| Delegation mit Ablauf und Schnittmenge | Aufgabenumfang, Antwortempfänger, Dienstidentität |
| Abnahmefälle in #347 aufnehmen | Fälle aus Abschnitt 5 prüfen und übernehmen |
| Hinweis zur Zusage in der Produktdokumentation | Aussage nach Abschnitt 1.2, nach Owner-Entscheidung |

## 7. English summary

**Status: scope and proposal only. No code, no feature commitment, no date.** Code claims are checked against commit
`d5bfd8a` (file and line given in the German sections).

- **Use case.** Team A keeps internal knowledge back; people and agents of Team B must get none of it through search,
  hit titles and metadata, summaries, history, export, sync, or an authorized agent. BloomMD cannot recall plaintext
  already delivered to an external agent, model, or person; any promise holds only for a defined, controlled flow
  (agent runtime and tools). No shared owner credentials: every identity has its own revocable credentials.
- **Matrix.** Five actors (Team A human, Team B human, Agent A, Agent B, autonomous service identity) × three areas
  (private A, private B, shared) × `none`/`read`/`propose`/`write`, plus export, expiry, and revocation. Delegation is
  the intersection of user rights, agent rights, and task scope, and the recipient of an answer counts as well.
- **Current state.** Workspace membership and token binding are the boundary today. `AgentAccessConfig.areas`
  (`packages/core/src/agent-ledger.ts:12,19`) covers per-area rights for **writing** (`read`/`propose`/`write`);
  a "no access" state for **reading** is missing. The GET handler
  (`apps/app/src/app/api/mindmaps/[filename]/route.ts:40-56`) checks no area; list, search, history, export, and sync
  tickets have no per-area read check either. Writes by agent tokens are gated (`agentGate`).
- **Proposal (owner decision pending).** Separate workspaces or vaults first; sub-area rights only if a proven case
  needs them. This also means a new `none` state, a deny-by-default fallback, a read filter on every path, and
  human area rights, which do not exist today.
- **One server-side boundary.** Every access path (direct read, list, search, preview, citation, history, export, sync,
  agent context, caches) goes through one check; writes and search follow the same boundary.
- **Acceptance cases.** Numbered positive and negative cases (section 5) are intended for adoption in #347.
- **Open.** The revocation deadline is set before implementation; no number is given here. Follow-up tickets are listed
  only and not created.
