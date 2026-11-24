# BloomMD: Wissen und Können / Knowledge and skills

> **Entwurf zur Produktplanung / Product planning draft.** Dieses Dokument ergänzt die [Vision](WISSENSPLATTFORM-VISION.md) um Skills als Wissensart. Weder dieses Dokument noch die Reihenfolge unten sind Release-Zusagen. Das [GitHub Project Board](https://github.com/orgs/moellenbeck-digital/projects/3) bleibt die verbindliche Aufgabenquelle. / This document extends the [vision](WISSENSPLATTFORM-VISION.md) with skills as a kind of knowledge. Neither this document nor the sequence below commits a release. The GitHub Project Board remains the source of truth for work.

## Deutsch

### Kern

BloomMD kann das **Gedächtnis und das Können** einer Organisation aus Menschen und Agenten sichtbar machen. Beides bleibt geprüft, versioniert und als Markdown lesbar.

| Teil | Frage | Beispiel |
| --- | --- | --- |
| Gedächtnis | Was gilt hier? | Learnings, Begriffe, Grenzen, Entscheidungen |
| Können | Wie wird es gemacht? | Skills: Abläufe, Checklisten, Definitionen |

Die [Vision](WISSENSPLATTFORM-VISION.md) bleibt maßgeblich. Dieses Dokument ändert keine Zusage und kein Produktprinzip.

### Skill als Wissensart

Ein Skill ist ein Ordner mit einer Datei `SKILL.md`. Die Datei ist Markdown mit Frontmatter (`name`, `description`). Das Format ist offen (agentskills.io). Es passt zum Grundsatz „Markdown bleibt das native und portable Format“.

- **Die Beschreibung ist der Router.** Der Agent entscheidet an ihr, ob er den Skill lädt. Der Auslöser steht zuerst. Sie bleibt kurz.
- **Methode und Kontext bleiben getrennt.**

| | Skill (Methode, „wie“) | BloomMD (Kontext, „was gilt hier“) |
| --- | --- | --- |
| Inhalt | Ablauf, Checkliste, Prüfreihenfolge, Definition | Organisation, Kunde, Begriffe, Grenzen, Learnings |
| Gilt für | jede Instanz | einen Bereich (`scope`) |
| Änderung | selten, per Pull Request | oft, per Vorschlag und Freigabe |
| Pflege | Version | `stale_after`, `verified` (`by`, `at`), `source`, Besitzer |

Ein **Daten-Skill** kopiert keinen Kontext. Er beschreibt, welche Frage der Agent an BloomMD stellt und wie er die Antwort nutzt. Der Kontext bleibt an einer Stelle, mit Quelle und Ablauf.

Prüffrage je Satz: Gilt er für jede Instanz? Dann Skill. Gilt er nur hier, hat einen Besitzer oder läuft ab? Dann BloomMD.

### Skill-Map

Die Skill-Map zeigt, welcher Agent welche Skills hat. Sie ist eine Ansicht auf Markdown, kein neuer Datenbestand.

| Ebene | Inhalt |
| --- | --- |
| Wurzel | Team oder Agent |
| Äste | Skill-Art: Prozedur, Daten, Design, Definition |
| Knoten | Skill mit Status (`draft`, `stable`, `deprecated`), Besitzer, letztem Test |
| Kanten | „nutzt“, „ersetzt“, „gehört zu Prozess“ |

Prinzip: **Ein Agent bekommt eine Rolle und nur die passenden Skills.** Die Beschreibung jedes Skills ist sichtbar. Die Status entsprechen dem bestehenden Wiki-Lebenszyklus (`draft`, `stable`, `deprecated`, siehe [Learnings](LEARNINGS.md)).

### Lernvorschläge im Review

Lernvorschläge nutzen zwei Stufen der [Vision](WISSENSPLATTFORM-VISION.md): **Schritt 6 „Wissenslebenszyklus“** (Prüfung, Freigabe, Veraltung, Rücknahme) und **Schritt 7 „Agenten-Workflows“** (Vorschläge und Folgeaktionen bleiben begrenzt, nachvollziehbar und rücknehmbar). Im [Planungsinventar](WISSENSPLATTFORM-ROADMAP.md) entsprechen ihnen die Themen 7 und 8.

| Schritt | Wer | Ergebnis |
| --- | --- | --- |
| 1. Korrektur oder Fehler im Betrieb | Mensch oder Agent | Anlass mit Quelle |
| 2. Vorschlag | Agent | Learning mit Status `neu`, `source`, `scope`, `stale_after` |
| 3. Freigabe | Mensch | `bestätigt` oder `verworfen`, mit Grund |
| 4a. Gilt nur hier | Mensch entscheidet, Agent schlägt vor | Kontext-Update im Bereich (`scope`) |
| 4b. Gilt für alle | Mensch entscheidet, Agent schlägt vor | Skill-Patch per Pull Request |

- **Nichts aktiviert sich selbst.** Kein Skill und kein Kontext ändert sich still. Jede Änderung ist ein Diff mit Freigabe und Rücknahme.
- Skill-Patches folgen der bestehenden Regel aus [Learnings](LEARNINGS.md): Änderungen am Verhalten von Agenten bleiben Pull Request mit Review.
- Ein Learning darf einen Skill-Patch auslösen. Es ersetzt ihn nicht.

### Skill-Gesundheit

| Prüfpunkt | Zweck |
| --- | --- |
| Nutzung | Wird der Skill geladen? Ungenutzte Skills sind Kandidaten zum Ausmisten. |
| Veraltung (`stale_after`) | Jeder Skill hat ein Prüfdatum, wie ein Learning. |
| Test mit und ohne Skill | Ein Skill muss gegenüber dem Lauf ohne ihn einen Gewinn zeigen. Neue Modelle können alte Hilfen überflüssig oder hinderlich machen. |
| Archivieren statt Löschen | Der Verlauf bleibt erhalten; `deprecated` statt Löschung. |

„Ein Skill verbessert den Agenten“ bleibt eine Hypothese, bis Zahlen sie belegen. Das folgt dem Prinzip „Produktbehauptungen folgen Nachweisen“.

### Abgrenzung

| System | Aufgabe |
| --- | --- |
| OpenClaw | führt aus |
| BloomMD | weiß und pflegt |
| ProcessCube | steuert Pflichten (BPMN) |

- BloomMD wird **keine Agenten-Laufzeit**.
- BloomMD ist kein Katalog und kein Marktplatz für Skills. Es ist der Ort, an dem ein Team seine eigenen Skills sichtbar prüft und freigibt.
- **Nie in Skills:** Rechte, Pflichten, Secrets und Personendaten. Rechte setzt das Rechtemodell durch (siehe Vision, Schritt 4). Pflichten steuert der Prozess. Secrets gehören in den Secret Store. Personendaten gehören nicht in Wissensdateien.
- Kundenkontext verlässt seinen Bereich nicht. Skills tragen keine Kundenwerte.

### Zeitpunkt

Der [Fokus W0/W1](https://github.com/moellenbeck-digital/BloomMD/milestone/8) und der [Lieferauftrag #415](https://github.com/moellenbeck-digital/BloomMD/issues/415) bleiben unverändert. Dieses Dokument fügt keine Funktion hinzu.

| Was | Stand |
| --- | --- |
| Konvention im [Learnings-Pilot #116](https://github.com/moellenbeck-digital/BloomMD/issues/116) | Tag `skill:<name>` am Learning und `scope` je Kunde. Nur Konvention, kein Code. |
| Skill-Map | Backlog |
| Skill-Vorschläge im Review | Backlog |
| Skill-Gesundheit | Backlog |

Der Backlog-Teil braucht eine eigene Scope- und Kapazitätsentscheidung. Es gibt keine Funktionszusage und keinen Termin.

## English

### Core

BloomMD can make the **memory and the skills** of an organization of people and agents visible. Both remain reviewed, versioned, and readable as Markdown.

| Part | Question | Example |
| --- | --- | --- |
| Memory | What applies here? | Learnings, terms, limits, decisions |
| Skills | How is it done? | Procedures, checklists, definitions |

The [vision](WISSENSPLATTFORM-VISION.md) remains authoritative. This document changes no commitment and no product principle.

### A skill as a kind of knowledge

A skill is a folder with a `SKILL.md` file. The file is Markdown with frontmatter (`name`, `description`). The format is open (agentskills.io). It fits the principle "Markdown remains the native, portable format".

- **The description is the router.** The agent decides from it whether to load the skill. The trigger comes first. It stays short.
- **Method and context stay separate.**

| | Skill (method, "how") | BloomMD (context, "what applies here") |
| --- | --- | --- |
| Content | Procedure, checklist, check order, definition | Organization, customer, terms, limits, learnings |
| Applies to | every instance | one scope (`scope`) |
| Change | rare, through pull request | frequent, through proposal and approval |
| Upkeep | version | `stale_after`, `verified` (`by`, `at`), `source`, owner |

A **data skill** does not copy context. It describes which question the agent asks BloomMD and how it uses the answer. The context stays in one place, with source and expiry.

Test for each sentence: does it apply to every instance? Then it belongs in a skill. Does it apply only here, have an owner, or expire? Then it belongs in BloomMD.

### Skill map

The skill map shows which agent has which skills. It is a view of Markdown, not a new data store.

| Level | Content |
| --- | --- |
| Root | Team or agent |
| Branches | Skill type: procedure, data, design, definition |
| Nodes | Skill with status (`draft`, `stable`, `deprecated`), owner, last test |
| Edges | "uses", "replaces", "belongs to process" |

Principle: **an agent gets one role and only the fitting skills.** The description of each skill is visible. The statuses match the existing wiki lifecycle (`draft`, `stable`, `deprecated`; see [learnings](LEARNINGS.md)).

### Learning proposals in review

Learning proposals use two stages of the [vision](WISSENSPLATTFORM-VISION.md): **step 6 "Knowledge lifecycle"** (review, approval, staleness, recovery) and **step 7 "Agent workflows"** (proposals and follow-up actions stay scoped, traceable, and reversible). In the [planning inventory](WISSENSPLATTFORM-ROADMAP.md) they correspond to themes 7 and 8.

| Step | Who | Result |
| --- | --- | --- |
| 1. Correction or error in operation | Human or agent | Trigger with source |
| 2. Proposal | Agent | Learning with status `neu` (new), `source`, `scope`, `stale_after` |
| 3. Approval | Human | `bestätigt` (confirmed) or `verworfen` (rejected), with reason |
| 4a. Applies only here | Human decides, agent proposes | Context update in the scope (`scope`) |
| 4b. Applies to all | Human decides, agent proposes | Skill patch through pull request |

- **Nothing activates itself.** No skill and no context changes silently. Every change is a diff with approval and a recovery path.
- Skill patches follow the existing rule in [learnings](LEARNINGS.md): changes to agent behavior remain a pull request with review.
- A learning may trigger a skill patch. It does not replace one.

### Skill health

| Check | Purpose |
| --- | --- |
| Usage | Is the skill loaded? Unused skills are candidates for removal. |
| Staleness (`stale_after`) | Every skill has a review date, like a learning. |
| Test with and without the skill | A skill must show a gain over the run without it. Newer models can make older aids unnecessary or harmful. |
| Archive instead of delete | History is kept; `deprecated` instead of deletion. |

"A skill improves the agent" remains a hypothesis until numbers support it. This follows the principle "Claims follow evidence".

### Boundaries

| System | Role |
| --- | --- |
| OpenClaw | executes |
| BloomMD | knows and maintains |
| ProcessCube | controls obligations (BPMN) |

- BloomMD does **not** become an agent runtime.
- BloomMD is not a catalog or marketplace for skills. It is where a team reviews and approves its own skills in the open.
- **Never in skills:** permissions, obligations, secrets, and personal data. The permission model enforces rights (see vision, step 4). The process controls obligations. Secrets belong in a secret store. Personal data does not belong in knowledge files.
- Customer context does not leave its scope. Skills carry no customer values.

### Timing

The [W0/W1 focus](https://github.com/moellenbeck-digital/BloomMD/milestone/8) and [delivery contract #415](https://github.com/moellenbeck-digital/BloomMD/issues/415) stay unchanged. This document adds no feature.

| What | Status |
| --- | --- |
| Convention in the [learnings pilot #116](https://github.com/moellenbeck-digital/BloomMD/issues/116) | Tag `skill:<name>` on the learning and `scope` per customer. Convention only, no code. |
| Skill map | Backlog |
| Skill proposals in review | Backlog |
| Skill health | Backlog |

The backlog part needs a separate scope and capacity decision. There is no feature commitment and no date.
