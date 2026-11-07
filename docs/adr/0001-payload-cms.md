# ADR 0001: Payload CMS als internes Admin-Interface für Inhalte

- **Status:** Vorschlag, wartet auf Freigabe durch Max. Nichts hier ist beschlossen, was in „Offene Entscheidungen für Max“ steht.
- **Datum:** 2026-11-02
- **Ticket:** #103 (Epic #196, Teil #203). Folgeschritte: #204 bis #207.
- **Gilt für:** `apps/marketing`, `apps/app`, neuer Dienst `apps/cms`, GitOps-Repo `bloommd-cluster`.

Diese Runde ist nur die ADR. Es gibt keinen Code, kein `apps/cms` und keine Migration.

## Kontext

### Vorgaben von Max (30.10. und 01.11.2026)

1. Payload ist **nur Admin-Interface**, einfach an die Custom-App angepasst.
2. **Keine Payload-API nach außen.** Weder REST noch GraphQL sind öffentlich erreichbar; der Zugriff läuft nur intern.
3. **Kein zweiter Identitäts- oder Rechtespeicher ohne schriftliche Begründung** (Stufe 4 der Grundlage „Identität, Rollen und Delegation“). Die Anmeldung per Postgres in `apps/app` bleibt führend, solange diese ADR nichts anderes begründet.
4. Die Marketing-App trägt keine App-Secrets (`AGENTS.md`, Abschnitt „Web App Split“). Secrets laufen nur über 1Password und External Secrets, Deployment nur über `bloommd-cluster`.
5. Der Kommentar vom 30.10. nennt „Warteliste und Zugänge der Cloud-Nutzung“. Das wird unten als Abweichung 2 und 3 behandelt.

### Stand im Repository (geprüft am 2026-11-02, `main` bei 5e15258)

- **App-Split:** `apps/marketing` (bloommd.io) und `apps/app` (bloommd.app) sind getrennte Next.js-Anwendungen mit getrennten Builds und Images (`Dockerfile`, Ziele `app` und `marketing`). `apps/marketing/src/lib/production-config.ts` lehnt im Release-Check `DATABASE_URL`, `BLOOMMD_AUTH_SECRET`, `BLOOMMD_SYNC_SECRET`, `NEXT_PUBLIC_SYNC_URL`, `STRIPE_SECRET_KEY` und `STRIPE_WEBHOOK_SECRET` ab. Siehe auch [ARCHITECTURE.md](../ARCHITECTURE.md) und [AGENTS.md](../../AGENTS.md).
- **Inhalte heute:** Markdown mit Frontmatter im Repo. Blog und News liegen in `apps/marketing/content/blog` und `apps/marketing/content/news` (zweisprachig, `-en.md`-Suffix), Docs in `apps/marketing/content/docs` und `apps/app/content/docs`. `apps/marketing/src/lib/posts.ts` liest sie zur Laufzeit aus dem Dateisystem. Bilder liegen unter `apps/marketing/public`. Texte der Landingpage stehen im Code (`apps/marketing/src/app/page.tsx`). Templates sind Teil des Produkts und werden mitversioniert.
- **News sind an den Release gekoppelt:** Ein veröffentlichtes (nicht-Pre-)Release löst `.github/workflows/marketing-news-draft.yml` aus, das mit `news:draft` einen zweisprachigen Entwurf als Pull Request anlegt. `AGENTS.md` verlangt je Feature-Release mindestens eine zweisprachige `/news`-Meldung.
- **Nutzer, Anmeldung, Rechte (alles in der App-Postgres):** `bloom_users` (E-Mail, `password_hash`, `email_verified_at`, `stripe_customer_id`), `bloom_sessions`, `bloom_access_tokens` (nur Hash), `bloom_auth_tokens`, `bloom_entitlements` (`feature`, `source`, `active`, `expires_at`), `bloom_subscriptions`, `bloom_workspaces`, `bloom_workspace_members` (Rollen owner, editor, viewer), Agent-Rechte (`bloom_agent_token_*`), `bloom_beta_invites`, `bloom_audit_events`, `bloom_rate_limits`.
- **Passwort-Hash:** `pbkdf2-sha256$310000$<salt>$<hash>` (`apps/app/src/lib/passwordAuth.ts`).
- **DSGVO:** `GET /api/account/export` (`exportAccountData`) und `POST /api/account/delete` (kündigt Stripe-Abos, dann `deleteAccountData`) liegen in `apps/app`.
- **Beta-Gate:** `BLOOMMD_BETA_ACCESS=1` verlangt eine Einladung (Allowlist, Code oder DB-Einladung); jeder andere Wert bedeutet offene Registrierung. Der Standardwert wird ohne Freigabe des Owners nicht geändert (`AGENTS.md`).
- **Warteliste:** durch #104/#105 (PR #117, #118) beendet. Es bleibt `BLOOMMD_WAITLIST_DATABASE_URL` (eigene Tabelle) bis Export, Einladung und Löschung (`apps/marketing/scripts/waitlist.ts`).
- **Muster „Marketing liest serverseitig von außen, ohne App-Secrets“:** `apps/marketing/src/lib/roadmap.ts` holt die Roadmap serverseitig mit einem lesenden GitHub-Token und `revalidate` von 30 Sekunden; der Token erreicht den Browser nie.
- **Postgres:** Die Hosted-Beta nutzt Plattform-Postgres über CloudNativePG (`docs/ARCHITECTURE.md`). Ein Backup-/Restore-Probelauf für die App-Datenbank existiert als `scripts/restore-drill.sh`.

### Stand Spike (26.10.2026, Ergebnis im Dev-Team-Thread; hier neu zusammengefasst)

Der Spike war ein Wegwerf-Prototyp außerhalb des Repos. Die folgenden Punkte sind **nicht** im Repo belegt und sind in #204 gegen die dann gewählte Payload-Version neu zu prüfen:

- Payload 3.x (MIT) läuft als Next.js-Anwendung; Version 3.92 deklarierte Next ≥ 16.3.3 und < 17 (passt zu Next 16.4.2 im Repo) und Node ^22.23.4 oder ≥ 24.22.1. Das Repo erlaubt `node >=22 <23` und baut die Images auf `oven/bun`. Laufzeit und Node-Range des CMS-Images sind in #204 festzulegen.
- Der Postgres-Adapter nutzt Drizzle, nicht das vorhandene `postgres`-Paket. Migrationen laufen über die Payload-CLI, nicht über `apps/app/db/*.sql`.
- Der BloomMD-Passwort-Hash lässt sich nicht direkt als Payload-Hash importieren (Format und Parameter weichen ab). Eine **Lazy-Migration** (alten Hash beim ersten Login prüfen, dann neu hashen) funktioniert im Prototyp mit eigenem Verifier; die Einbindung als Payload-Auth-Strategie wurde nicht durchgespielt.
- Aufwand grob (Annahmen, kein Beleg): V1 ca. 8 bis 12 Personentage, Nutzerdaten in Payload ca. 25 bis 40 Personentage mit hohem Risiko.

## Entscheidung (Empfehlung)

Wir empfehlen **V1 mit eigenem internen Dienst `apps/cms`**:

1. Payload ist ein reines Admin-Interface für **redaktionelle Inhalte**. Es speichert weder Nutzer noch Rechte noch Zugänge des Produkts.
2. Payload läuft als eigener Dienst mit eigener Datenbank, ohne öffentlichen Zugang. Die Marketing-App liest veröffentlichte Inhalte lesend über eine Netzwerkgrenze, ohne App-Secrets.
3. Nutzerdaten, Cloud-Zugänge (Entitlements), Beta-Gate, Einladungen und Anmeldung bleiben in `apps/app`.

Wo ein Punkt nur Max entscheiden kann, steht er im Abschnitt „Offene Entscheidungen für Max“ und gilt bis dahin als offen.

## 1. Zweck und Umfang

### Was Payload bekommt

| Inhalt | Empfehlung | Begründung |
|---|---|---|
| Blog | Ja, als Collection mit Sprachfeld (de/en) | Redaktioneller Inhalt ohne Code-Bezug, heute reine Datei-Pflege |
| Landingpage-Texte | Ja, als Globals (später, nach Blog) | Texte stehen heute im Code; Änderung braucht jedes Mal einen Deploy |
| News | **Offen, erst nach Anpassung des Release-Ablaufs** | News entstehen heute aus dem Release (`marketing-news-draft.yml`, `news:draft`) und werden per Pull Request geprüft. Ein CMS würde diesen Weg ersetzen oder doppeln. Siehe Entscheidung 3 |
| Medien (Bilder zu Blog und Landingpage) | Ja, mit separatem Backup | Medien liegen nicht in Postgres, siehe Betriebsform |

### Was Payload ausdrücklich nicht bekommt

- **Docs** (`apps/marketing/content/docs`, `apps/app/content/docs`): Sie gehören zum Produktstand und werden mit dem Code versioniert und geprüft (Doc-Lint in der CI). Ein CMS bringt hier nur Pflegeaufwand.
- **Templates:** Sie sind Teil des Produkts und bleiben Markdown im Repo.
- **Rechtstexte** (`impressum`, `datenschutz`, `agb`, `widerruf`): Sie hängen an `BLOOMMD_LEGAL_*` und an Reviews durch Menschen; kein Wechsel in dieser Etappe.
- **Nutzerdaten, Konten, Passwörter, Sitzungen, Tokens, Workspaces, Dokumente, Abos, Entitlements, Beta-Einladungen, Audit-Ereignisse:** bleiben in `apps/app` (siehe Abschnitt 4).
- **Die Warteliste:** Sie ist beendet. Payload wird nicht ihr Nachfolger (siehe Abschnitt 4, Abweichung 3).
- **Eine öffentliche API, ein Content-Delivery-Endpunkt im Internet, Webhooks nach außen.**

Das Markdown im Repo bleibt Quelle für alles, was nicht in der Tabelle als „Ja“ steht.

## 2. Betriebsform

### Optionen

**(a) In `apps/app` einbetten.** Passt zum Secret-Modell (der Admin hinter dem Beta-Gate von bloommd.app). Nachteile: Payload bringt eigene Routen (`/admin`, `/api`) und eigene Abhängigkeiten in die Kern-App, deren Angriffsfläche und Release-Takt wachsen; die Payload-API läge in der öffentlich erreichbaren App; Payload-Datenbank und Produktdatenbank müssten getrennt gehalten werden, obwohl sie im selben Prozess laufen. Verworfen.

**(b) In `apps/marketing` einbetten.** Verletzt den App-Split: Die Marketing-App bräuchte Datenbankzugang und ein Payload-Secret, und die Payload-API wäre auf der öffentlichen Domain erreichbar. Verworfen.

**(c) Eigener Dienst `apps/cms`, eigenes Image, nur intern erreichbar.** Gleiche Trennlinie wie beim App-Split: eigener Build-Root, eigener Release-Check, eigene Secrets. Die öffentliche Marketing-App bleibt frei von Datenbank und Admin. **Empfehlung.**

### Ausgestaltung von (c)

- **Repo und Image:** `apps/cms` als eigener Workspace und Dockerfile-Ziel `cms`, analog zu `app` und `marketing`. Eigene SemVer-Version in `apps/cms/package.json`; die Regeln für sichtbare Version und Build-Info aus `AGENTS.md` gelten (im Admin sichtbar, kein öffentlicher Endpunkt).
- **Datenbank:** Eigene Datenbank und eigene Rolle (z. B. `bloommd_cms`) im bestehenden CloudNativePG-Cluster, ohne Rechte auf die App-Datenbank. Der CMS-Dienst bekommt nie die `DATABASE_URL` der App, und die App nie die des CMS. Eine eigene Cluster-Instanz ist möglich, aber für V1 nicht nötig (Entscheidung 6).
- **Admin-Zugang:** Die Payload-Admin-Oberfläche ruft im Browser dieselbe REST-API desselben Ursprungs auf. Admin und API lassen sich deshalb **nicht** durch einen Pfadfilter am Ingress trennen: Wer den Admin erreicht, erreicht die API. Daher gilt: der Admin ist nur über einen privaten Zugangsweg erreichbar (Abschnitt 3). Als Admin-Konten (Bearbeiter) gibt es nur wenige Betreiberkonten, siehe Abschnitt 4.
- **Backup und Restore:**
  - Datenbank: Backup des CMS über dieselbe CNPG-Sicherung wie die App-Datenbank; zusätzlich ein `pg_dump`-Test je Datenbank.
  - Medien: Upload-Ziel ist ein S3-kompatibler Bucket oder ein Volume (Entscheidung 5). Es wird getrennt gesichert und gehört zum Restore-Test.
  - Probelauf: Das Muster aus `scripts/restore-drill.sh` (Daten anlegen, Dump, Restore in zweite Datenbank, Prüfung) wird für die CMS-Datenbank und die Medien nachgebaut; Ziel ist die Abnahme aus dem Ticket „Backup und Restore einmal getestet“. Details gehören zu #207.
  - **Rückweg:** Ein Export aller veröffentlichten Inhalte nach Markdown mit Frontmatter im Format von `posts.ts` ist Pflicht, damit der Wechsel zurück zu Git möglich bleibt. Die Inhalte liegen sonst nur noch in Postgres.
- **Secrets:** Nur im CMS-Deployment, nur über 1Password und External Secrets: `PAYLOAD_SECRET`, Datenbank-URL des CMS (empfohlener Name `CMS_DATABASE_URL`, damit sie nicht mit `DATABASE_URL` der App verwechselt wird), Zugang zum Medienspeicher. Nichts davon im Marketing- oder App-Deployment. `apps/marketing/src/lib/production-config.ts` lehnt zusätzlich die CMS-Secret-Namen ab (Folgeschritt #204).
- **Nicht eingerechnet:** Der Aufwand für ein CMS-Image auf Node statt Bun, falls Payload auf Bun nicht unterstützt wird (siehe Spike). Das klärt #204.

## 3. Keine Payload-API nach außen

Payload stellt REST und GraphQL **und** die Admin-Oberfläche aus demselben Prozess bereit. Die Vorgabe „keine API nach außen“ wird deshalb in **vier unabhängigen Schichten** umgesetzt; jede genügt allein nicht.

1. **Kein öffentlicher Zugang.** Für `apps/cms` gibt es in `bloommd-cluster` keine öffentliche DNS-Zuordnung, keine Ingress-Regel auf einer öffentlichen Domain und keinen Service vom Typ LoadBalancer oder NodePort. Der Dienst ist ein ClusterIP-Service.
2. **NetworkPolicy.**
   - Eingehend zum CMS-Pod: nur von den Marketing-Pods (lesend, Abschnitt unten) und vom privaten Admin-Zugangsweg. Alles andere ist verworfen, auch aus dem Namespace der App.
   - Ausgehend vom CMS-Pod: nur zur CMS-Datenbank, zum Medienspeicher und zu DNS. Kein Zugang zur App, zur App-Datenbank, zum Sync-Dienst.
3. **Privater Admin-Zugangsweg.** Zugang zum Admin nur über einen Weg, der nicht aus dem Internet erreichbar ist (z. B. VPN oder ein internes Ingress mit zusätzlicher Anmeldung davor; als Minimum für den Start `kubectl port-forward` ohne jeden Ingress). Welcher Weg im Cluster vorhanden ist, steht in `bloommd-cluster` und ist nicht Teil dieses Repos (Entscheidung 1).
4. **Payload-Konfiguration als zusätzliche Schicht.**
   - GraphQL abschalten (`graphQL.disable`), kein GraphQL-Playground.
   - Alle Collections: Anlegen, Ändern, Löschen nur mit angemeldetem Admin. Lesen anonym nur für veröffentlichte Einträge (`_status = published`) der Inhalts-Collections, nie für Entwürfe, Konten oder Admin-Collections.
   - CORS und CSRF mit leerer Liste bzw. nur dem Admin-Ursprung. Keine API-Schlüssel für Nutzer.
   - Alle Optionen sind gegen die in #204 gewählte Payload-Version zu prüfen; die Konfiguration ersetzt die Netzwerkgrenze nicht.

### Wie Marketing Inhalte bezieht (lesend, ohne App-Secrets)

**Empfehlung (Option L): Lesen zur Laufzeit über den Service im Cluster, ohne Token.** Marketing ruft serverseitig (nie aus dem Browser) einen festen Lesepfad des CMS auf und cacht per Revalidierung, wie `roadmap.ts` es für die Roadmap tut. Es gibt keinen Datenbankzugang und kein Secret in Marketing. Die Abschirmung ist die NetworkPolicy; geschützt wird nichts, was nicht ohnehin öffentlich ist (nur veröffentlichte Inhalte). Fällt das CMS aus, liefert Marketing den letzten gecachten Stand; der Build von Marketing hängt nicht vom CMS ab. Bis zur Migration liest Marketing weiter das Markdown im Repo.

Alternativen:

- **Option T (Lesen mit Token):** Wie L, aber mit lesendem API-Token in Marketing. Vorteil: Zugriff auch bei falscher NetworkPolicy begrenzt. Nachteil: ein weiteres Secret in der Marketing-App, das der Regel „keine App-Secrets“ zumindest widerspricht und `AGENTS.md` sowie `production-config.ts` ändert. Nur wenn Max die Regel bewusst erweitert (Entscheidung 2).
- **Option E (Export nach Git):** Eine Veröffentlichung im CMS erzeugt per Hook Markdown und einen Pull Request im Repo; Marketing bleibt unverändert und baut wie bisher. Vorteil: Git bleibt Quelle und Backup, Marketing hat gar keine Verbindung zum CMS. Nachteile: das CMS braucht ein Schreib-Token auf das Repo, jede Veröffentlichung braucht Build und Deploy, Medien wandern ins Repo, und die Pull-Request-Schleife macht die schnelle Pflege zunichte, die das CMS verspricht.

Option L ist die kleinste Abweichung vom Ist-Stand; E bleibt als Rückweg (Export, siehe oben).

## 4. Identität und Rechte

### Wo liegt was

| Daten | Ort | Hinweis |
|---|---|---|
| Nutzerkonten, Passwörter, Sitzungen, Tokens | `apps/app` (Postgres) | unverändert führend |
| Cloud-Zugänge (wer darf was, bis wann) | `apps/app`: `bloom_entitlements`, `bloom_workspace_members`, Beta-Gate, `bloom_beta_invites`, Agent-Rechte | Das Datenmodell trägt schon „bis wann“ (`expires_at`) und Widerruf |
| Admin-Login des CMS | `apps/cms` (Payload-Collection mit Betreiberkonten) | **bewusster, begründeter zweiter Speicher**, siehe unten |
| Redaktionelle Inhalte | `apps/cms` (Postgres, eigene Datenbank) | neu |

### Begründung für den einen zweiten Speicher (Admin-Login des CMS)

Payload braucht für seine Oberfläche eine Auth-Collection. Der zweite Speicher wird auf **Betreiberkonten** begrenzt (wenige Personen, die Inhalte pflegen). Er enthält keine Produktnutzer, keine Zugänge und keine Rechte des Produkts. Gründe:

- Die Alternative, die CMS-Anmeldung an die App zu hängen (benutzerdefinierte Auth-Strategie gegen `apps/app`), bräuchte eine neue Rolle „CMS-Admin“ im Rechtemodell der App und eine interne Anmelde-Schnittstelle zwischen beiden Diensten. Das ist genau der Stoff von Stufe 4 und würde ihn vorwegnehmen; es koppelt außerdem die Verfügbarkeit des CMS an die der App.
- Die Betreiberkonten bleiben ohne Berührungspunkt zu den Konten der Nutzer: Ein Admin des CMS ist kein Nutzer der App und umgekehrt.
- **Mehraufwand:** Betreiberkonten sind personenbezogene Daten der Bearbeiter und gehören ins Verzeichnis der Verarbeitungstätigkeiten. Zweiter Faktor, Passwort-Richtlinie und Sperren sind in #206 festzulegen und gegen die eingesetzte Payload-Version zu prüfen; ohne zweiten Faktor wäre der private Zugangsweg (Abschnitt 3) die einzige Schutzschicht vor dem Login.
- Sobald Stufe 4 steht, kann die CMS-Anmeldung auf die zentrale Identität umgestellt werden; das ist dann eine eigene Entscheidung (Entscheidung 4).

### Stellung zu den vier Abweichungen (Kommentar vom 30.10.2026)

**Abweichung 1: Reihenfolge gegenüber Stufe 1 bis 3.** Stufe 4 steht in der Umsetzungsreihenfolge der Grundlage hinter Stufen 1 bis 3, die laut Entscheid vom 30.10. Vorrang vor allem Neuen haben; #103 ist neuer Aufwand.
- **Stellung:** V1 berührt weder Identität noch Rechte und greift damit Stufe 4 nicht vor. Auch Stufen 1 bis 3 (Markdown-Kern, Sync, Konnektoren) werden nicht angefasst; V1 konkurriert mit ihnen nur um Entwicklungszeit, nicht um Architektur. Max hat die Umsetzung am 01.11. freigegeben.
- **Empfehlung:** ADR jetzt, die Etappen #204 bis #207 in der Priorität **hinter** laufender Arbeit an Stufen 1 bis 3 einreihen. Was Stufe 4 vorwegnimmt (Varianten V2 und C unten), wird nicht vor Stufe 4 entschieden.
- **Alternative A:** #103 ganz zurückstellen, bis Stufe 4 steht. Vorteil: keine Konkurrenz um Kapazität, keine Zwischenlösung für CMS-Logins. Nachteil: Blog und Landingpage bleiben an Deploys gebunden.

**Abweichung 2: zweiter Rechte-/Identitätsspeicher.** Zugänge zur Cloud-Nutzung sind Berechtigungen (wer darf was, bis wann). Nach Stufe 4 gehören sie in die App.
- **Stellung:** Die App führt diese Daten schon (`bloom_entitlements`, Mitgliedsrollen, Einladungen, `bloom_audit_events`). Ein Spiegel in Payload würde Abgleich, Audit und Löschung auf zwei Systeme verteilen, und jede Rechteprüfung der App hinge entweder am CMS oder an einer Kopie.
- **Empfehlung:** Zugänge bleiben in `apps/app`; Payload speichert sie nicht (V1).
- **Alternativen** (jede gilt nur mit eigener schriftlicher Begründung, wie von Max verlangt):
  - **V1+ (Payload als Bedienoberfläche für App-Daten):** Payload zeigt Zugänge in eigenen Admin-Ansichten, schreibt aber über eine interne, geprüfte Admin-Schnittstelle der App; der Speicher bleibt die App. Das erfüllt „Admin-Interface an die Custom-App angepasst“, ohne zweiten Speicher. Es braucht eine Schnittstelle App ↔ CMS und ein Admin-Rollenmodell mit Audit in der App, also Stufe 4. Frühestens dann entscheiden.
  - **C (Zugänge als Payload-Collection, Payload führend):** Entspricht der Variante C vom 30.10. Begründung der Doppelhaltung: Admin-Bedienung ohne Eigenbau. Preis: App liest Rechte aus Payload oder repliziert sie; Ausfall und Konsistenz der Zugänge hängen am CMS; Audit und DSGVO-Löschung über zwei Systeme. **Nicht empfohlen**, bevor Stufe 4 das Rechtemodell festlegt.

**Abweichung 3: Warteliste.** Die Warteliste ist durch #104/#105 abgelöst und abgeschaltet, die Registrierung ist offen. „Warteliste in Payload“ ist deshalb mehrdeutig. Möglich sind:
- (i) Die Warteliste soll wieder eingeführt werden. Das wäre ein Rückbau von #104/#105 und braucht einen eigenen Beschluss; mit #103 hat das nichts zu tun.
- (ii) Gemeint ist die **Freischaltung für Cloud-Zugänge** (Beta-Gate, Allowlist, Einladungen). Das sind Zugänge und gehören zu Abweichung 2: in die App (`BLOOMMD_BETA_ACCESS`, `bloom_beta_invites`). Der Standardwert des Gates ändert sich nicht ohne Freigabe des Owners.
- (iii) Gemeint ist die Abwicklung des Restbestands (Export, Einladung, Löschung, 90 Tage Aufbewahrung nach der Einladungsmail). Das läuft über `apps/marketing/scripts/waitlist.ts` und `BLOOMMD_WAITLIST_DATABASE_URL`. Die E-Mail-Adressen dürfen nicht in Payload landen; eine dritte Kopie widerspräche Zweckbindung und Löschfrist.
- **Empfehlung:** Nichts davon in Payload. Max bestätigt, welche Lesart gemeint war (Entscheidung 7).

**Abweichung 4: V1 oder V2 nicht ausdrücklich entschieden.** Begriffe, so wie im Kommentar vom 30.10. verwendet: **V1** = Payload nur für Inhalte, Nutzerdaten in der App. **V2** = Nutzerdaten in Payload. (Der Spike vom 26.10. unterschied dabei „V2“ = Payload als Auth-Speicher parallel zur App-Anmeldung und „V3“ = Payload als alleinige Nutzerverwaltung. Hier fallen beide unter V2.)
- **Stellung:** Der Kommentar vom 30.10. („keine API nach außen“, Custom-App führend) passt nicht zu V2: Ein Nutzerspeicher in Payload bräuchte Anmelde-, Sitzungs- und Token-Endpunkte, die von der App aus erreichbar sein müssen, und machte Payload zum führenden Identitätssystem.
- **Empfehlung: V1.**
- **Alternative V2** (Nutzerdaten in Payload). Nur mit den folgenden Folgen, die alle zu erfüllen wären:
  - **Umbau des Kerns:** Sitzungen, Mobile-Login mit PKCE, Agent- und Zugriffstoken, Mandantentrennung per Fremdschlüssel (`bloom_workspace_members`), Stripe-Bezug, Rate-Limits und Audit hängen an `bloom_users`. Alle müssten umgezogen oder auf Payload umgestellt werden. Eigener Folge-Spike nötig.
  - **Migrationsgrenze:** Passwort-Hashes (`pbkdf2-sha256`, 310 000 Iterationen) sind in Payload nicht direkt importierbar. Nur **Lazy-Migration** ist möglich: beim ersten Login alten Hash prüfen, dann neu hashen. Konten, die sich nie wieder anmelden, behalten den alten Hash. Dafür braucht es eine Frist und danach einen erzwungenen Passwort-Reset.
  - **DSGVO:** Auskunft (`/api/account/export`) und Löschung (`/api/account/delete`) müssten Payload und die Produktdatenbank (Workspaces, Dokumente, Abos, Stripe) umfassen: feste Löschreihenfolge, gemeinsames Audit, Verhalten bei Teilausfall. Die Verarbeitungsverzeichnisse und die Datenschutzerklärung müssten angepasst werden.
  - **Risiko:** Admin-Oberfläche und Nutzerspeicher im selben System. Ein Fehler im CMS-Admin erreicht Nutzerkonten.
  - **Aufwand:** nach Spike grob 25 bis 40 Personentage (Annahme).

### DSGVO bei V1

V1 ändert nichts an Auskunft und Löschung der Produktnutzer: `export` und `delete` bleiben in `apps/app`, im CMS liegen keine Nutzerdaten. Betroffen sind nur die Betreiberkonten des CMS und gegebenenfalls Autorenangaben in Blog-Einträgen (Name, öffentlich gewollt). Für beide gilt: Aufnahme ins Verzeichnis der Verarbeitungstätigkeiten, Löschung bei Ausscheiden, Prüfung der Datenschutzerklärung (`apps/marketing/src/app/datenschutz`) in #206.

## Optionen im Überblick

| Option | Kurz | Bewertung |
|---|---|---|
| **V1 + `apps/cms` (Empfehlung)** | Payload als interner Dienst nur für Inhalte, Zugänge und Nutzer in der App | Kleinste Abweichung von Max' Vorgaben, App-Split bleibt, DSGVO unverändert |
| V1+ | wie V1, später Payload-Ansichten als Oberfläche für App-Daten über App-Schnittstelle | möglich nach Stufe 4 |
| C | Zugänge (und evtl. Warteliste) als Payload-Collections | zweiter Rechtespeicher, nicht empfohlen vor Stufe 4 |
| V2 | Nutzerdaten in Payload | Kern-Umbau, nicht empfohlen |
| A | #103 zurückstellen bis Stufe 4 | kein Risiko, aber kein Nutzen für Redaktion |
| Einbetten in `apps/app` oder `apps/marketing` | Payload in einer bestehenden App | verworfen (Abschnitt 2) |

## Folgen

- **Neu:** Ein dritter auslieferbarer Dienst mit eigener Datenbank, eigenem Release und eigener Pflege (Updates von Payload, Sicherheitsfixes, Lizenz MIT im Spike geprüft).
- **Kosten:** Der Betrieb eines zweiten Postgres-Schemas samt Backup und Restore-Test; ein Medienspeicher; ein privater Admin-Zugangsweg.
- **Inhalte verlassen Git** (soweit sie ins CMS wandern): Reviews per Pull Request entfallen für sie, Historie liegt nur noch im CMS (Versionen in Payload sind zu prüfen). Der Markdown-Export ist der Rückweg.
- **Dokumentation:** `AGENTS.md` (Abschnitt „Web App Split“) und `docs/ARCHITECTURE.md` (Paketliste, Sicherheitsgrenze) müssen mit #204 den dritten Dienst nennen; `bun run docs:verify` prüft die Paketliste gegen die Workspaces und schlägt sonst an.
- **Sicherheit:** Die Netzwerkgrenze ist Hauptschutz für „keine API nach außen“. Eine Fehlkonfiguration von NetworkPolicy oder Ingress hebt ihn auf. Ein automatischer Test ist Pflicht (siehe Folgeschritte).

## Offene Entscheidungen für Max

Jede Zeile ist eine Entscheidung, die nur Max trifft. Die Empfehlung ist ein Vorschlag, kein Beschluss.

1. **Privater Admin-Zugangsweg:** Welcher Weg ist im Cluster verfügbar und gewollt (VPN, internes Ingress mit Anmeldung, nur `kubectl port-forward`)? *Empfehlung:* kein öffentliches Ingress; für den Start `kubectl port-forward`, danach ein VPN oder internes Ingress, sobald mehr als eine Person pflegt.
2. **Lesezugriff Marketing:** Option L (ohne Token, nur NetworkPolicy), T (mit lesendem Token, ändert die Regel „keine App-Secrets“ in Marketing) oder E (Export nach Git)? *Empfehlung:* L.
3. **Inhaltsarten ins CMS:** Blog und Landingpage-Globals ja; News erst nach Umbau des Release-Ablaufs (`news:draft` nach Payload statt Pull Request) oder bei Markdown im Repo bleiben; Docs, Templates und Rechtstexte bleiben im Repo. *Empfehlung:* Blog zuerst, danach Landingpage, News erst wenn der Release-Ablauf angepasst ist.
4. **Anmeldung am CMS:** Betreiberkonten in Payload (zweiter, begrenzter Speicher mit obiger Begründung) oder CMS-Anmeldung über die App-Identität (braucht Stufe 4)? *Empfehlung:* Betreiberkonten in Payload für V1, Wechsel zur zentralen Identität nach Stufe 4.
5. **Medienspeicher:** S3-kompatibler Bucket oder Volume? Wer betreibt ihn, wo liegt er (Datenresidenz)? *Empfehlung:* S3-kompatibler Bucket in der Hoheit der Plattform, mit eigenem Backup.
6. **Eigene Datenbank-Instanz oder gleicher Cluster:** *Empfehlung:* gleicher CNPG-Cluster, eigene Datenbank und Rolle ohne Rechte auf die App-Datenbank.
7. **Warteliste:** Welche Lesart ist gemeint (i) Wiedereinführung, (ii) Freischaltung für Cloud-Zugänge oder (iii) Abwicklung des Restbestands? *Empfehlung:* (ii) und (iii) bleiben in der App bzw. im bestehenden Skript; (i) nur mit eigenem Beschluss.
8. **Zugänge und Rechte:** V1 (bleiben in der App), V1+ (Payload als Oberfläche über App-Schnittstelle, nach Stufe 4) oder C/V2 (zweiter Speicher) mit eigener Begründung? *Empfehlung:* V1, V1+ erst mit Stufe 4.
9. **Reihenfolge:** #204 bis #207 hinter Stufen 1 bis 3 einreihen, parallel starten oder #103 zurückstellen (Alternative A)? *Empfehlung:* hinter Stufen 1 bis 3 einreihen.
10. **Erweiterung der Secret-Regel:** Falls Option T gewählt wird: Darf ein lesendes CMS-Token in der Marketing-App liegen? *Empfehlung:* nein (Option L macht es unnötig).

## Folgeschritte (nur Verweise, keine Umsetzung)

| Ticket | Inhalt | Abnahme aus dieser ADR |
|---|---|---|
| #204 | Dienst `apps/cms` aufsetzen: Workspace, Image, Payload-Konfiguration, Release-Check, `ARCHITECTURE.md` und `AGENTS.md` anpassen; Laufzeit (Node oder Bun) und Payload-Version festlegen | Konfiguration aus Abschnitt 3, Punkt 4 liegt im Repo; `docs:verify` grün |
| #205 | GitOps in `bloommd-cluster` und Secrets über 1Password/External Secrets: Deployment, ClusterIP-Service, NetworkPolicy, privater Zugangsweg | Von außen ist die API nicht erreichbar, aus dem Marketing-Pod lesbar, aus dem App-Pod verweigert (automatisierter Smoke-Test) |
| #206 | Admin-Anpassung: Oberfläche für die Betreiber, Betreiberkonten, zweiter Faktor, Rollen, Datenschutzerklärung | Ein Admin legt einen Inhalt an, er erscheint auf der Marketing-Seite |
| #207 | Backup und Restore: Datenbank und Medien, Probelauf nach dem Muster von `scripts/restore-drill.sh`, Markdown-Export als Rückweg | Backup und Restore einmal getestet, Log im Ticket |

Die Folgeschritte werden erst begonnen, wenn Max die offenen Entscheidungen beantwortet hat.
