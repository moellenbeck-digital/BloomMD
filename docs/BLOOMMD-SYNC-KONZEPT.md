# BloomMD Sync — Konzept

Stand: 28. Oktober 2026 · Quellstand: `main` @ a0f5211 · Ticket [#42](https://github.com/moellenbeck-digital/BloomMD/issues/42) · Status: Entwurf zur Entscheidung

Dieses Papier ist die Grundlage für spätere Umsetzungs-Tickets. Es beschreibt **keine Implementierung** und
legt nichts fest, was nicht in Abschnitt 7 von einem Menschen entschieden wird. Aussagen zum Ist-Stand sind
gegen den Quellstand geprüft und nennen die Fundstelle. Was nicht belegbar war, steht als **offen**. Alles
unter „Empfehlung“ oder „Vorschlag“ ist eine Entwurfsaussage, kein Ist-Stand.

Ausgangspunkt war eine Owner-Anmerkung im iPad-Ink-Epic [#45](https://github.com/moellenbeck-digital/BloomMD/issues/45):
Handschrift entsteht als SVG im Vault und müsste zwischen iPad und Mac ankommen.

## 1. Ziel und Nutzer

**Idee:** „BloomMD Sync“ gleicht einen ganzen Vault zwischen den Geräten einer Person ab, ähnlich Obsidian Sync,
und sieht Agenten von Anfang an als Teilnehmer mit eigener Identität vor.

| Wer | Was wird synchronisiert | Zwischen welchen Geräten |
|---|---|---|
| Owner (Einzelperson, erste Zielgruppe) | Markdown-Notizen, Anhänge (Ink-SVGs, Bilder), geräteunabhängige Plugin-Einstellungen | iPad (Obsidian mobil oder BloomMD-App) und Mac (Obsidian oder Desktop-App) |
| Weitere Mitglieder (später) | dieselben Bereiche, nach Rolle (Owner, Editor, Viewer wie heute) | beliebige Geräte |
| Agenten (z. B. OpenClaw) | Lesen; Änderungen als Vorschlag; direktes Schreiben nur in freigegebenen Bereichen | laufen lokal oder auf einem Server, nie als „Gerät“ mit Vollzugriff |

**Was Agenten tun sollen:** Notizen lesen und zusammenfassen, Wiki- und Lernseiten pflegen, Verknüpfungen
vorschlagen. Jede Änderung ist einem Agenten zugeordnet, prüfbar und rückgängig zu machen (Abschnitt 4).

**Ziele:** (1) Vault-Inhalte inklusive Anhängen kommen auf allen Geräten an, auch nach Offline-Phasen.
(2) Ein Konflikt zerstört nie stillschweigend Inhalt. (3) Markdown bleibt das portable Quellformat: der Vault
bleibt ohne BloomMD lesbar. (4) Betrieb auch selbst gehostet.

**Nicht-Ziele:** Echtzeit-Mehrbenutzerbearbeitung (bleibt Yjs-Sync pro Dokument), Mehr-Instanz-Betrieb des
Servers, öffentlicher SaaS-Start, Abrechnung.

## 2. Ist-Stand

| Baustein | Abgedeckt | Fehlt |
|---|---|---|
| **Yjs-Sync pro Dokument** (Cloud, `packages/sync`, `packages/core/src/yjs-bridge.ts`) | Ein Markdown-Dokument je Raum, signiertes Fünf-Minuten-Ticket, Rollenprüfung, Presence, Postgres-Persistenz; der Sync-Server ist die einzige Schreibinstanz (`SYNC_REPLICA_COUNT=1`) und meldet `VERSION_CONFLICT` statt zu überschreiben. | Nur Markdown; Anhänge und Einstellungen gibt es nicht. Kein Vault-Bezug. Nachrichtengrenze 1 MiB (`SYNC_MAX_MESSAGE_BYTES`, Standard). Desktop-Auto-Reconnect gilt als unzuverlässig (`docs/BETA-SCOPE.md`). |
| **Shared Mode** (`packages/core/src/shared-document-binding.ts`, `shared-document-mirror.ts`, Obsidian: `plugins/obsidian/src/shared-document.ts`) | Eine lokale Datei wird ausdrücklich an ein Cloud-Dokument gebunden; Zustände lokal, teilend, verbunden, offline, Konflikt, widerrufen; Hash-Abgleich gegen Echo-Schreibvorgänge; lokale Datei bleibt offline bearbeitbar. | Je Datei, nicht je Vault. Bindungen liegen pro Gerät in der Plugin-Datendatei. Im Obsidian-Plugin auf Mobilgeräten nicht verfügbar (`plugins/obsidian/MOBILE-MATRIX.md`, Zeile „Shared mode“). |
| **Dateisystem-Sync, Legacy** (`SYNC_API_KEY`, `createFilePersistence` in `packages/sync/src/persistence.ts`) | Ein Verzeichnis als Speicher; Raum = Dateiname; ein statischer Schlüssel. | Nur `.md`/`.markdown` (`FileStore`); keine Rollen, keine Mitglieder, keine Rechte je Agent; Sicherungskopien im Sync-Betrieb abgeschaltet. Offiziell nur noch Legacy für Self-Hosting (`docs/ARCHITECTURE.md`). |
| **Agent-Vorschlagszweig und Agent-Token** (`docs/ARCHITECTURE.md` „Workspace Agents“; `apps/app/db/009_agent_token_rights.sql`; `packages/core/src/agent-ledger.ts`) | Pairing per Einmalcode, gehashte widerrufbare Tokens; Rechte lesen/vorschlagen/schreiben, Standard „vorschlagen“, je Bereich, längster Treffer gewinnt; Vorschläge nur durch Menschen freigebbar, gebunden an Hash und Version (sonst veraltet); Änderungsprotokoll mit Rückgängig. Dasselbe Modell läuft lokal im Vault (`.bloommd/`, auch auf dem iPad). | Gilt für Markdown-Karten (Maps), nicht für Anhänge oder Einstellungen. Der Verlauf für Rückgängig ist begrenzt (je Token die neuesten 300). |

**Abdeckung der Anforderungen aus dem Ticket:**

| Anforderung | Yjs pro Dokument | Shared Mode | Legacy-Dateisystem-Sync | Agent-Vorschlagszweig |
|---|---|---|---|---|
| Anhänge (z. B. Ink-SVG) | nein | nein | nein | nein |
| Plugin-Einstellungen | nein | nein | nein | nein |
| Ganzer Vault | nein | nein (je Datei) | Ordner, nur Markdown | nein |
| Offline-Geräte | lokaler Yjs-Stand bleibt, Abgleich beim Reconnect | Zustand „offline“, Abgleich danach | nicht belegt, offen | nicht zutreffend |

**Weitere Befunde, die den Entwurf prägen:**

- Anhänge laufen heute nur über Fremdsynchronisation (z. B. iCloud). Das Obsidian-Plugin schreibt eine
  Zeichnung nur dann über die bestehende Datei, wenn diese unverändert ist, sonst legt es eine Konfliktkopie
  „… (conflict).svg“ an (`plugins/obsidian/src/drawing-save.ts`). Der iOS-Ordnerzugriff meldet iCloud-Konflikte
  und schreibt optimistisch nach Änderungszeit (`packages/capacitor-folder/src/index.ts`).
- Der native Ordnerzugriff (`packages/capacitor-folder`) liest und schreibt Daten als Text (UTF-8), nicht als
  Binärdaten; Standard-Erweiterungen sind nur Markdown. Binäranhänge sind dort nicht vorgesehen (**offen**:
  Erweiterungsaufwand für Bilder und PDFs).
- Die Plugin-Datendatei (`.obsidian/plugins/bloommd/data.json`) mischt teilbare Einstellungen mit
  gerätespezifischen Daten: Karten-Layouts, Shared-Bindungen, „mobileAppInstalled“
  (`plugins/obsidian/src/main.ts`). Das Collaboration-Token liegt bewusst nicht dort, sondern in Obsidians
  Secret Storage. Die ganze Datei zu synchronisieren wäre falsch.
- Ink-SVGs enthalten die Strichdaten als JSON im Metadatenelement; Striche, Textfelder und Verknüpfungen haben
  stabile IDs, das Format ist versioniert (aktuell 2, höhere Versionen öffnen nur lesend)
  (`packages/ink/src/ink-document.ts`).
- Verschlüsselung Ende-zu-Ende gibt es im Quellstand nicht. Geprüft wurde nur TLS-Pflicht für Datenbank und
  Produktions-URLs (`apps/app/src/lib/production-config.ts`).
- Nicht verifizierbar im Quellstand: das Verhalten des Legacy-Dateisystem-Sync bei Offline-Geräten und die
  Last mit vielen oder großen Dateien (**offen**).

## 3. Abgrenzung

| | Yjs-Sync pro Datei | Shared Mode | BloomMD Sync (Vorschlag) |
|---|---|---|---|
| **Gegenstand** | Ein Cloud-Dokument (Markdown als Yjs-Dokument) | Eine lokale Datei, gebunden an ein Cloud-Dokument | Dateibaum eines Vaults: Markdown, Anhänge, ausgewählte Einstellungen |
| **Granularität** | Knoten und Zeichen (Yjs) | Datei als Ganzes lokal, Yjs in der Cloud | Datei-Revision; Markdown später feiner |
| **Konfliktmodell** | CRDT-Merge im Raum; Snapshot-Befehle mit Versionsprüfung (`VERSION_CONFLICT`) | Zustand „Konflikt“ bei abweichender erwarteter Cloud-Version | je Dateityp: Markdown Dreiwege-Abgleich auf Basisrevision, Binärdateien Konfliktkopie plus Verlauf (Abschnitt 5) |
| **Online-Pflicht** | für Live-Bearbeitung ja; lokaler Stand bleibt und wird nachgeglichen | nein, Datei bleibt lokal bearbeitbar | nein; Offline-Änderungen werden als Journal nachgereicht |
| **Gegenüber Agenten** | Vorschlag je Dokument | Vorschlag je Dokument | Vorschlag oder Direktschreiben je Bereich und Dateityp |

**Empfehlung: BloomMD Sync setzt auf dem bestehenden Sync-Server auf (Identität, Tickets, Rollen, Agent-Rechte,
Audit, Betrieb), bekommt aber eine eigene Protokollschicht statt der Yjs-Räume.** Begründung:

1. Der Sync-Server ist die einzige Schreibinstanz für Cloud-Dokumente. Ein zweiter Dienst mit eigener
   Schreiblogik würde diese Regel und die Rechteprüfung verdoppeln.
2. Die Yjs-Räume sind auf einzelne Markdown-Dokumente und Nachrichten bis etwa 1 MiB ausgelegt. Anhänge und
   ein Vault mit vielen Dateien passen nicht in dieses Modell.
3. Token, Rollen und das Agent-Rechtemodell (Migration 009) sollen genau einmal existieren.
4. Ein Vault-Sync hat ein anderes Lastprofil (Blobs, Journal). Die eigene Schicht erlaubt einen anderen
   Speicher dafür (Entscheidung 4), ohne die Yjs-Persistenz anzufassen.
5. Regel gegen doppelte Wahrheit: Eine Datei hat genau einen Sync-Eigentümer. Ein per Shared Mode gebundenes
   Dokument bleibt im Yjs-Weg und wird vom Vault-Sync ausgenommen.

**Alternativen:** (a) Eigener Dienst mit eigener Auth: stärkere Isolation, aber doppelte Identität und doppelter
Betrieb; sinnvoll nur, wenn der Self-Hosting-Betrieb ohne Postgres Vorrang bekommt (Entscheidung 9).
(b) Alles in Yjs, Anhänge als Binärfelder im Dokument: verworfen, weil Größe und Speicher für Yjs-Zustand
ungeeignet sind und Binärdateien kein CRDT-Merge profitieren.

**Hinweis:** Wer einen Vault bereits per iCloud oder Obsidian Sync abgleicht, darf denselben Ordner nicht
zusätzlich mit BloomMD Sync abgleichen. Zwei Abgleiche auf einem Ordner erzeugen Konflikte, die keiner der
beiden kennt. Das gehört in die Dokumentation und in eine Warnung beim Einrichten.

## 4. Agenten als Teilnehmer

### 4.1 Rechtemodell

Aufsetzen auf dem Bestehenden: Pairing per Einmalcode mit Ablauf, Agent-Token nur gehasht gespeichert, jederzeit
widerrufbar; Rechte `read`, `propose`, `write`, Standard `propose`, je Bereich (Ordnerpfad), längster Treffer gewinnt.

Neu für den Vault-Sync:

| Dimension | Vorschlag |
|---|---|
| Bereich | Ordnerpfade im Vault wie heute; Rechte vergibt nur der Owner |
| Dateityp | Eigene Stufe je Typ: Markdown (`propose` als Standard), Anhänge (`read`, Schreiben nur als Vorschlag), Plugin-Einstellungen und `.obsidian`/`.bloommd` (für Agenten nie schreibbar) |
| Identität | Der Agent ist ein eigener Teilnehmer, kein „Gerät des Owners“; eigener Abgleichsstand (Cursor), Herkunft in jeder Revision |
| Widerruf | Token widerrufen = sofort keine Leseberechtigung mehr; bereits geholte Kopien lassen sich nicht zurückholen (bei Agenten auf eigener Hardware unvermeidbar, im Papier ausdrücklich nennen) |
| Pairing | Wie heute: Agent verbindet sich ausgehend, der Server liefert ihm nur, wozu er berechtigt ist |

### 4.2 Vorschläge oder direkte Änderungen

**Empfehlung: Standard bleibt Vorschlag. Direktschreiben ist ein ausdrücklich vergebenes Recht je Bereich
(z. B. Lern- und Wiki-Ordner), nie für Anhänge und Einstellungen.** Vorschläge bleiben, wie heute, an eine
Basisrevision gebunden und werden „veraltet“, wenn sich die Datei danach ändert. Ein Vorschlag erscheint auf
anderen Geräten erst nach Freigabe als normale Änderung; bis dahin liegt er serverseitig (Ablageort im Vault
statt Server: **offen**, Entscheidung 6).

| Option | Vorteil | Nachteil |
|---|---|---|
| (a) Alles nur als Vorschlag | maximal sicher, wie heute | hohe Reibung bei vielen kleinen Änderungen |
| (b) **Empfohlen:** Vorschlag als Standard, Direktschreiben je Bereich | Reibung nur dort, wo der Owner sie will; Audit und Rückgängig als Netz | Rechteverwaltung wird sichtbarer Teil der Oberfläche |
| (c) Direktschreiben überall, nachträgliche Prüfung | geringste Reibung | ein fehlerhafter Agent verändert viele Dateien, bevor jemand es merkt |
| (d) Agent-Zweig im Vault, Sammelfreigabe | Prüfung ganzer Änderungsserien | Zweige im Vault-Sync sind ein eigenes Produkt (Zusammenführen, Anzeige), hoher Aufwand |

### 4.3 Nachvollziehbarkeit

- **Herkunft jeder Revision:** Akteur (Person, Gerät oder Agent mit Token-Kennung), Zeitpunkt, Auslöser
  (Auftrag oder Vorschlag), Basisrevision, bei Freigabe die prüfende Person. Das entspricht den heutigen
  Feldern des Änderungsprotokolls (Ereignis, Herkunft „Agent“/„freigegeben“/„Owner“, Werkzeug, Vorschlag,
  Prüfer).
- **Audit:** inhaltsfreies Sicherheits-Audit (wie heute: Kennungen, keine Inhalte) getrennt vom inhaltshaltigen
  Änderungsprotokoll, das Vorher-Stände für Rückgängig vorhält und eine Aufbewahrungsgrenze hat
  (Entscheidung 10).
- **Rückgängig:** je Änderung und als Sammelaktion „alles von Agent X seit Zeitpunkt T“. Rückgängig ist selbst
  eine neue Revision, löscht keine Historie. Wurde die Datei danach von einem Menschen geändert, entsteht eine
  Konfliktkopie statt einer Überschreibung.
- **Anschluss an den Vorschlagszweig:** Vorschlag, Basisbindung, Freigabe durch Menschen, `stale` und
  Rückgängig werden unverändert übernommen; neu sind Dateityp, Vault-Pfad und Binärdateien.

## 5. Konflikte bei Binär- und SVG-Anhängen

| Option | Verhalten | Vorteil | Nachteil |
|---|---|---|---|
| Letzter Schreiber gewinnt | spätere Revision ersetzt die frühere | trivial | verliert Inhalt, bei Zeichnungen sofort sichtbar; Uhrzeitfehler der Geräte entscheiden |
| Konfliktkopie | beide Stände bleiben, der zweite bekommt einen Namenszusatz | verlustfrei, bekanntes Verhalten (Plugin legt heute „(conflict)“-Kopien an) | Nutzer muss auflösen; Einbettungen zeigen auf das Original |
| Versionsverlauf | jede Revision bleibt abrufbar | Rückgängig und Vergleich möglich, Basis für alle anderen Optionen | Speicherbedarf, Aufbewahrungsgrenze nötig |
| SVG-spezifisches Zusammenführen (Ink) | Striche, Textfelder und Verknüpfungen werden nach ID vereinigt | beste Nutzererfahrung für Handschrift | Format hat keine Löschmarken oder Änderungszähler; nur bei gleicher Formatversion möglich |

**Empfehlung:** Versionsverlauf für alle Binärdateien als Grundlage. Bei echtem Konflikt (zwei Geräte haben auf
derselben Basisrevision weitergeschrieben) entsteht eine Konfliktkopie; kein stilles „letzter gewinnt“.
Letzter-Schreiber-gewinnt nur für ausdrücklich ausgeschlossene Wegwerfdateien. SVG-Zusammenführen für Ink ist
eine zweite Stufe: Es braucht eine neue Formatversion mit Löschmarken und gehört in ein eigenes Ticket, weil
die Formatversion und das Nur-Lese-Verhalten älterer Plugin-Versionen berührt werden. Begründung: Die erste
Stufe verliert nie Inhalt und passt zu dem, was das Plugin heute schon tut; die Ink-Zusammenführung bringt
Komfort, ist aber ohne Formatänderung nicht korrekt (ein gelöschter Strich käme sonst zurück).

Mitzuentscheiden: **Löschen gegen Ändern** (Empfehlung: Änderung gewinnt, Löschung wird zum Vorschlag) und
**Umbenennen** (Empfehlung: Datei-ID statt Pfad als Identität, damit eine Umbenennung kein Löschen plus Neuanlegen
ist; Anpassung der Links in Markdown bleibt Sache von Obsidian und ist als eigene Revision zu behandeln).

## 6. Ende-zu-Ende-Verschlüsselung und Self-Hosting

**Ist:** Der Server sieht Inhalte im Klartext: Cloud-Dokumente liegen als Markdown in Postgres, der Sync-Server
baut daraus Yjs-Dokumente, Vorschläge werden mit Basishash serverseitig geprüft und gespeichert, Agenten
bekommen den Dokumentkontext. TLS ist für Produktivbetrieb Pflicht. Ende-zu-Ende gibt es nicht.

| | Variante A: ohne E2EE (Vorschlag für Phase 1) | Variante B: mit E2EE (opt-in, später) |
|---|---|---|
| Agentenzugriff | serverseitig und lokal möglich | nur lokal, der Agent ist ein Teilnehmer mit eigenem Schlüssel |
| Serversuche, Wiki-Ansicht | möglich | nicht möglich; Suche nur auf dem Gerät |
| Vorschläge prüfen | Server prüft Basis und zeigt Unterschiede | Server sieht nur Chiffretext; Hash- und Basisprüfung nur über Metadaten, Anzeige nur im Client |
| Zusammenführen | Server kann Markdown und Ink verstehen | Server kann nur Revisionen ordnen und Kopien anlegen |
| Schlüsselverlust | kein Schlüsselproblem; Wiederherstellung aus dem Serverbestand | Daten unwiederbringlich ohne Wiederherstellungsschlüssel |
| Sichtbare Metadaten | alles | Dateigrößen, Zeitpunkte, Anzahl; Pfade nur bei Pfadverschlüsselung verborgen |
| Aufwand und Risiko | gering | hoch (Schlüsselverwaltung, Geräte-Kopplung, Rotation bei Widerruf) |

**Schlüsselverwaltung (Variante B):** ein Vault-Schlüssel, der nur auf Geräten liegt (iOS Keychain/Android Keystore
über `packages/capacitor-keychain`, macOS Keychain wie bei Verbindungsprofilen), Kopplung neuer Geräte durch ein
bereits gekoppeltes Gerät, ein einmal erzeugter Wiederherstellungsschlüssel für den Owner. Der Widerruf eines
Agenten verlangt eine Schlüsselrotation, weil er den Schlüssel kannte; das ist der teuerste Punkt.

**Empfehlung:** Phase 1 ohne E2EE, aber das Protokoll E2EE-fähig bauen (Inhalte als undurchsichtige Blobs mit
Hash und Basisrevision; alles, was Klartext braucht, als klar benannte Server-Funktion). E2EE als opt-in je Vault
danach. Begründung: Agenten-Vorschläge, Suche und serverseitiges Zusammenführen brauchen Klartext; die Beta hat
keine Wiederherstellungszusage, und Schlüsselverlust ohne Wiederherstellung wäre für Nutzer schlimmer als der
Verzicht auf E2EE.

**Self-Hosting, Mindestbetrieb (Vorschlag):**

- Ein Sync-Prozess (Container oder Binary, heute Port 4100) mit Einzelinstanz-Betrieb, TLS vor dem Dienst,
  ein Owner, Agent-Tokens, regelmäßige Sicherung des Speichers.
- Zwei Stufen: **Solo** (ein Prozess, Verzeichnis als Speicher, kein Postgres, keine E-Mail-Konten; der Vault
  bleibt als normale Dateien lesbar) und **Team/Hosted** (Postgres, Konten, Einladungen wie heute).
- Offen: ob zwei Speicher-Backends dauerhaft gepflegt werden können (Entscheidung 9). Der Legacy-Modus mit
  statischem Schlüssel erfüllt die Rechte- und Audit-Anforderungen nicht und ist keine Grundlage.

## 7. Offene Entscheidungen

Jede Frage muss ein Mensch beantworten. Die Empfehlung steht jeweils zuerst.

1. **Sync-Umfang in Version 1.** Empfehlung: ein Vault-Wurzelordner mit Ausschlussliste (u. a. `.obsidian/workspace*`,
   `.bloommd`, Fremdsynchronisations-Metadaten). Alternativen: nur ausgewählte Ordner; zuerst nur Anhänge.
2. **Schichtung.** Empfehlung: auf dem bestehenden Sync-Server, eigene Protokollschicht (Abschnitt 3). Alternative:
   eigener Dienst.
3. **Eigentümerregel für Markdown.** Empfehlung: per Shared Mode gebundene Dokumente bleiben beim Yjs-Weg, alles
   andere Markdown geht in den Vault-Sync. Alternative: Markdown vollständig in den Vault-Sync und Yjs nur noch
   bei gleichzeitiger Bearbeitung.
4. **Speicher für Anhänge und Revisionen.** Empfehlung: Postgres in Version 1 mit Größenlimit je Datei und
   Kontingent je Vault; Alternativen: Objektspeicher, Dateisystem (Solo-Stufe).
5. **Welche Plugin-Einstellungen synchronisieren.** Empfehlung: Positivliste geräteunabhängiger Einstellungen;
   nie Token, Server-URL, Shared-Bindungen und gerätespezifische Merker. Karten-Layouts als eigene Kategorie
   später. Alternative: ganze Datendatei (verworfen, siehe Abschnitt 2).
6. **Wo liegen offene Agent-Vorschläge?** Empfehlung: serverseitig wie heute, Anzeige in allen Clients.
   Alternative: als Dateien im Vault-Bereich `.bloommd` (sichtbarer, aber Teil des Abgleichs).
7. **Standardrecht für Agenten und Direktschreiben.** Empfehlung: `propose` überall, `write` nur je Bereich,
   nie für Anhänge und Einstellungen (Abschnitt 4.2). Alternative: `write` für Lern- und Wiki-Ordner als
   Voreinstellung.
8. **Ende-zu-Ende-Verschlüsselung.** Empfehlung: Version 1 ohne, Protokoll vorbereitet, E2EE opt-in später.
   Alternativen: E2EE von Anfang an (Agenten nur lokal); nie.
9. **Self-Hosting-Stufen.** Empfehlung: Solo (Dateispeicher) und Team (Postgres) mit gemeinsamer Protokollschicht.
   Alternative: nur Postgres, dafür ein Backend weniger.
10. **Aufbewahrung von Verlauf und Änderungsprotokoll.** Empfehlung: begrenzte, dokumentierte Frist und Größe je
    Vault, Werte aus der Messung im ersten Schritt. Alternative: unbegrenzt in Version 1 (Speicherrisiko).
11. **Konfliktauflösung in der Oberfläche.** Empfehlung: Konfliktkopie mit Hinweis und einem „Version wählen“-Schritt
    im Plugin und in der App. Alternative: nur Konfliktkopie ohne Oberfläche in Version 1.
12. **Sync auf dem iPad.** Offen und zu klären: läuft der Abgleich im Obsidian-Plugin (nur im Vordergrund) oder in
    der BloomMD-App (Ordnerzugriff, Binärdaten fehlen noch)? Empfehlung: ein gemeinsamer Client-Kern, beide
    Oberflächen, Abgleich beim Öffnen und im Vordergrund; Hintergrundabgleich später.
13. **Angebot und Lizenz.** Offen: ob BloomMD Sync Teil des Hosted-Angebots ist, was es kostet und ob die
    Lizenzgrenzen (`docs/LICENSING.md`) einen selbst gehosteten Betrieb für Dritte erlauben. Das ist eine
    Produkt- und Rechtsentscheidung des Owners, keine technische.

## 8. Vorgeschlagene Folge-Tickets

Grob in Umsetzungsreihenfolge. Das Team legt keine Tickets an; der Chief of Staff legt sie nach dem Bericht an.
Ticket 1 ist der kleinste sinnvolle erste Schritt: ein Owner, nur Anhänge, ohne Agenten und ohne E2EE.

1. **Anhang-Sync für Ink-SVGs und Bilder (kleinster erster Schritt)** — Journal mit Upload, Download und
   Revisionen für Anhänge eines Vault-Ordners über den bestehenden Sync-Server, Owner-Token, Konfliktkopie;
   Ergebnis: Mac und iPad haben dieselben Zeichnungen, Anzeige in Plugin und App — Abhängigkeit: Entscheidungen
   1, 2, 4, 11 (Mindestumfang), Binärfähigkeit des Ordnerzugriffs auf iOS.
2. **Binärfähiger Ordnerzugriff in `packages/capacitor-folder`** — Lesen und Schreiben als Binärdaten, Erweiterungsliste
   für Anhänge, Test mit iCloud-Konflikten — Abhängigkeit: keine (kann parallel zu 1 beginnen).
3. **Vault-Dateibaum mit Markdown** — Eigentümerregel gegenüber Shared Mode, Löschen, Umbenennen mit Datei-ID,
   Ausschlussliste, Dreiwege-Abgleich — Abhängigkeit: 1, Entscheidung 3.
4. **Plugin-Einstellungen** — Positivliste teilbarer Einstellungen, Trennung von gerätespezifischen Daten
   (Layouts, Bindungen), Abgleich über den Vault-Sync — Abhängigkeit: 3, Entscheidung 5.
5. **Agenten als Teilnehmer im Vault-Sync** — Pairing, Rechte je Bereich und Dateityp, Vorschläge für Vault-Dateien,
   Herkunft, Audit und Rückgängig (Anschluss an Migration 009) — Abhängigkeit: 3, Entscheidungen 6, 7, 10.
6. **SVG-Zusammenführen für Ink** — neue Formatversion mit Löschmarken, Vereinigung nach Strich-ID, Verhalten
   älterer Plugin-Versionen — Abhängigkeit: 1, Format-Abstimmung mit `packages/ink`.
7. **Self-Hosting Solo** — Verzeichnis als Speicher für die neue Schicht, Sicherung, Einrichtungsanleitung,
   Warnung bei Fremdsynchronisation desselben Ordners — Abhängigkeit: 1, Entscheidung 9.
8. **E2EE-Konzept und Prototyp (opt-in)** — Schlüsselverwaltung, Gerätekopplung, Wiederherstellungsschlüssel,
   Auswirkungen auf Suche und Vorschläge — Abhängigkeit: 5, Entscheidung 8.

## Prüfstand

Gelesen wurden: `docs/ARCHITECTURE.md`, `docs/WEB-COLLABORATION-AND-WIKI.md`, `docs/BETA-SCOPE.md`,
`docs/DESKTOP-CONNECTION-PROFILES.md`, `packages/sync`, `packages/core` (FileStore, Yjs-Brücke, Shared-Mode,
Agent-Ledger), `packages/capacitor-folder`, `packages/ink`, `plugins/obsidian`, die Agent-Token-Migration und die
Pairing-Route sowie das Issue #45. Nicht geprüft: Laufzeitverhalten (Last, Offline-Wiederherstellung auf echten
Geräten); dort stehen Aussagen als **offen**.
