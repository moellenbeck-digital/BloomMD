# ADR 0001: Payload als getrennte Admin-App für Inhalte, Benutzer und Zugänge

- **Status:** **angenommen**, freigegeben von Martin am 10.11.2026, PR #220 (793aa08). Die Entscheidungen Martin (Abschnitte „Entscheidungen Martin 09.11.“ und „Entscheidung Martin 10.11.“) sind beschlossen. Was in „Offene Entscheidungen“ steht, gilt nach der Empfehlung, außer O2, O8, O10 und O15. **Spike-Ergebnis vom 10.11.2026** (O12, O14, O16, O17, Version, Laufzeit, Aufwand): [Anhang](0001-payload-spike.md). Die Entscheidungen Martin sind davon nicht berührt.
- **Datum:** 2026-11-10 (erste Fassung 2026-11-02, ersetzt die Empfehlung V1 vom 02.11.)
- **Ticket:** #103 (Epic #196, Teil #203). Folgeschritte: #204 bis #207, neu zuzuschneiden (Abschnitt „Folgeschritte“). Zahlung: #276.
- **Gilt für:** `apps/marketing`, `apps/app`, `packages/sync`, neuer Dienst `apps/cms`, GitOps-Repo `bloommd-cluster`.

Diese Runde ist nur die ADR. Es gibt keinen Code, kein `apps/cms` und keine Migration. Alles, was hier als „Annahme“ steht, steht mit Nummer in „Offene Entscheidungen“ und gilt dort nach der Empfehlung (Ausnahmen siehe dort).

## Kontext

### Ausgangslage

Die erste Fassung (02.11.) empfahl Payload als internen Dienst nur für redaktionelle Inhalte. Martin hat am 09.11.2026 anders entschieden: Payload wird zur **getrennten Admin-App** (Payload headless) und führt zusätzlich **Benutzer, Zugänge und Testzeitraum** der Produkt-App. Die Anmeldung der App hängt danach am CMS. Das ist die Variante „V2“ der früheren Fassung. Die Entscheidung ersetzt die Empfehlung V1 und beantwortet die offenen Fragen 1 bis 10 aus der ersten Fassung.

Frühere Vorgaben (Max, 30.10. und 01.11.2026) und ihr Stand:

| Vorgabe | Stand nach 09.11. |
|---|---|
| Payload nur Admin-Interface, einfach an die Custom-App angepasst | gilt, die Admin-App ist ein eigener Dienst, siehe Abschnitt 2 |
| Keine Payload-API nach außen | gilt als „keine öffentliche API“; die dedizierte interne Schnittstelle ist ausgenommen, siehe Abschnitt 3 |
| Kein zweiter Identitäts- oder Rechtespeicher ohne schriftliche Begründung (Stufe 4) | gilt; die Begründung steht in Abschnitt 5. Es gibt einen Speicher, nicht zwei: Benutzer und Zugänge liegen **nur** im CMS |
| Marketing trägt keine App-Secrets | wird bewusst erweitert um ein lesendes Token, siehe Abschnitt 4 |
| Warteliste und Zugänge der Cloud-Nutzung über Payload | Zugänge ja, Warteliste ist bereits Nutzerkonten der App und geht mit ihnen nach Payload, siehe Abschnitt 6 |

### Stand im Repository (geprüft am 2026-11-10, `main` bei 79b4777)

- **App-Split:** `apps/marketing` (bloommd.io) und `apps/app` (bloommd.app) sind getrennte Next.js-Anwendungen mit getrennten Builds und Images (`Dockerfile`, Ziele `app` und `marketing`). `apps/marketing/src/lib/production-config.ts` lehnt im Release-Check `DATABASE_URL`, `BLOOMMD_AUTH_SECRET`, `BLOOMMD_SYNC_SECRET`, `NEXT_PUBLIC_SYNC_URL`, `STRIPE_SECRET_KEY` und `STRIPE_WEBHOOK_SECRET` ab; `AGENTS.md` (Abschnitt „Web App Split“) enthält die Regel. Siehe auch [ARCHITECTURE.md](../ARCHITECTURE.md).
- **Inhalte heute:** Markdown mit Frontmatter im Repo, zweisprachig (`-en.md`). Blog und News unter `apps/marketing/content/blog` und `apps/marketing/content/news`, gelesen von `apps/marketing/src/lib/posts.ts` aus dem Dateisystem. Ein veröffentlichtes (nicht-Pre-)Release löst `.github/workflows/marketing-news-draft.yml` aus, das mit `news:draft` einen zweisprachigen Entwurf als Pull Request anlegt. Docs, Templates und Rechtstexte liegen ebenfalls im Repo.
- **Benutzer, Anmeldung, Rechte (alles in der App-Postgres):** `bloom_users` (E-Mail, `password_hash`, `email_verified_at`, `stripe_customer_id`, `trial_ends_at`, `trial_legacy`, `locale`, kanonische E-Mail-Adresse), `bloom_sessions`, `bloom_access_tokens` (nur Hash), `bloom_auth_tokens` (Zweck `email_verification`, `password_reset`, `waitlist_activation`), `bloom_mobile_auth_codes`, `bloom_entitlements`, `bloom_subscriptions`, `bloom_beta_invites`, `bloom_waitlist_transfers`, `bloom_trial_reminders`, `bloom_workspaces`, `bloom_workspace_members` (owner, editor, viewer), Agent-Rechte (`bloom_agent_token_*`, `bloom_workspace_agents`), `bloom_audit_events`, `bloom_rate_limits`, `bloom_mail_budget`. Fast alle Tabellen verweisen per Fremdschlüssel mit `on delete cascade` auf `bloom_users`; die Konto-Löschung stützt sich darauf (`docs/LOESCHKONZEPT.md`, Abschnitt 3).
- **Passwort-Hash:** `pbkdf2-sha256$310000$<salt>$<hash>` (`apps/app/src/lib/passwordAuth.ts`), Regel: mindestens 10 Zeichen, Buchstaben und Zahlen. Sitzungen: signiertes Cookie, 30 Tage (`lib/auth.ts`), Zustand in `bloom_sessions`. Reset-Link: 60 Minuten (`request-password-reset`). Aktivierungs-Link der Wartelisten-Konten: einmalig, 14 Tage (`waitlist-transfer-constants.ts`).
- **Warteliste:** beendet durch #104/#105. Die Konten der Warteliste sind in der App angelegt (`createPreparedWaitlistAccount`, Migration `011`: ohne Passwort, ohne bestätigte Adresse, Aktivierungs-Mail einmalig, nie aktivierte Konten werden 90 Tage nach der Mail gelöscht). Der Rest der Marketing-Warteliste liegt in `BLOOMMD_WAITLIST_DATABASE_URL` bis zur Abwicklung (`apps/marketing/scripts/waitlist.ts`).
- **Testzeitraum (#274, Migration `013`, `lib/trial.ts`, `docs/TRIAL.md`):** neue Konten 30 Tage ab E-Mail-Bestätigung (`trial_ends_at` einmal gesetzt), Hinweis-Mails nach 15 und 23 Tagen (Tabelle `bloom_trial_reminders`, höchstens eine Mail je Hinweis). Bestandskonten (`trial_legacy`, alle Konten bei der Migration, auch frühere Wartelisten-Konten): fest 15.12.2026 00:00 UTC (Zählung ab 15.11.2026), Hinweise 30.11. und 08.12., Versand nur mit `BLOOMMD_TRIAL_REMINDERS_EXISTING=1` nach Admin-Go. Sperre nach Ablauf (nur lesen, Export bleibt) hinter `BLOOMMD_TRIAL_READONLY=1`, Standard aus, Prüfung zentral in `apps/app/src/proxy.ts`. Migration `014`: kanonische E-Mail-Adresse, ein bestätigtes Konto je Postfach (#169). Tests: `tests/integration/trial-period-db.integration.test.ts`, `tests/integration/mailbox-trial-db.integration.test.ts`, `tests/integration/waitlist-transfer-db.integration.test.ts`, `apps/app/src/lib/trial*.test.ts`.
- **Sync:** `packages/sync` prüft Sync-Ticket (von der App signiert) und liest Mitgliedschaft und Version direkt aus der App-Postgres (`bloom_workspace_members`, `bloom_documents`).
- **DSGVO:** `GET /api/account/export` (`exportAccountData`) und `POST /api/account/delete` (kündigt Stripe-Abos, dann `deleteAccountData` in einer Transaktion) liegen in `apps/app`.
- **Mail:** Versand über Resend aus der App, globale Obergrenze 60 pro Stunde und 300 pro Tag (`lib/mail-budget.ts`, Tabelle `bloom_mail_budget`).
- **Billing:** `BLOOMMD_BILLING_ENABLED=0`, Checkout, Portal und Webhook antworten 404 (`docs/BETA-SCOPE.md`). Es gibt keine Zahlungsdaten.
- **Muster „Marketing liest serverseitig von außen“:** `apps/marketing/src/lib/roadmap.ts` holt die Roadmap serverseitig mit einem lesenden GitHub-Token und `revalidate` von 30 Sekunden; das Token erreicht den Browser nie.
- **Postgres und Restore:** Die Hosted-Beta nutzt CloudNativePG (`docs/ARCHITECTURE.md`); `scripts/restore-drill.sh` ist der Probelauf für die App-Datenbank.

### Spike (26.10.2026) und was sich nicht belegen lässt

Der Spike war ein Wegwerf-Prototyp außerhalb des Repos. Diese Punkte sind **nicht** im Repo belegt und in #204 gegen die gewählte Payload-Version neu zu prüfen: Payload 3.x (MIT) läuft als Next.js-Anwendung; Version 3.92 deklarierte Next ≥ 16.3.3 und < 17 (passt zu Next 16.4.2 im Repo) und Node ^22.23.4 oder ≥ 24.22.1, das Repo erlaubt `node >=22 <23` und baut auf `oven/bun`. Der Postgres-Adapter nutzt Drizzle; Migrationen laufen über die Payload-CLI. Der BloomMD-Passwort-Hash lässt sich nicht als Payload-Hash importieren.

### Spike im Repo (10.11.2026, Ticket #103)

Die Punkte des Wegwerf-Spikes sind seit dem 10.11.2026 gegen Payload **3.93.0** und Postgres belegt; Befehle, Ausgaben und Prüfskripte stehen im [Anhang](0001-payload-spike.md). Kurz: Next 16.4.2 passt; **Node ≥ 22.23.4** ist Pflicht und `.nvmrc` (22.22.2) liegt darunter (Aufgabe für #204, nicht Teil von #103); `/svc/v1` als eigene Routen neben `/api` und das Lese-Token (Option T) gehen; die Auth für Endnutzer trägt mit Hooks und Eigenbau an vier Stellen; Aufwand neu **77 bis 122 Personentage** (Annahme). Nicht belegt sind Produktions-Build, Admin-Oberfläche im Browser, Mesh und Ingress (O15) und Last. Wo der Spike einer Aussage dieser ADR widerspricht, ist der Text unten korrigiert; die Stellen listet der Anhang im Abschnitt „Abweichungen von der ADR“.

## Entscheidung

Payload headless läuft als **getrennte Admin-App `apps/cms`** im wave-mesh. Sie führt Inhalte (Blog, News), Benutzer, Zugänge und den Testzeitraum. Zahlungsbezug (letzte Bezahlung, Rückerstattung) kommt mit #276 dazu. `apps/app` fragt Anmeldung und Rechte über eine dedizierte interne Schnittstelle (`/svc/v1`) beim CMS ab. Es gibt keine öffentliche API. Ein Zwischenstand geht nicht nach Prod: Oberfläche und Migration werden gemeinsam umgesetzt, im Testsystem mit pseudonymisiertem Abbild geprüft und erst dann ausgerollt.

Wo die Entscheidung etwas offenlässt, steht es im Abschnitt „Offene Entscheidungen“ und gilt dort nach der Empfehlung. Ausnahmen (O2, O8, O10, O15) bleiben offen.

## 1. Zweck und Umfang

### Was Payload bekommt

| Inhalt oder Funktion | Stand | Anmerkung |
|---|---|---|
| Blog, News | Ja, Collections mit Sprachfeld (de/en), Entwurf und veröffentlicht | News entstehen heute aus dem Release-Ablauf (`marketing-news-draft.yml`); der Weg ins CMS ist offen (O12) |
| Benutzerliste | Ja, Collection `users` | Konto, Sprache, Bestätigung, Cloud-Zugang, Testzeitraum, Plattformrolle |
| Testzeitraum | Ja | Standard 30 Tage ab E-Mail-Bestätigung, anpassbar; Beta-Teilnehmer 60 Tage (Abschnitt 6) |
| Zugänge (Cloud-Zugang, Beta-Gate, Einladungen) | Ja | Entitlements, `bloom_beta_invites`; die Gate-Logik der App (`BLOOMMD_BETA_ACCESS`) liest sie über die Schnittstelle |
| Letzte Bezahlung, Rückerstattung | Ja, mit #276 | nur Referenzen und Beträge, Abschnitt 7 |
| Medien (Bilder zu Blog und News) | Ja | S3-Speicher bei Hetzner, Abschnitt 2 |
| Betreiberkonten (Admin-Login) | Ja | eigene Collection `operators` |

### Was Payload nicht bekommt

- **Docs, Templates, Rechtstexte:** bleiben Markdown bzw. Code im Repo (Produktstand, Review, Doc-Lint in der CI, `BLOOMMD_LEGAL_*`).
- **Dokumente, Workspaces, Mitgliedschaften, Sitzungen, Zugriffs- und Agent-Tokens, Agent-Rechte, Audit der Inhaltsrechte:** bleiben in `apps/app` (Abschnitt 5, Abgrenzung).
- **Karten- und Bankdaten:** nie. Stripe bleibt die Quelle der Zahlungsdaten.
- **Passwörter im Klartext oder als altes PBKDF2:** nie (Abschnitt 8).
- **Eine öffentliche API:** nirgends (Abschnitt 3).

Landingpage-Texte stehen im Code und gehören nicht zum beschlossenen Umfang; sie bleiben bis zu einer eigenen Entscheidung dort.

## 2. Betriebsform: getrennte Admin-App

- **Dienst:** `apps/cms` als eigener Workspace, eigenes Dockerfile-Ziel `cms`, eigene SemVer-Version in `apps/cms/package.json`; die Regeln für sichtbare Version und Build-Info aus `AGENTS.md` gelten (im Admin sichtbar, kein öffentlicher Endpunkt). Laufzeit und Payload-Version legt #204 fest. **Empfehlung nach dem Spike** ([Anhang, Abschnitt 1](0001-payload-spike.md#1-version-und-laufzeit-todo-1)): Payload 3.93.0, CMS-Image auf **Node ≥ 22.23.4** (Payloads Engine `^22.23.4 || >=24.22.1`), Installation mit Bun; `next dev` unter Bun läuft nur mit webpack, der Produktions-Build ist ungeprüft. `.nvmrc` 22.22.2 liegt unter der Engine und ist in #204 anzuheben (CI nutzt `node-version-file`).
- **Erreichbarkeit:** Der Dienst ist im wave-mesh nur als Service erreichbar (ClusterIP). Admins erreichen die Oberfläche über den wave-Ingress; er ist der einzige Weg von außen in den Dienst und führt nur zu `/admin` und dem Pfad, den die Oberfläche braucht (Annahme A5: der Ingress kann Pfade begrenzen). Die Payload-Oberfläche ruft im Browser dieselbe REST-API desselben Ursprungs auf; für Admins lässt sich Oberfläche deshalb nicht von dieser API trennen, für die Dienste (App, Marketing) schon (Abschnitt 3).
- **Datenbank:** gleicher CNPG-Cluster, eigene Datenbank und eigene Rolle (z. B. `bloommd_cms`) ohne jedes Recht auf die App-Datenbank. Der CMS-Dienst bekommt nie die `DATABASE_URL` der App, die App nie die des CMS (empfohlener Name `CMS_DATABASE_URL`).
- **Medien:** S3-kompatibler Speicher bei Hetzner. Nur das CMS hat Schreibrechte (eigener Zugangsschlüssel nur auf den Bucket der Medien, kein Zugriff auf andere Buckets). Wie veröffentlichte Medien den Browser erreichen (öffentlich lesbares Präfix oder Auslieferung über Marketing), ist offen (O11).
- **Secrets:** nur über 1Password und External Secrets, nur im jeweiligen Deployment: CMS: `PAYLOAD_SECRET`, `CMS_DATABASE_URL`, S3-Zugang, Schlüssel zur Prüfung der App-Aufrufe. App: Schlüssel zum Signieren der Aufrufe an das CMS. Marketing: nur das lesende Token (Abschnitt 4). Nichts im Repo, nichts in Images.
- **Konfiguration der Admin-Oberfläche:** Die Oberfläche wird an die Custom-App angepasst (Vorgabe Max): Benutzerliste mit Testzeitraum und Zugängen, Redaktion für Blog und News, Medien, Betreiberverwaltung. Details und Rollen (Vorschlag: `admin`, `support` mit Benutzerliste und Testzeitraum, `editor` nur Inhalte) legt #206 fest.

## 3. Keine öffentliche API, dedizierte interne Schnittstelle

### Wie „intern im Mesh“ zu „keine Payload-API nach außen“ passt

Gemeint ist: Aus dem Internet, aus Browsern der Nutzer, von Desktop- und Mobile-Clients ist keine Payload-Schnittstelle erreichbar. Browser, Mobile, Desktop und Agenten sprechen ausschließlich mit `apps/app` (bloommd.app) oder `apps/marketing` (bloommd.io), nie mit dem CMS. Von der Regel ausgenommen ist die **dedizierte interne Schnittstelle `/svc/v1`**: ein fester, versionierter Satz von Endpunkten, den nur `apps/app` und `apps/marketing` aus dem Mesh aufrufen. Die allgemeinen Payload-Schnittstellen (REST für alle Collections, GraphQL) sind für keinen Dienst und für keinen Nutzer offen. Die Regel „keine API nach außen“ wird so zu: keine öffentliche API, und intern nur der enumerierte Vertrag.

### Fünf Schichten

Payload stellt Oberfläche, REST und GraphQL aus einem Prozess bereit. Jede Schicht genügt allein nicht.

1. **Keine öffentliche Zuordnung.** In `bloommd-cluster` gibt es für `apps/cms` keine öffentliche DNS-Zuordnung, keinen Ingress auf einer öffentlichen Domain, keinen LoadBalancer oder NodePort. Der Ingress für Admins ist der wave-Ingress.
2. **NetworkPolicy.** Eingehend: nur von den App-Pods (für `/svc/v1`), den Marketing-Pods (nur Inhalte lesen) und dem wave-Ingress (nur Oberfläche). Ausgehend: nur zur CMS-Datenbank, zum Medienspeicher, zum Mail-Anbieter, falls das CMS Mails sendet (O5), und zu DNS. Kein Zugang zur App, zur App-Datenbank, zum Sync-Dienst. Wo das Mesh Pfadregeln (Schicht 7) kann, gilt zusätzlich: App und Marketing erreichen nur `/svc/v1`, nie `/api` oder `/admin` (Annahme A5, O15).
3. **Authentisierung zwischen den Diensten** (unten).
4. **Payload-Konfiguration.** GraphQL aus **und die Route-Dateien `api/graphql` und `api/graphql-playground` der Vorlage gelöscht**: `graphQL.disable` allein sperrt den Playground nicht (im Spike antwortete er mit 200). Alle Collections verweigern standardmäßig; Zugriff nur über ausdrückliche Zugriffsfunktionen. Die Standard-Endpunkte der Collection `users` (Login, Registrierung, Passwort-Vergessen) sind verweigert, und ein **Wächter vor der REST-Route `/api`** antwortet ohne Betreiber-Sitzung mit 404 (ausgenommen nur die Anmelde-Pfade der Betreiber); die Anmeldung der Nutzer läuft nur über `/svc/v1/auth/login`. Für Betreiber nutzt die Oberfläche die Collection `operators`. CORS und CSRF beschränkt auf den Admin-Ursprung (ein Cookie ohne passenden `Origin` erkennt Payload nicht als Sitzung an). Die Passwort-Regel der App gilt als Hook beim Anlegen und Ändern **und** beim Zurücksetzen (`beforeOperation` für `resetPassword`; `beforeValidate` greift dort nicht). Alle Optionen sind im Spike gegen 3.93.0 im Dev-Lauf geprüft ([Anhang, Abschnitt 3](0001-payload-spike.md#3-o16-svcv1-und-token)); das Verhalten im Produktions-Build (z. B. `disablePlaygroundInProduction`) prüft #204.
5. **Inventar-Test.** Ein automatischer Test zählt alle erreichbaren Routen des CMS auf und scheitert bei jeder unbekannten. Zusätzlich der Smoke-Test aus #205: aus dem Internet unerreichbar, aus dem App-Pod nur `/svc/v1`, aus dem Marketing-Pod nur lesbare Inhalte, aus fremden Pods verweigert.

### Authentisierung zwischen den Diensten

| Aufrufer | Mittel | Rechte |
|---|---|---|
| `apps/app` | Netzwerkidentität (NetworkPolicy, falls das Mesh es kann mTLS, Annahme A5, O15) **und** signierter Aufruf: Kopf `X-Svc-Signature` (HMAC-SHA256 über Methode, Pfad, Hash des Bodys, Zeitstempel und Nonce), Toleranz ±60 s, Wiederholschutz über die Nonce (der Nonce-Speicher muss bei mehreren Replikas **geteilt** sein, z. B. in der CMS-Datenbank; ein Speicher je Prozess genügt nicht); eigener Schlüssel nur für die App, zwei Schlüssel gleichzeitig gültig für die Rotation | alle Endpunkte außer Inhalte schreiben |
| `apps/marketing` | lesendes Token (`Authorization: Bearer`), dienstseitig geprüft, siehe „Wie das Token auf `/svc/v1` greift“ (Annahme A6, O16) | nur `GET /svc/v1/content/blog` und `/news`, nur veröffentlichte Einträge |
| Betreiber | Payload-Sitzung der Collection `operators`, zweiter Faktor Pflicht (O9; Payload hat keinen nativen zweiten Faktor, Community-Plugin oder Eigenbau, Anhang 2) | je nach Rolle |

### Wie das Token auf `/svc/v1` greift (Option T, Annahme A6)

- **Art:** ein zufälliges, undurchsichtiges Token (mindestens 256 Bit) je Aufrufer, **kein** Payload-API-Schlüssel und keine Payload-Sitzung. Das CMS speichert nur einen Hash (oder HMAC mit einem Wert aus den Secrets); das Token selbst liegt in 1Password und kommt über External Secrets ins Marketing-Deployment. SHA-256 genügt bei 256 Bit Zufall.
- **Wo geprüft:** dienstseitig im Handler von `/svc/v1/content`. Der Vertrag `/svc/v1` wird als eigene Routen von `apps/cms` umgesetzt, die die Local API von Payload nutzen. Payload-eigene Endpunkte liegen standardmäßig unter `/api`; damit das Token dort nirgends gilt, wird es **nicht** als Payload-Authentisierung eingerichtet. Auf `/api` und `/admin` ist es wirkungslos, auch wenn jemand das Netz erreicht.
- **Begrenzung:** nur `GET /svc/v1/content/blog` und `/news`; nur Einträge mit Status „veröffentlicht“; nie Benutzer, Entwürfe, Medien-Schreibzugriff oder andere `/svc/v1`-Endpunkte (die verlangen die Signatur der App). Anfragen je Zeit begrenzt (Payload hat kein Rate-Limit; es wird im Handler gebaut, bei mehreren Replikas mit geteiltem Zähler), Rotation mit zwei gleichzeitig gültigen Tokens, Widerruf sofort durch Löschen des Hashes, Audit nur mit Zähler und Zeit (keine Inhalte).
- **Spike-Ergebnis (10.11.2026, Dev-Lauf, [Anhang, Abschnitt 3](0001-payload-spike.md#3-o16-svcv1-und-token)): Annahme A6 ist bestätigt.** `/svc/v1/*` läuft als Next-Route-Handler neben `/api`; das Token greift nur im Handler (auf `/api/*` 404, auf `/admin` wirkungslos). Abweichungen und Ergänzungen: (1) `/api` braucht einen **Wächter**, der ohne Betreiber-Sitzung 404 antwortet; (2) `graphQL.disable` reicht nicht, die Route-Dateien müssen gelöscht werden (Schicht 4); (3) Nonce-Speicher der App-Signatur und Rate-Limit brauchen bei mehreren Replikas **geteilten** Speicher. **Weiter offen:** ob das Mesh die Pfadbegrenzung kann (A5, O15) und das Verhalten im Produktions-Build.

Die Prüfung wiederholt sich nie im Browser: Kein Schlüssel und kein Token erreicht einen Client. Der Schlüssel der App schützt nicht vor einer kompromittierten App (sie kann ohnehin Sitzungen ausstellen), sondern vor jedem anderen Pod, der das Netz erreicht.

### Endpunkte von `/svc/v1`

Beschreibung als OpenAPI-Datei im Repo (`apps/cms/openapi/svc-v1.yaml`), Vertragstests auf beiden Seiten. Antworten enthalten nie Passwort-Hashes. Jeder Aufruf trägt eine Anfrage-ID für das Audit.

| Endpunkt | Aufrufer | Zweck |
|---|---|---|
| `POST /svc/v1/auth/login` | App | E-Mail und Passwort prüfen; Antwort: Benutzer-ID, Status, Rechte-Stand (siehe `access`). Fehlversuche zählt die App mit ihren bestehenden Grenzen (`bloom_rate_limits`) und das CMS zusätzlich je Konto (Payload-Sperre nativ: 5 Versuche, 15 Minuten; ihre Meldung „gesperrt“ unterscheidet sich von „falsch“ und wird im Handler auf dieselbe Antwort abgebildet, Anhang 2) |
| `POST /svc/v1/users` | App | Registrierung: Konto anlegen, Schutz „ein bestätigtes Konto je Postfach“ (#169), Verifizierungs-Token zurückgeben |
| `POST /svc/v1/tokens/redeem` | App | Link einlösen (E-Mail-Bestätigung, Passwort setzen, Wartelisten-Aktivierung); einmalig, Zweck und Ablauf geprüft |
| `POST /svc/v1/password-resets` | App | Link zum Setzen oder Zurücksetzen des Passworts anfordern; antwortet immer gleich (kein Hinweis, ob das Konto existiert) |
| `GET /svc/v1/users/{id}/access` | App | Rechte-Stand: Status, Cloud-Zugang, Entitlements, Testende, Plattformrolle, `sessionsValidAfter`; mit `ETag` und Gültigkeit für den Cache |
| `GET /svc/v1/users?ids=…` | App | Anzeigefelder (E-Mail, Name) für Mitgliederlisten, höchstens 100 je Aufruf |
| `GET /svc/v1/users/{id}/export` | App | Auskunft, Teil des CMS (Abschnitt 13) |
| `POST /svc/v1/users/{id}/deletion` | App | Löschauftrag, idempotent über einen Schlüssel (Abschnitt 13) |
| `POST /svc/v1/payment-refs` | App | Referenzen und Beträge aus Stripe-Ereignissen eintragen (ab #276) |
| `GET /svc/v1/refund-requests?status=requested` und `POST …/{id}/result` | App | Rückerstattungsaufträge abholen und das Ergebnis melden (ab #276, Abschnitt 7) |
| `GET /svc/v1/content/{blog\|news}` | Marketing | veröffentlichte Inhalte lesen (Option T) |
| `GET /svc/v1/health/ready` | Kubernetes | Bereitschaft (Datenbank, Medienspeicher); ohne Daten |

Der Sync-Dienst ruft das CMS **nicht** auf: Die App prüft die Rechte, stellt das Sync-Ticket aus (kurze Gültigkeit) und `packages/sync` liest die Mitgliedschaft weiter in der App-Datenbank.

## 4. Lesezugriff Marketing (Option T) und Secret-Regel

Marketing ruft die Inhalte serverseitig (nie aus dem Browser) mit einem **lesenden Token** über den Service im Mesh ab und cacht per Revalidierung, wie `roadmap.ts` es für die Roadmap tut. Das Token kann nur Blog und News lesen, nur veröffentlichte Einträge, nie Benutzer oder Entwürfe. Es liegt in 1Password und kommt über External Secrets ins Marketing-Deployment, nirgends sonst.

**Die Secret-Regel wird bewusst erweitert:** „Marketing trägt keine App-Secrets“ bleibt für alles, was die App betrifft (`DATABASE_URL`, `BLOOMMD_AUTH_SECRET`, `BLOOMMD_SYNC_SECRET`, `NEXT_PUBLIC_SYNC_URL`, Stripe-Secrets, Schlüssel zum Signieren der CMS-Aufrufe). Ausgenommen ist genau ein Wert: das lesende CMS-Token, zum Beispiel `CMS_READ_TOKEN` (Name legt #204 fest). Anzupassen sind `AGENTS.md` (Abschnitt „Web App Split“) und `apps/marketing/src/lib/production-config.ts`: das Token ist im Release-Check erlaubt und wird auf Form und Platzhalter geprüft, alle anderen Namen bleiben verboten, ebenso die Schreibschlüssel des CMS. Das ist Teil von #204.

Ausfall: Fällt das CMS aus, liefert Marketing den letzten gecachten Stand. Der Build von Marketing hängt nicht vom CMS ab. Bis zur Migration liest Marketing weiter das Markdown im Repo; danach bleibt ein Export aller veröffentlichten Inhalte nach Markdown mit Frontmatter (Format von `posts.ts`) Pflicht, damit der Weg zurück zu Git offen bleibt.

## 5. Identität und Rechte: V2 und das Gegenstück zu Stufe 4

### Aufteilung (Abgrenzung, Annahme A1/A2)

| Daten | Ort | Hinweis |
|---|---|---|
| Benutzerkonto: E-Mail, Sprache, Bestätigung, Passwort (neuer Hash), Status | `apps/cms` | führend, einzige Quelle |
| Cloud-Zugang, Beta-Gate, Einladungen, Entitlements, Testzeitraum | `apps/cms` | Beschluss Martin 09.11. Punkt 8 |
| Tokens zum Bestätigen, Setzen und Zurücksetzen von Passwörtern | `apps/cms` | Einmal-Links |
| Zahlungsbezug (Referenzen, Beträge) | `apps/cms`, mit #276 | Stripe bleibt Quelle |
| Betreiberkonten | `apps/cms` | getrennte Collection |
| Workspaces, Mitgliedschaften (owner, editor, viewer), Dokumente, Share-Links | `apps/app` | verweisen nur per Benutzer-ID auf Personen |
| Sitzungen, Zugriffstoken, Agent-Rechte und -Tokens, Audit der Inhaltsrechte | `apps/app` | gelten für Inhalte und Geräte, nicht für Identität; Annahme A1 |
| Redaktionelle Inhalte, Medien | `apps/cms` | |

**Annahme A1:** Sitzungen und Zugriffstoken (inklusive Agent-Tokens und Mobile-Codes) bleiben in der App-Datenbank. Sie sind abgeleitete Zustände; ihr Gültigkeitsstand folgt dem Rechte-Stand des CMS (`sessionsValidAfter`, `status`). Das hält Laufende-Sitzungen-Verhalten bei einem CMS-Ausfall beherrschbar (Abschnitt 12).

**Annahme A2:** `bloom_users` bleibt in der App-Datenbank als **Referenztabelle ohne personenbezogene Daten** (nur Benutzer-ID und Anlagezeit), damit die Fremdschlüssel und die Kaskaden der Workspace-Tabellen bestehen bleiben. Die Benutzer-ID wird 1:1 aus dem Bestand übernommen (dieselbe UUID im CMS; im Spike machbar mit einem eigenen Feld `id` vom Typ Text in der CMS-Collection, mit `idType: 'uuid'` allein ignoriert Payload die mitgegebene ID). Alternative: Fremdschlüssel entfernen und Aufräumen per Job; das ist mehr Umbau und mehr Risiko (O3).

### Begründung: das Gegenstück zu Stufe 4

Stufe 4 der Grundlage (`docs/WISSENSPLATTFORM-ROADMAP.md`, „Identität, Rollen und Delegation“) beschreibt Menschen und Agenten als unterscheidbare Identitäten, Rechte für Organisation, Workspace, Projekt, Ordner und Datei, Delegation, Ablauf, Widerruf, Audit. Das ist ein **Rechtemodell über Inhalte**. Die Entscheidung vom 09.11. verlegt etwas anderes: die **Plattformidentität** (wer ist die Person, darf sie die Cloud nutzen, bis wann) und die Betreibersicht darauf. Beide Ebenen sind getrennt, jede Tatsache hat genau einen Eigentümer:

- **CMS (Ebene 1, Plattform):** Person, Zugang, Testzeitraum, Plattformrolle der Betreiber, Zahlungsbezug.
- **App (Ebene 2, Stufe 4):** wer was an welchem Workspace, Ordner, Dokument darf, Agenten, Delegation, Widerruf, Audit der Inhaltsrechte.

Der Vorgabe „kein zweiter Identitäts- oder Rechtespeicher ohne schriftliche Begründung“ genügt die Aufteilung so: Es gibt **keine Doppelhaltung**. Ein Benutzer und ein Zugang stehen nur im CMS; die App hält von der Person nur die ID und liest alles andere über die Schnittstelle (Rechte-Stand mit Cache). Der bisherige Absatz zum zweiten Speicher (Betreiberkonten neben der App-Anmeldung) entfällt in dieser Form: Er begründete, warum die Nutzer in der App bleiben; nun ist das Gegenteil beschlossen, und die Gründe für V2 sind:

- **Eine Bedienoberfläche für alles, was Betreiber pflegen:** Benutzer, Testzeitraum, Zugänge, Inhalte und später Zahlungsbezug in einer Admin-App, ohne Eigenbau einer Admin-Oberfläche in `apps/app` (Vorgabe Max: Admin-Interface einfach an die Custom-App angepasst).
- **Trennung der Angriffsfläche:** Die Konten und ihr Passwort-Hash liegen nicht mehr in der Datenbank, an der die Dokumente hängen; die Rolle der CMS-Datenbank hat kein Recht auf die App-Datenbank und umgekehrt.
- **Eine Quelle für Zugang und Testzeitraum:** Bisher stehen Zugang (`bloom_entitlements`, Gate, Einladungen), Testende und Hinweis-Mails (`bloom_trial_reminders`) verteilt in der App; Betreiber ändern sie über Skripte (`db:trial-reminders`). Nach V2 ändert ein Betreiber sie in der Oberfläche, mit Audit.
- **Stufe 4 baut auf der Identität auf:** Stufe 4 braucht eine stabile Benutzer-ID als Träger von Rollen und Delegation. Diese ID bleibt unverändert (A2), das Rechtemodell von Stufe 4 ändert sich durch V2 nicht.

Was V2 kostet, trägt der Abschnitt „Folgen“: Anmeldung und Rechteprüfung hängen am CMS (Abschnitt 12), die Migration ist groß (Abschnitt 10), Datenschutz verteilt sich auf zwei Systeme (Abschnitt 13), Stufe 4 muss die Grenze beachten. **Wenn Stufe 4 ein Modell beschließt, das Identität und Inhaltsrechte anders schneidet (z. B. Organisationen mit eigenem Identitätsanbieter), ist diese Aufteilung neu zu prüfen.** Das ist ein Risiko dieser ADR (O1).

## 6. Warteliste, Testzeitraum und Abgleich mit dem Beschluss vom 04.11.

### Warteliste

Die Warteliste wird in Nutzerkonten der App überführt (Beschluss Martin 09.11. Punkt 7). Das ist im Code bereits der Weg von #105: vorbereitete Konten ohne Passwort, Aktivierungs-Mail, Löschung nach 90 Tagen ohne Aktivierung (`bloom_waitlist_transfers`). Mit V2 wandern diese Konten nach Payload wie alle anderen: ohne Passwort, mit Herkunft „Warteliste“ und Sprache. Der Restbestand der Marketing-Warteliste (eigene Datenbank) ist nicht Teil des CMS; seine Abwicklung bleibt bei `waitlist.ts`. E-Mail-Adressen der Warteliste landen nicht als dritte Kopie in Payload.

### Testzeitraum

| Gruppe | Beschluss 04.11. (#215, #271, #274, umgesetzt in Migration `013`) | Beschluss 09.11. | Wirkung |
|---|---|---|---|
| Neue Konten | 30 Tage ab E-Mail-Bestätigung, Hinweise nach 15 und 23 Tagen | Standard 30 Tage, **anpassbar** | Dauer ist ein Wert im CMS statt Konstante `TRIAL_DAYS`; die Anpassung ist eine Funktion der Admin-Oberfläche |
| Bestandskonten, inklusive früherer Wartelisten-Konten (`trial_legacy`) | Zählung ab 15.11.2026, Testende 15.12.2026, Hinweise am 30.11. und 08.12. | Teilnehmer der Beta 60 Tage | Testende vermutlich 14.01.2027 (15.11.2026 + 60 Tage); Hinweis-Termine und Gruppe sind offen (O2) |

**Abgleich, was im Repo ändert (gilt auch ohne Payload):** Das Testende der Bestandskonten steht heute fest in Migration `013` (`2026-12-15T00:00:00Z`), in `LEGACY_TRIAL_ENDS_AT` (`apps/app/src/lib/trial.ts`), in `docs/TRIAL.md`, in den Texten (`datenschutz`, `agb`, `lizenz` in beiden Apps, DE und EN), in der Prüfung `scripts/qa/legal-pages-consistency.test.ts` und in Tests (`trial-period-db.integration.test.ts` prüft `2026-12-15T00:00:00.000Z`, `trial.test.ts`, `trial-reminders.test.ts`, `email.test.ts`, `legal-pages.spec.ts`). **Der Stichtag 15.12.2026 liegt vor dem wahrscheinlichen Cutover.** Bleibt es dabei, endet das Testende der Bestandskonten, bevor das CMS übernimmt; `BLOOMMD_TRIAL_READONLY` ist Standard aus und nur nach Admin-Go einzuschalten, ein Ablauf wäre also nur ein Datenstand, keine Sperre. Trotzdem muss die Änderung auf 60 Tage in der App-Datenbank nachgezogen werden, bevor Texte und Mails ein falsches Datum nennen (kleine Migration `015` und Textänderung, unabhängig von #103). Ob das vor dem Cutover als eigenes Ticket läuft oder im Cutover mit erledigt wird, ist offen (O2).

Der Hinweis-Versand (15, 23 Tage; 30.11., 08.12.) bleibt wie beschlossen hinter dem Admin-Go (`BLOOMMD_TRIAL_REMINDERS_EXISTING`); Mails und Sperre laufen nie gegen Prod im Test (#274). Die Zeitberechnung (`trial.ts`) wandert als reine Funktion mit den Grenzfalltests in das CMS; die App prüft am CMS-Rechte-Stand statt an der eigenen Spalte.

### Missbrauchsschutz

Der Schutz „ein bestätigtes Konto je Postfach“ (#169, kanonische Adresse: `+tag`, Gmail-Punkte, googlemail) gehört zur Benutzer-Collection und wird dort durch einen eindeutigen Index erzwungen (ein **partieller** Index per Hand-Migration in SQL, Payload erzeugt ihn nicht; im Spike gelingt von drei gleichzeitigen Bestätigungen genau eine; Muster: `tests/integration/mailbox-trial-db.integration.test.ts`: Bestätigungen im selben Moment, Löschen gibt das Postfach frei). Die Tests werden gegen die CMS-Datenbank umgesetzt.

## 7. Zahlungsbezug (mit #276)

Stripe bleibt die Quelle. Im CMS stehen je Benutzer nur **Referenzen und Beträge**: Stripe-Kunden-ID, Stripe-Abo-ID, letzte Bezahlung (Datum, Betrag, Währung, Stripe-ID der Zahlung), Rückerstattungen (Datum, Betrag, Stripe-ID). **Nie Karten- oder Bankdaten.** Die App trägt die Daten aus Stripe-Ereignissen über `POST /svc/v1/payment-refs` ein; fällt das CMS aus, hält die App die Ereignisse in einer Warteschlange in ihrer Datenbank und liefert nach (Stripe wiederholt zusätzlich).

**Rückerstattung:** Sie löst die App über Stripe aus (Beschluss). Damit das CMS keine Verbindung zur App braucht, legt ein Betreiber in der Oberfläche einen **Rückerstattungsauftrag** an (Collection `refund_requests`, Rolle `admin`). Die App holt offene Aufträge ab, führt sie gegen Stripe aus und meldet das Ergebnis zurück. So bleibt die Richtung der Aufrufe immer App → CMS (Entwurf, Feinschnitt in #276; ob Vier-Augen-Prinzip nötig ist, ist offen). Bis #276 umgesetzt ist, gibt es im CMS keine Zahlungsdaten (Billing ist aus). Wird Billing aktiv, gelten Aufbewahrung und Löschung der Zahlungsdatensätze (`bloom_subscriptions`, Löschung: Bezug entfällt) aus `docs/LOESCHKONZEPT.md` im CMS genauso.

## 8. Passwörter: neues Passwort für alle Konten

Die PBKDF2-Hashes (`pbkdf2-sha256`, 310 000 Iterationen) sind in Payload nicht importierbar. Deshalb gilt:

1. **Keine Passwörter oder Hashes werden migriert.** Die Konten werden ohne Passwort angelegt (Zustand wie beim vorbereiteten Wartelisten-Konto). Payload verweigert das über `payload.create`; der Import schreibt über `payload.db.create` ohne Hash und Hooks (Kanonische Adresse und Pflichtfelder setzt die Migration selbst), alternativ ein Zufallspasswort (ca. 184 ms je Konto). Anmeldung scheitert danach, Reset funktioniert (Spike, Anhang 2).
2. **Nach der Migration geht eine E-Mail an alle bestätigten Konten** mit einem Link zum Setzen eines neuen Passworts. Unbestätigte Konten und vorbereitete, nie aktivierte Wartelisten-Konten bekommen diese Mail nicht (Letztere bekommen weiterhin ihre eigene Aktivierungs-Mail).
3. **Mail-Versand in Prod erst nach ausdrücklichem Go eines Admins.** Schalter `BLOOMMD_PASSWORD_MIGRATION_MAILS` (Standard `0`, genau `1` oder `0`, `release:check` lehnt anderes ab), Dry-Run als Standard (zählt, sendet nichts, gibt keine Adressen aus), `--apply` und `--limit`, Anspruch vor dem Senden mit Tabelle wie `bloom_trial_reminders` (jede Mail höchstens einmal, Fehlversand wird beim nächsten Lauf wiederholt). Muster: `db:trial-reminders` (`docs/TRIAL.md`). Auf dem Testsystem gehen Mails in das E2E-Outbox oder an `delivered@resend.dev`, nie an echte Adressen.
4. **Mailbudget:** 60 pro Stunde und 300 pro Tag (`lib/mail-budget.ts`) gelten auch hier; Konten ÷ 300 ergibt die Zahl der Tage. Die Zahl der Konten ist offen (O6), das Budget wird nicht stillschweigend angehoben.

### Ablauf aus Sicht der Nutzer

**Die Mail** (DE; EN gleichwertig, Sprache aus dem Konto, Standard DE):

- **Betreff:** „Lege dein neues BloomMD-Passwort fest“
- **Text:** „Hallo, wir haben die Kontoverwaltung von BloomMD umgestellt. Dabei konnten wir dein altes Passwort aus Sicherheitsgründen nicht übernehmen: Wir speichern es nur in einer Form, die sich nicht zurückrechnen lässt. Deine Dokumente, Workspaces und Einstellungen sind unverändert. Bitte lege jetzt ein neues Passwort fest. [Neues Passwort festlegen] Der Link funktioniert einmal und 14 Tage lang. Ist er abgelaufen, wähle auf der Anmeldeseite „Passwort vergessen“, dann bekommst du einen neuen. Wir fragen dich nie per E-Mail nach deinem alten Passwort. Wenn du diese Nachricht nicht erwartet hast, ignoriere sie: Dein Konto bleibt unverändert.“
- Absender wie die übrigen Konto-Mails (`RESEND_FROM_EMAIL`), nur ein Link, nur auf `https://bloommd.app`, kein Anhang, keine Aufforderung zur Eingabe in der Mail. Kein Marketing-Inhalt (Zweck: Konto, siehe Datenschutz, Abschnitt 13).
- **Link:** einmalig, 14 Tage gültig (Vorschlag, wie der Aktivierungs-Link der Warteliste, O6), im CMS nur als Hash gespeichert (**Payload speichert Reset- und Verifizierungs-Token standardmäßig im Klartext, der Verifizierungs-Token hat keinen Ablauf: dafür braucht es eine eigene Token-Collection mit Hash, Zweck und Ablauf**, Anhang 2). Ein bereits benutzter oder abgelaufener Link zeigt eine klare Seite („Dieser Link ist abgelaufen oder wurde schon benutzt“) mit einem Knopf, der einen neuen Link anfordert.

**Die Seite zum Setzen** (`bloommd.app`): Feld für das neue Passwort mit Anzeige-Knopf, `autocomplete="new-password"` (Passwortmanager), die Regeln stehen sichtbar neben dem Feld (mindestens 10 Zeichen, Buchstaben und Zahlen, wie heute; serverseitig im CMS auch beim Zurücksetzen erzwungen, Hook siehe Abschnitt 3, Schicht 4), Rückmeldung beim Tippen statt erst nach dem Absenden, bei Erfolg Anmeldung und Weiterleitung nach `/app` (Annahme A7, O6; ob der Wartelisten-Link heute anmeldet, ist im Code nicht belegt, `activate-account` leitet auf `/activate` weiter). Sprache aus dem Link. Gut bedienbar mit Tastatur und Screenreader (Beschriftungen, Fehlermeldungen an das Feld gebunden); die Oberfläche prüft der tester (`@t103`).

**Verhalten, bis das Passwort gesetzt ist:**

- **Bestehende Sitzungen** bleiben gültig, bis sie ablaufen oder der Rechte-Stand sie beendet (A1). Wer angemeldet ist, wird durch die Umstellung nicht hinausgeworfen.
- **Zugriffstoken, Desktop, Mobile und Agenten** bleiben gültig, sie hängen nicht am Passwort.
- **Neue Anmeldung** mit dem alten Passwort ist nicht möglich. Die Anmeldeseite bekommt einen festen Hinweis (für alle, nie kontoabhängig, damit kein Konto verraten wird): „Seit der Umstellung am TT.MM.JJJJ brauchst du ein neues Passwort. Wähle ‚Passwort vergessen‘ oder nutze den Link in unserer E-Mail.“
- **Passwort-Reset (60 Minuten)** funktioniert ab dem Cutover auch ohne die Mail. Es gibt keine Sperre und keinen Datenverlust.
- **Testzeitraum und Zugang** laufen unverändert weiter; das Warten auf das Passwort verbraucht keine Testzeit zusätzlich (das Testende ist ein fester Wert).
- **Erinnerung:** keine zweite Mail im Standard. Ob nach 7 Tagen eine Erinnerung an Konten ohne gesetztes Passwort geht, ist offen (O6): Mailbudget und Zweck (Datenschutz) sprechen dagegen.

### Lazy-Migration (nur als Alternative)

Die Lazy-Migration der ersten Fassung (alten Hash beim ersten Login prüfen, dann neu hashen) entfällt. Sie hätte den PBKDF2-Prüfer dauerhaft im CMS gehalten, Konten ohne Login hätten den alten Hash unbegrenzt behalten, und Passwort-Hashes zweier Formate liefen in einem System. Vorteil: kein erzwungener Passwortwechsel. Martin hat die Mail an alle Konten beschlossen.

## 9. Vorgehen: alles gemeinsam, im Testsystem, dann Deployment

Beschluss: Oberfläche und Migration werden **gemeinsam** umgesetzt; es gibt **keinen Zwischenstand in Prod**.

1. **Entwicklung** auf Branch und PR, Code für CMS, Schnittstelle, Umbau der App, Migration, Oberfläche. Alle Schalter standardmäßig aus.
2. **Testsystem** mit einem **Abbild der App-Datenbank mit pseudonymisierten Daten** (E-Mail-Adressen werden zu eindeutigen Testadressen, die kanonische Adresse bleibt eindeutig, Namen und Freitexte werden ersetzt, Hashes und Tokens werden verworfen, Benutzer-IDs bleiben erhalten, damit Fremdschlüssel und Zahlen stimmen). Dort: Migration (mehrfach, Idempotenz), Abgleich der Zahlen, alle Oberflächen- und Ablaufprüfungen durch den tester (Passwort-Setzen, Login, Registrierung, Testzeitraum, Löschung, Auskunft, Ausfall des CMS), Restore-Test, Lasttest für Login und Rechte-Stand. Mails nur an das E2E-Outbox.
3. **Deployment** nur nach grünem Testsystem, nur mit Ops-CoS und Go eines Admins.

Das Testabbild enthält trotz Pseudonymisierung personenbezogene Daten, solange die Zuordnung rekonstruierbar ist: Wer erzeugt es, wo liegt es, wie lange, mit welcher Rechtsgrundlage (O8).

## 10. Cutover und Rückweg

**Die App-Datenbank bleibt bis zum Cutover führend.** Bis dahin liest und schreibt die App Benutzer, Zugänge und Anmeldung wie heute; das CMS bekommt höchstens Kopien aus Probeläufen. Ein Wechsel pro Konto oder pro Teil gibt es nicht.

**Vor dem Umstieg (Pflicht, Nachweis im Ticket):**

1. **Restore-Test:** CNPG-Sicherung der App-Datenbank und der CMS-Datenbank wiederherstellen, `scripts/restore-drill.sh` auf beide Datenbanken und den Medienspeicher erweitert, Zeit gemessen. Ohne bestandenen Restore-Test kein Cutover.
2. **Probelauf der Migration** gegen das Testabbild und danach gegen eine Kopie der Prod-Datenbank in einer geschützten Umgebung (nur lesend aus Prod, nur mit Admin-Go).
3. **Rückweg-Probelauf:** Schalter zurück, Abgleich (Abschnitt unten), Dauer gemessen.
4. **Admin-Go** und Absprache mit Ops-CoS für Termin und Fenster.

**Cutover (Wartungsfenster):**

1. App in den Wartungsmodus (Anmeldung und Registrierung ausgesetzt; Dokumente bleiben lesbar und, soweit Sitzungen laufen, bearbeitbar, weil Dokumente und Mitgliedschaften nicht umziehen).
2. Letzte Sicherung der App-Datenbank (CNPG und `pg_dump`), Zeitpunkt festhalten.
3. Migration gegen die Prod-Daten, nur Lesen aus der App-Datenbank, Schreiben in die CMS-Datenbank, idempotent (gleiche Benutzer-ID, Upsert).
4. **Abgleich:** Zahl der Konten (gesamt, bestätigt, vorbereitet, Wartelisten-Herkunft), Zahl und Wert der Zugänge, Testende je Gruppe, Prüfsumme über kanonische E-Mail-Adressen, Stichprobe von Konten, alle Benutzer-IDs der Workspace-Tabellen sind im CMS vorhanden. Abweichung = Abbruch und Rückweg.
5. Umschalten per Schalter (z. B. `BLOOMMD_IDENTITY_PROVIDER=cms`, Standard `app`), Smoke-Test (Passwort setzen mit Testkonto, Login, Rechte-Stand, Löschung eines Testkontos).
6. Maintenance beenden, danach Admin-Go für den Mail-Versand (Abschnitt 8, eigene Freigabe).

**Rückweg:**

- **Bis zum ersten gesetzten Passwort:** Schalter zurück auf `app`. Die App-Tabellen sind unverändert (sie wurden nur gelesen), es geht nichts verloren. Konten, die nach dem Cutover im CMS angelegt oder geändert wurden (Registrierung, Bestätigung), werden mit einem Rückexport übernommen (Skript, im Rückweg-Probelauf getestet).
- **Ab dem ersten gesetzten Passwort:** Der neue Hash lässt sich nicht in das alte Format zurückführen. Ein Rückweg bedeutet dann für diese Konten ein erneutes Setzen des Passworts über den Reset-Weg. Das ist die Grenze ohne Rückkehr ohne Folgen. Deshalb gilt: **Der Mail-Versand folgt erst, wenn der Smoke-Test grün ist, und nicht im selben Atemzug mit dem Umschalten** (O7: Beobachtungsdauer).
- **Aufbewahrung:** Die alten Spalten (`password_hash`, Konto-Spalten) bleiben nach dem Cutover unverändert und werden erst nach einer Frist entfernt (Vorschlag 30 Tage, O7), mit eigener Entscheidung und eigener Migration. Bis dahin gehören sie zur Datensicherung und zur Löschung (Abschnitt 13).
- **Löschungen zwischen Cutover und Rückweg:** werden im Rückexport als Löschaufträge nachgezogen, damit gelöschte Konten nicht wieder auftauchen.

## 11. Aufwand (Neuschätzung)

Die erste Fassung schätzte „Nutzerdaten in Payload“ mit 25 bis 40 Personentagen (Annahme, kein Beleg). Der Beschluss vom 09.11. umfasst deutlich mehr: Admin-App, Schnittstelle, Umbau der App, Migration, Datenschutz, Testsystem, Cutover. **Stand nach dem Spike vom 10.11.2026 (Annahme, kein Beleg, Streuung hoch): 77 bis 122 Personentage (Summe der Zeilen der Tabelle, Annahme A8).** Vorher: 70 bis 109. Begründung je Zeile und treibende Risiken: [Anhang, Abschnitt 5](0001-payload-spike.md#5-o17-aufwand-neu-geschätzt).

| Paket | Personentage |
|---|---|
| `apps/cms` aufsetzen (Workspace, Image **auf Node ≥ 22.23.4**, Release-Check, CI, Doku, Build-Speicher belegen) | 5 bis 8 |
| Rest des Spikes in #204 (erledigt: Auth-Strategie und Lese-Token, siehe Anhang; Stand #204: Produktions-Build und -Start, Inventar-Test als Code und `disablePlaygroundInProduction` erledigt, Oberflächenablauf und zweiter Faktor offen in #206) | 1 bis 2 |
| Datenmodell und Collections (Benutzer, Zugänge, Testzeitraum, Tokens, Betreiber, Audit, eindeutiger Index je Postfach) | 8 bis 12 |
| Schnittstelle `/svc/v1`, Dienst-Authentisierung, OpenAPI, Vertragstests | 8 bis 12 |
| Umbau von `apps/app` (Login, Registrierung, Bestätigung, Reset, Sitzungen, Mobile, Rechte-Stand mit Cache, Testzeitraum-Prüfung, Account, Stripe-Bezug), Referenztabelle | 10 bis 15 |
| Sync und Referenztabelle prüfen (Fremdschlüssel, Kaskaden) | 3 bis 5 |
| Migration (Export, Import, Idempotenz, Abgleich, Rückexport, Passwort-Mail mit Seiten und Texten) | 6 bis 10 |
| Datenschutz (Auskunft, Löschung über zwei Systeme, Löschreihenfolge, Texte, Verzeichnis) | 4 bis 6 |
| Admin-Oberfläche (Benutzerliste, Testzeitraum, Zugänge, Blog, News, Medien, Betreiber, zweiter Faktor) | 8 bis 12 |
| Marketing: Lesepfad mit Token, Cache, Übernahme von Blog und News, Release-Ablauf für News (O12) | 4 bis 7 |
| GitOps und Betrieb (#205: Datenbank, Rolle, Hetzner-S3, External Secrets, NetworkPolicy, wave-Ingress, Monitoring, Backup) | 5 bis 8 |
| Testsystem mit pseudonymisiertem Abbild, Lauf der Tests | 5 bis 8 |
| Cutover, Rückweg, Probeläufe, Doku | 3 bis 5 |
| Tests (Unit, Integration, E2E, Ausfall) in allen Paketen | 7 bis 12 |
| **Summe** | **77 bis 122** |

Eingerechnet ist jetzt ein CMS-Image auf Node statt Bun (der Spike empfiehlt Node, Zeile 1). Nicht eingerechnet: die Rechtsprüfung; der Aufwand von Ops. Die Schätzung bleibt eine Annahme (A8, O17); sie ist nach #204 geprüft und bleibt bei 77 bis 122 ([Anhang, Ergebnis #204](0001-payload-spike.md#ergebnis-204)); nach #206 (Oberfläche, zweiter Faktor) und #205 (Betrieb) erneut zu prüfen.

## 12. Ausfallverhalten und Betrieb

Login und Rechteprüfung hängen am CMS. Das verlangt ein beschriebenes Verhalten und Betriebsziele. Verhalten und Zahlen, die aus dem Beschluss nicht folgen, sind **Annahmen** mit Nummer und stehen in den offenen Entscheidungen (O4).

### Verhalten bei CMS-Ausfall

Die App fragt den Rechte-Stand (`/svc/v1/users/{id}/access`) und cacht ihn je Pod im Speicher (Annahme A3: Gültigkeit 60 Sekunden, bei Fehler veraltet noch bis zu 15 Minuten nutzbar).

| Situation | Verhalten |
|---|---|
| Laufende Sitzung, Rechte-Stand im Cache | unverändert nutzbar bis zum Ende der Gültigkeit; Lesen, Schreiben und Sync laufen weiter, weil Dokumente, Mitgliedschaften und Sync-Tickets in der App liegen |
| Laufende Sitzung, Cache abgelaufen, CMS nicht erreichbar | Degradation (Vorschlag, O4): bis zu 15 Minuten mit dem veralteten Stand weiter, danach nur Lesen und Export; Schreiben, neue Sync-Tickets und Einladungen werden mit `503` und klarer Meldung abgelehnt. Alternative: sofort fail-closed |
| Neue Anmeldung | nicht möglich (`503`, Meldung „Anmeldung vorübergehend nicht möglich, bitte später erneut versuchen“); kein Rückfall auf alte Hashes |
| Registrierung, E-Mail-Bestätigung, Passwort setzen und zurücksetzen | nicht möglich, gleiche Meldung; es gehen keine Mails mit toten Links raus |
| Rechteprüfung für Testzeitraum und Sperre (`proxy.ts`) | mit Cache wie oben; ohne Cache und ohne CMS zählt der veraltete Stand nicht als „Testzeit abgelaufen“: **keine Sperre aus Unwissen** (Annahme A4, O4), Lesen bleibt immer erlaubt |
| Beendete Rechte während des Ausfalls (Entzug, Löschung, Passwortwechsel) | wirken erst nach dem Ende der Gültigkeit des Caches, also bis zu 60 Sekunden bei laufendem CMS, bis zu 15 Minuten bei Ausfall; das ist bewusst, nicht verhindernd, und hier festgehalten |
| Stripe-Ereignisse, Rückerstattungen | Warteschlange in der App, Nachlieferung (Abschnitt 7) |
| Löschauftrag | wird angenommen und wiederholt, bis das CMS antwortet; das Konto gilt als „Löschung angefragt“ (Abschnitt 13) |
| Marketing | liefert gecachte Inhalte; kein Einfluss auf die übrigen Seiten außerhalb von Blog und News |
| Sync-Dienst | unberührt (liest die App-Datenbank) |

Ein Ausfall der **CMS-Datenbank** ist ein CMS-Ausfall. Ein Ausfall der **App-Datenbank** verhält sich wie bisher.

### Betrieb

- **Verfügbarkeit:** mindestens zwei Replikas hinter dem Service, PodDisruptionBudget (Vorschlag, O4), Bereitschaftsprüfung `/svc/v1/health/ready` (Datenbank, Medienspeicher), Start ohne Wartezeit durch Migration im Betrieb; CNPG mit der Hochverfügbarkeit des bestehenden Clusters. Ein Verfügbarkeitsziel (Anteil, Ausfallzeit je Monat) ist nicht beschlossen; **Vorschlag:** gleiches Ziel wie die App, weil Anmeldung daran hängt (O4).
- **Updates:** Payload-Updates über Renovate oder Dependabot, Sicherheitsfixes zeitnah (Vorschlag: Ziel 14 Tage, O4), Minor-Versionen im Testsystem zuerst, Major-Versionen mit eigener Prüfung; Migrationen der Payload-CLI vorwärts, immer mit vorheriger Sicherung und in zwei Schritten (erst erweitern, später aufräumen), damit das laufende Image der alten Version die Datenbank noch liest. Ablauf wie ein Release: SemVer, CI, Testsystem, Deployment mit Go von Ops.
- **Monitoring:** `/svc/v1/health/ready`, Fehlerrate und Latenz (p95) je Endpunkt, Erfolgsquote der Anmeldung, Zahl der Antworten aus dem Cache bei Fehlern (veraltet ausgeliefert), Alter der letzten Sicherung, Datenbankverbindungen, Fehler des Medienspeichers, Warteschlange der Stripe-Ereignisse und der Löschaufträge. Alarme für anhaltende Fehlerrate, Ausfall der Anmeldung und ausbleibende Sicherung. Sentry wie in der App (ohne personenbezogene Inhalte in Fehlermeldungen).
- **Backup:** CNPG-Sicherung der CMS-Datenbank mit Wiederherstellung zu einem Zeitpunkt (Point-in-Time, Zeitraum und Aufbewahrung offen, O10), `pg_dump`-Probe je Datenbank, Medienspeicher mit Versionierung und eigener Sicherung, Restore-Test vor dem Cutover und danach regelmäßig (Vorschlag: vierteljährlich, O10). Wiederherstellungsziele (Datenverlust, Zeit) sind nicht beschlossen (O10).
- **Zugriff und Audit:** Zugriffe der Betreiber auf Benutzerdaten werden im Audit des CMS festgehalten (wer, was, wann; ohne Inhalte der Daten).

## 13. DSGVO

Auskunft und Löschung laufen über **Payload und App-Postgres** (Beschluss). Verantwortlich für den Ablauf bleibt `apps/app` (`GET /api/account/export`, `POST /api/account/delete`), das CMS liefert und löscht seinen Teil über die Schnittstelle.

**Auskunft (`/api/account/export`):** Die App stellt den Export aus beiden Quellen zusammen: eigene Daten (Workspaces, Dokumente, Mitgliedschaften, Sitzungen, Token ohne Geheimnisse, Audit) und `GET /svc/v1/users/{id}/export` (Konto, Sprache, Bestätigung, Zugänge, Testzeitraum, Zahlungsbezug, Herkunft). Fällt das CMS aus, antwortet die App nicht mit einem unvollständigen Export, sondern mit `503` und der Bitte, es später zu versuchen. Der Export bleibt auch nach Ablauf des Testzeitraums möglich (Beschluss 04.11.).

**Löschung (`/api/account/delete`), Reihenfolge (Vorschlag, O5 Teil):**

1. Passwort und E-Mail-Adresse bestätigen, wie heute.
2. App legt den Löschauftrag mit Schlüssel an; das CMS setzt das Konto auf „Löschung angefragt“ (keine Anmeldung, keine Mails mehr). Das ist die Stelle, an der ein Teilausfall sicher ist: Das Konto ist gesperrt, bevor irgendetwas verschwindet.
3. Laufende Stripe-Abos kündigen (wie heute).
4. App-Daten löschen (`deleteAccountData`: Sitzungen, Tokens, Workspaces und Dokumente, Agenten, Mitgliedschaften mit der bestehenden Behandlung von Team-Workspaces).
5. CMS löscht das Konto, die Zugänge, Tokens und Zahlungsreferenzen und meldet den Abschluss; die Referenzzeile in der App wird zuletzt entfernt.
6. Fällt ein Schritt aus, wird er wiederholt (idempotent); der Auftrag bleibt sichtbar offen, Ops sieht ihn im Monitoring. Wiederholungen bleiben im Audit (365 Tage, `docs/LOESCHKONZEPT.md`).

**Was weiter besteht (wie heute, erweitert):** Audit-Ereignisse ohne Bezug zum Konto, Zahlungsdatensätze mit geschwärztem Rohinhalt und entferntem Bezug. Bleibt die Referenzzeile in der App oder die alte Spalte nach dem Cutover (Abschnitt 10), gehört sie zur Löschung. Datensicherungen enthalten gelöschte Daten bis zum Ablauf ihrer Aufbewahrung; dazu gibt es keine Entscheidung (`docs/LOESCHKONZEPT.md`, Punkt 6.9, O10).

**Verzeichnis der Verarbeitungstätigkeiten:** neu aufzunehmen oder anzupassen: Benutzerverwaltung im CMS (Zweck, Daten: E-Mail, Sprache, Bestätigung, Zugang, Testzeitraum, Zahlungsreferenzen; Empfänger; Frist; Löschung), Betreiberkonten (Name, E-Mail, Rolle, Audit), Hinweis- und Passwort-Mails, Medien im Hetzner-Speicher, Testsystem mit pseudonymisiertem Abbild (O8).

**Datenschutzerklärung:** anzupassen in beiden Apps (`apps/app/src/app/datenschutz`, `apps/marketing/src/app/datenschutz`, DE und EN, geprüft von `scripts/qa/legal-pages-consistency.test.ts`): Verarbeitung der Konten im CMS, Betreiberzugriff, Hosting und Auftragsverarbeiter (Hetzner Objektspeicher, Standort, Vertrag nach Art. 28; offen laut `docs/LOESCHKONZEPT.md`, Punkt 6.7 und 6.8), Mails zum Passwort, Fristen (Tokens, Testzeitraum, Löschreihenfolge). Rechtsprüfung und Freigabe liegen bei den Admins.

**Betreiberkonten:** personenbezogene Daten der Bearbeiter; Löschung beim Ausscheiden, Frist und Audit in #206.

## Verworfene Optionen

| Option | Warum verworfen |
|---|---|
| V1: Payload nur für Inhalte, Benutzer und Zugänge in der App (alte Empfehlung vom 02.11.) | Martin hat am 09.11. entschieden, dass Zugänge und Benutzer nach Payload wandern (V2). |
| Lesen ohne Token (Option L) | Martin hat am 09.11. Option T mit lesendem Token beschlossen. |
| Export nach Git bei jeder Veröffentlichung (Option E) | Bleibt nur als Notausgang (Markdown-Export); als Regelweg zu langsam und mit Schreib-Token auf das Repo. |
| Einbetten in `apps/app` oder `apps/marketing` | Beschlossen ist eine getrennte Admin-App; Einbetten verletzt den App-Split und legt die Schnittstelle in einen öffentlichen Prozess. |
| Lazy-Migration der Passwörter | Siehe Abschnitt 8: dauerhafter alter Prüfer, Konten ohne Login behalten den alten Hash; beschlossen ist die Mail an alle Konten. |

## Folgen

- **Neu:** Ein dritter auslieferbarer Dienst, der für **Anmeldung und Rechte der gesamten Cloud** zuständig ist. Das CMS wird zum Dienst mit der höchsten Verfügbarkeitsanforderung der Plattform, neben der App-Datenbank.
- **Kopplung:** Anmeldung, Registrierung, Rechteprüfung und Testzeitraum hängen am CMS. Das Verhalten bei Ausfall ist Annahme A3/A4 und muss vor dem Cutover im Testsystem gezeigt werden (Ausfallprüfung des testers).
- **Sicherheit:** Die Konten und ihre Passwörter liegen im CMS. Die Sicherheitsgrenze besteht aus Netzwerk (kein öffentlicher Zugang), Dienst-Authentisierung, Payload-Konfiguration, zweitem Faktor für Betreiber und Inventar-Test. Eine Fehlkonfiguration von NetworkPolicy oder wave-Ingress hebt die erste Schicht auf; ein automatischer Test ist Pflicht.
- **Migration:** Alle Konten müssen ein neues Passwort setzen. Das ist eine spürbare Last für Nutzer und für Support; die Mail und die Seite sind deshalb Teil des Umfangs (Abschnitt 8).
- **Datenschutz:** Zwei Systeme für Auskunft und Löschung, neue Fristen, neues Verzeichnis, angepasste Erklärung.
- **Eigenbau und Pflege (Spike):** Token-Collection mit Hash, Rate-Limit mit geteiltem Zähler, Signatur mit geteiltem Nonce-Speicher, Wächter vor `/api` und Passwort-Hook beim Reset sind eigener Code an der Anmeldung der ganzen Cloud. Payload koppelt Next (`>=16.3.3 <17`) und Node (`^22.23.4`) eng und veröffentlicht im Wochentakt; das Ziel „Sicherheitsfixes in 14 Tagen“ (O4) heißt laufende gemeinsame Pflege von Payload, Next und Node-Pin. **Aufgabe für #204 (nicht Teil von #103):** `.nvmrc` (22.22.2) auf eine Version ≥ 22.23.4 anheben und das CMS-Image auf Node bauen ([Anhang](0001-payload-spike.md#1-version-und-laufzeit-todo-1)).
- **Inhalte verlassen Git** (Blog, News): Reviews per Pull Request entfallen, Historie liegt im CMS (Versionen in Payload sind zu prüfen); der Markdown-Export ist der Rückweg.
- **Regeln:** `AGENTS.md` (Abschnitt „Web App Split“: Secret-Regel mit der Ausnahme des Lese-Tokens, dritter Dienst) und `docs/ARCHITECTURE.md` (Paketliste, Sicherheitsgrenze, Anmeldung) werden mit #204 angepasst; `bun run docs:verify` prüft die Paketliste gegen die Workspaces und schlägt sonst an. `docs/TRIAL.md` und `docs/LOESCHKONZEPT.md` folgen dem Cutover.

## Entscheidungen Martin 09.11.

Stand: **beschlossen** (Kommentar im Ticket #103, 09.11.2026, Brand-Thread). Sie ersetzen die offenen Entscheidungen 1 bis 10 der ersten Fassung.

| Nr. | Entscheidung | Stand | Abschnitt |
|---|---|---|---|
| 1 | Admin-App: getrennte App auf Basis von Payload headless; nur im wave-mesh als Service erreichbar, für Admins über den wave-Ingress. Keine öffentliche API | beschlossen | 2, 3 |
| 2 | Lesezugriff Marketing mit lesendem Token (Option T); Regel „keine App-Secrets in Marketing“ in `AGENTS.md` und `production-config.ts` entsprechend anpassen; Token nur über 1Password und External Secrets | beschlossen | 4 |
| 3 | Inhalte und Funktionen: Blog, News, Benutzerliste, Testzeitraum. Letzte Bezahlung und Rückerstattung mit #276, dann bei den Benutzern in Payload; Stripe bleibt Quelle, nur Referenzen und Beträge, nie Karten- oder Bankdaten; Rückerstattung löst die App über Stripe aus | beschlossen | 1, 7 |
| 4 | Admin-Login: Betreiberkonten in Payload | beschlossen | 2, 3 |
| 5 | Medien: S3-Speicher bei Hetzner | beschlossen | 2 |
| 6 | Datenbank: gleicher CNPG-Cluster, eigene Datenbank und Rolle ohne Rechte auf die App-Datenbank | beschlossen | 2 |
| 7 | Warteliste wird in Nutzerkonten der App überführt. Testzeitraum Standard 30 Tage (anpassbar), Teilnehmer der Beta 60 Tage; Beschluss vom 04.11. (#215/#271/#274) abgleichen | beschlossen, Abgleich in Abschnitt 6, Einzelheiten offen (O2) | 6 |
| 8 | Zugänge und Benutzer wandern nach Payload (V2), nur über dedizierte API (intern im Mesh) angebunden; Gegenstück zu Stufe 4 begründen | beschlossen | 3, 5 |
| 9 | Vorgehen: alles gemeinsam umsetzen (Oberfläche, Migration), dann im Testsystem testen (pseudonymisiertes Abbild), dann Deployment; kein Zwischenstand in Prod | beschlossen | 9 |
| 10 | Secret-Regel wie Punkt 2 | beschlossen | 4 |
| 11 | Passwörter: PBKDF2-Hashes nicht importierbar; Mail an alle Konten mit Link zum Setzen eines neuen Passworts; Mail-Versand in Prod erst nach ausdrücklichem Go eines Admins | beschlossen | 8 |
| 12 | Die App-Datenbank bleibt bis zum Cutover führend; Restore-Test und Rückweg vor dem Umstieg | beschlossen | 10 |
| 13 | Login und Rechteprüfung hängen am CMS; Ausfallverhalten und Betrieb beschreiben | beschlossen, Beschreibung in Abschnitt 12, Zahlen offen (O4, O10) | 12 |
| 14 | DSGVO: Auskunft und Löschung über Payload und App-Postgres, Löschreihenfolge, Verzeichnis der Verarbeitungstätigkeiten, Datenschutzerklärung | beschlossen | 13 |
| 15 | Aufwand in der ADR neu schätzen | erledigt, Abschnitt 11: 70 bis 109 Personentage (Annahme A8, O17); nach dem Spike vom 10.11.: 77 bis 122 | 11 |
| 16 | Rollout in Prod nur mit Ops-CoS und Go eines Admins | beschlossen | 9, 10 |

## Entscheidung Martin 10.11.

Stand: **beschlossen** (Kommentar im Ticket #203, 10.11.2026, 09:03 UTC, über den Chief of Staff).

- ADR #220 ist freigegeben und gemergt (PR #220, 793aa08). Die Umsetzung startet jetzt.
- O1: Die Umsetzung läuft jetzt, keine Zurückstellung.
- O3 bis O19: Die Empfehlungen der ADR gelten, weil Martin die ADR so freigegeben hat.
- O2: Die Details (wer zählt als Beta, Start 15.11., Zeitpunkt der Hinweise) werden nach der ADR-Empfehlung ausgearbeitet und im O2-Ticket zur Abnahme vorgelegt. Dort entscheiden Martin und Max.
- O15 (Mesh, mTLS, Pfadregeln) und O8 (Testabbild) sind Fragen an Ops. Sie gehen über den Chief of Staff und bleiben bis zur Antwort offen.

## Offene Entscheidungen

Jede Zeile ist eine Entscheidung, die nicht aus dem Beschluss vom 09.11. folgt. Seit der Entscheidung Martin vom 10.11. ist die Empfehlung die gültige Vorgabe. Ausnahmen sind O2 (Details werden im O2-Ticket zur Abnahme vorgelegt), O15 und O8 (Antwort von Ops steht aus) und O10 (von Admins und Ops festzulegen). „Annahme“ (A1 bis A8) verweist auf eine Stelle im Text, an der diese Entscheidung bis zur Klärung unterstellt ist; jede Annahme hat hier einen Eintrag. „Vorschlag“ im Text meint eine Empfehlung, die ebenfalls hier steht.

| Nr. | Frage | Empfehlung |
|---|---|---|
| O1 | **Priorität und Kapazität.** Der Entscheid vom 30.10. gibt den Stufen 1 bis 3 Vorrang vor allem Neuen; der Beschluss vom 09.11. regelt nur die Reihenfolge innerhalb von #103. Läuft #103 hinter, neben oder vor den Stufen 1 bis 3, oder wird #103 bis Stufe 4 ganz zurückgestellt (Alternative A der ersten Fassung: kein Risiko, aber Blog und Anmeldung bleiben, wie sie sind)? Und: Wird Stufe 4 vor dem Cutover beschlossen oder dürfen beide Entscheidungen aneinander vorbeigehen (Risiko Abschnitt 5)? | #204 bis #207 hinter Stufen 1 bis 3 einreihen; Rechte-Grenze mit Stufe 4 vor dem Cutover prüfen. **Stand 10.11.:** Umsetzung läuft jetzt, nicht zurückgestellt |
| O2 | **Beta-Teilnehmer 60 Tage.** Wer zählt als „Teilnehmer der Beta“: alle Bestandskonten (`trial_legacy`, inklusive früherer Wartelisten-Konten)? Bleibt der Start 15.11.2026, damit das Testende 14.01.2027 ist? Wann gehen die Hinweise (30.11. und 08.12. vom 04.11., oder Tag 45 und 53)? Wann wird die Änderung in der App-Datenbank nachgezogen (eigenes Ticket vor dem Cutover, Migration `015`, Texte, Tests; Abschnitt 6)? Wer darf den „anpassbaren“ Standard ändern (globaler Wert im CMS, Überschreibung je Konto durch die Rolle `admin`, mit Audit)? | alle Bestandskonten, Start 15.11.2026, Ende 14.01.2027; Änderung sofort als eigenes Ticket nachziehen; globaler Wert plus Überschreibung je Konto, Audit |
| O3 | **Abgrenzung der Datenhaltung.** Annahme A1 (Sitzungen, Zugriffs- und Agent-Tokens bleiben in der App-Datenbank, abgeleitet vom Rechte-Stand) und A2 (`bloom_users` bleibt als Referenztabelle ohne personenbezogene Daten für Fremdschlüssel und Kaskaden). | A1 und A2 bestätigen |
| O4 | **Ausfallverhalten.** Annahme A3 (Cache 60 Sekunden, bei Fehler bis zu 15 Minuten veraltet) und A4 (keine Sperre aus Unwissen, danach nur Lesen und Export). Sind das die gewollten Werte, oder ist sofort fail-closed gewollt? Verfügbarkeitsziel, Zahl der Replikas (Vorschlag: mindestens zwei) und Update-Ziel für Sicherheitsfixes (Vorschlag: 14 Tage) des CMS? | A3 und A4 bestätigen; Verfügbarkeitsziel wie die App |
| O5 | **Mail-Versand und Löschreihenfolge.** Wer versendet die Mails zu Bestätigung, Passwort und Hinweisen: weiter die App (Texte, Mailbudget und Resend-Zugang bleiben dort, das CMS gibt den Einmal-Token zurück) oder das CMS (braucht Resend-Zugang und Budget im CMS)? Ist die Löschreihenfolge aus Abschnitt 13 gewollt? | App versendet; Löschreihenfolge wie beschrieben |
| O6 | **Passwort-Mail.** Anzahl der Konten (bestätigt) und Dauer des Versands bei 300 Mails pro Tag; Anhebung des Budgets nötig? Link-Gültigkeit 14 Tage und Wortlaut der Mail (Abschnitt 8); Erinnerung nach 7 Tagen ja oder nein? | Zahl ermitteln; 14 Tage; keine Erinnerung |
| O7 | **Cutover.** Dauer des Wartungsfensters; Beobachtungsdauer zwischen Umschalten und Mail-Go (Abschnitt 10); Aufbewahrung der alten Spalten (Vorschlag 30 Tage). Termin gegenüber dem Stichtag 15.12.2026. | Fenster klein halten, Beobachtung mindestens ein Werktag, 30 Tage Aufbewahrung |
| O8 | **Testabbild mit pseudonymisierten Daten.** Wer erzeugt es, wo liegt es, wie lange, Rechtsgrundlage und Eintrag im Verzeichnis; Pseudonymisierung ist rekonstruierbar, solange der Schlüssel existiert. | Erzeugung durch Ops im Cluster, Schlüssel nicht im Testsystem, Löschung nach dem Cutover |
| O9 | **Admin-Zugang.** Zweiter Faktor für Betreiber verpflichtend; Schutz am wave-Ingress zusätzlich (z. B. VPN oder Anmeldung davor); Rollen `admin`, `support`, `editor` (Vorschlag aus Abschnitt 2). **Stand Spike:** kein nativer zweiter Faktor; Community-Plugin `payload-totp` lädt mit 3.93.0, Oberflächenablauf ungeprüft ([Anhang, Abschnitt 2](0001-payload-spike.md#2-o14-auth-für-endnutzer)). | zweiter Faktor Pflicht (Plugin oder Eigenbau, in #206 nach Test der Oberfläche entscheiden), Rollen wie vorgeschlagen, Ingress-Schutz von Ops bestätigen |
| O10 | **Betriebsziele und Datenschutz.** Wiederherstellungsziele (Datenverlust und Zeit), Aufbewahrung der Sicherungen, Auftragsverarbeitung und Standort Hetzner, Löschfrist der Betreiberkonten, Löschung abgelaufener Testaccounts (`docs/LOESCHKONZEPT.md`, Punkte 6.5, 6.7 bis 6.9). | von Admins und Ops festzulegen; keine Annahme im ADR |
| O11 | **Auslieferung der Medien.** Öffentlich lesbares Präfix im Hetzner-Bucket (eigene Domain, kein CMS im Pfad) oder Auslieferung über Marketing (braucht Lesezugang zum Bucket in Marketing)? | öffentlich lesbares Präfix nur für veröffentlichte Medien, Schreibrechte nur im CMS |
| O12 | **Weg für News.** `marketing-news-draft.yml` läuft in GitHub Actions und erreicht das nur im Mesh liegende CMS nicht. Entwurf aus dem Release über (a) einen Job im Cluster, (b) weiter als Markdown-Pull-Request und manuelle Übernahme oder (c) Abruf der Release-Notes durch das CMS? **Stand Spike:** (c) ist machbar (Task der Job-Queue holte ein Release und legte einen Entwurf an); braucht Egress zu GitHub, ein lesendes Token und die Wahl des Replikas für `autoRun` ([Anhang, Abschnitt 4](0001-payload-spike.md#4-o12-weg-für-news)). | (c), sonst (a) (braucht einen schreibenden `/svc/v1`-Endpunkt); Egress in #205 mit Ops klären, in #204/#206 festlegen |
| O13 | **Zahlung (#276).** Ob Rückerstattungen ein Vier-Augen-Prinzip brauchen; Zeitpunkt und Zuschnitt des Datenmodells. | in #276 klären |
| O14 | **Payload als Auth für Endnutzer.** Trägt die gewählte Payload-Version Passwort-Regel, Sperren, Rate-Limit und Mobile-Login mit PKCE, oder braucht es eigene Strategie? Spike als Erstes in #204 (Abschnitt 11). **Stand Spike (10.11.):** trägt mit Hooks und Eigenbau an vier Stellen (Passwort-Regel auch beim Reset, Token als Hash mit Ablauf, partieller Postfach-Index per SQL-Migration, Rate-Limit); Sperre, Reset-Token (zurückgeben, 14 Tage, einmalig) und Sitzungswiderruf gehen nativ; PKCE bleibt in der App (A1); zweiter Faktor siehe O9 ([Anhang, Abschnitt 2](0001-payload-spike.md#2-o14-auth-für-endnutzer)). | Auth über Payload mit den vier Eigenbau-Stellen; PKCE und Sitzungen in der App; Spike erledigt |
| O15 | **Mesh und Ingress (Annahme A5).** Kann das wave-mesh (a) mTLS oder eine Workload-Identität zwischen den Pods, (b) Pfadregeln auf Schicht 7, sodass App und Marketing nur `/svc/v1` erreichen und nie `/api` oder `/admin`, und (c) kann der wave-Ingress für Admins auf `/admin` und den Pfad der Oberfläche begrenzt werden? Frage an Ops. Fehlt (b), gilt allein die Prüfung im CMS (Schicht 3 und 4), und der Inventar-Test wird zur wichtigsten Schicht. | Ops klärt vor #205; ohne (b) Dienst-Authentisierung und Inventar-Test als Pflicht |
| O16 | **Token auf `/svc/v1` (Annahme A6).** Dienstseitig geprüftes, undurchsichtiges Lese-Token statt Payload-API-Schlüssel (Abschnitt 3); setzt voraus, dass `/svc/v1` als eigene Routen von `apps/cms` neben `/api` laufen kann. Spike in #204. Alternative: Payload-API-Schlüssel mit Zugriffsfunktionen, die nur Blog und News (veröffentlicht) lesen lassen; dann gilt das Token auch auf `/api` und die Pfadregel aus Schicht 2 trägt allein. **Stand Spike (10.11.):** Option T bestätigt (Aufwand 0,5 bis 1 Personentag); `/svc/v1` neben `/api` geht; `/api` braucht einen Wächter und die Route-Dateien für GraphQL und Playground müssen gelöscht werden; die Alternative (API-Schlüssel) funktioniert, liegt verschlüsselt statt als Hash und öffnet `/api` ([Anhang, Abschnitt 3](0001-payload-spike.md#3-o16-svcv1-und-token)). | dienstseitiges Token (Option T) bleibt; API-Schlüssel nur als Rückfall mit Pfadregel im Mesh (O15) |
| O17 | **Aufwand (Annahme A8).** Die ursprünglichen 70 bis 109 Personentage waren eine Schätzung ohne Beleg; nach dem Spike (O14) zu erneuern und die Priorität (O1) darauf abzustimmen. **Stand Spike (10.11.):** neu 77 bis 122 Personentage, weiter Annahme ([Anhang, Abschnitt 5](0001-payload-spike.md#5-o17-aufwand-neu-geschätzt)); größte Treiber: Produktions-Build und Speicher, enge Next-/Node-Kopplung, Eigenbau an sicherheitskritischen Stellen, zweiter Faktor, O15. | Priorität (O1) auf 77 bis 122 abstimmen; **nach #204 bestätigt** ([Anhang, Ergebnis #204](0001-payload-spike.md#ergebnis-204)), nach #206 und #205 erneut prüfen |
| O18 | **Anmeldung nach dem Setzen des Passworts (Annahme A7).** Meldet die Seite zum Setzen nach Erfolg sofort an und leitet nach `/app` weiter, oder führt sie auf die Anmeldeseite? | sofort anmelden, nach Prüfung des Wartelisten-Verhaltens |
| O19 | **Auslieferung der Folgetickets.** Alle Teile gehen gemeinsam nach Prod (Beschluss 9). Dürfen einzelne Teile vorher hinter Schaltern (Standard aus) in `main` landen, oder bleibt alles bis zum gemeinsamen Release auf einem Branch? | hinter Schaltern in `main`, Auslieferung gemeinsam |

## Folgeschritte (nur Verweise, keine Umsetzung)

Die Folgetickets #204 bis #207 sind laut Beschluss neu zuzuschneiden (Epic #196); das tut der architect im Ticket. Vorschlag für den Zuschnitt. „neu-1“ bis „neu-4“ und „Folgeticket O2“ sind Arbeitstitel; die Nummern vergibt der Chief of Staff.

| Ticket | Titel | Inhalt | Abhängigkeiten | Abnahme |
|---|---|---|---|---|
| Folgeticket O2 | Testzeitraum der Bestandskonten auf 60 Tage nachziehen | Migration `015` (Testende 14.01.2027 vorbehaltlich O2), `trial.ts`, `docs/TRIAL.md`, Texte in beiden Apps (DE/EN), Hinweis-Termine, Tests (`trial-period-db`, `trial.test.ts`, `legal-pages`). Unabhängig von Payload | Entscheidung O2; baut auf #274 (Mechanik), #271 (Texte), #215 (Beschluss 04.11.); Beteiligte der Warteliste aus #104/#105; vor dem Cutover und vor dem Stichtag 15.12.2026 | Texte, Mails und Datenstand nennen dieselbe Dauer; `legal-pages-consistency` und Integrationstests grün; kein Versand ohne Admin-Go |
| #204 | Admin-App `apps/cms` aufsetzen, Spike und Schnittstelle `/svc/v1` | Workspace, Image, Release-Check, Spike der Auth-Strategie und des Lese-Tokens (O14, O16; Ergebnis im Anhang, Rest: Produktions-Build, Inventar-Test als Code, Oberfläche), Node-Image und Anhebung von `.nvmrc` (22.22.2 liegt unter Payloads Engine), Collections (Benutzer, Zugänge, Testzeitraum, Tokens, Betreiber, Blog, News), `/svc/v1` mit OpenAPI und Vertragstests, Secret-Regel in `AGENTS.md` und `production-config.ts`, `ARCHITECTURE.md` | ADR angenommen (Martin, 10.11.2026, PR #220), O1 (Umsetzung läuft); Collections bilden #104 (Registrierung, Postfach-Schutz #169), #105 (Wartelisten-Konten) und #274 (Testzeitraum) ab; erster Schritt des Zuschnitts | Inventar-Test und Vertragstests grün, `docs:verify` grün, Spike mit Ergebnis im Ticket (Aufwand O17 erneuert) |
| #205 | GitOps für das CMS in `bloommd-cluster` | Deployment, ClusterIP-Service, NetworkPolicy, wave-Ingress, CNPG-Datenbank und Rolle ohne Recht auf die App-Datenbank, Hetzner-S3, External Secrets (Schlüssel, Lese-Token), Monitoring, Testsystem mit Platz für das Abbild | #204 (Image) und Antwort von Ops auf O15; läuft parallel zu #204 und neu-1 | Von außen unerreichbar; aus dem App-Pod nur `/svc/v1`; aus dem Marketing-Pod nur Inhalte lesbar; Smoke-Test automatisiert |
| neu-1 | `apps/app` auf die Identität des CMS umbauen | Anmeldung, Registrierung, Bestätigung, Reset, Rechte-Stand mit Cache (A3/A4), Sitzungen (A1), Referenztabelle (A2), Testzeitraum-Prüfung in `proxy.ts`, Auskunft und Löschung über zwei Systeme, Schalter `BLOOMMD_IDENTITY_PROVIDER` | #204; erhält das Verhalten von #104 (offene Registrierung, Postfach-Schutz), #105 (Wartelisten-Konten und Aktivierung), #274 (Hinweis-Mails, Sperre hinter Schalter) und die Texte aus #271 unverändert; Entscheidungen O3, O4, O5 | Ausfallprüfung nach Abschnitt 12 im Testsystem; bestehende Tests zu Trial, Mailbox und Waitlist laufen gegen die Schnittstelle grün |
| neu-2 | Marketing liest Blog und News aus dem CMS | Lesepfad mit Token und Revalidierung, Übernahme von Blog und News aus Markdown, Weg für News (O12), Export nach Markdown als Rückweg, Secret-Regel in Marketing | #204 (Endpunkt und Token-Prüfung), #205 (Secret, Netz), O11, O12, O16 | Ein Admin legt einen Beitrag an, er erscheint auf bloommd.io; bei CMS-Ausfall liefert Marketing den Cache; `release:check` lehnt andere Secrets weiter ab |
| #206 | Admin-Oberfläche und Betreiberkonten | Benutzerliste, Testzeitraum und Zugänge pflegen, Blog, News, Medien, Betreiber mit zweitem Faktor und Rollen (O9), Anpassung des Standards (O2), Datenschutzerklärung und Verzeichnis | #204; Testzeitraum und Zugänge setzen neu-1 voraus; Wortlaut folgt #271 und dem Folgeticket O2 | Ein Betreiber ändert den Testzeitraum eines Kontos, der Wert gilt in der App; ein Admin legt einen Inhalt an |
| neu-3 | Migration, Testsystem-Abbild und Passwort-Mail | Export, Import, Abgleich, Rückexport, Pseudonymisierung des Abbilds (O8), Schalter `BLOOMMD_PASSWORD_MIGRATION_MAILS`, Seiten und Texte zum Setzen des Passworts (Abschnitt 8), Wartelisten-Konten ohne Mail | #204, neu-1, #205 (Testsystem); übernimmt Konten aus #104/#105, Testende und Dauer aus #274/#215 (Wert nach Folgeticket O2); O2, O6, O8, O18 | Migration idempotent, Abgleich grün, Mails nur im Outbox, alle Prüfungen des testers im Testsystem grün |
| neu-4 | Zahlungsbezug und Rückerstattungsaufträge im CMS | Collections für Referenzen und Beträge, `payment-refs`, `refund-requests`, Worker in der App, Anpassung der Löschung | #276 (Zahlung selbst), #215 (Beschluss zur Bezahlung), #204, neu-1; Billing ist aus, bis #276 steht; ist #276 vor dem Cutover produktiv, gehört das Ticket zum Cutover, sonst folgt es danach (O13) | Stripe bleibt Quelle, nie Karten- oder Bankdaten; Rückerstattung läuft über die App und Stripe |
| #207 | Backup, Restore, Cutover und Rückweg, Prod-Go | Restore-Test beider Datenbanken und der Medien (`restore-drill.sh` erweitert), Rückweg-Probelauf, Cutover-Plan, Markdown-Export, Monitoring-Abnahme, Go für Prod | alle anderen Tickets (#204, #205, #206, neu-1 bis neu-3, Folgeticket O2; neu-4 je nach #276); O7, O10; Prod-Go nur mit Ops-CoS und Admin | Restore-Test und Rückweg-Probelauf bestanden, Log im Ticket; Prod-Go dokumentiert |

**Reihenfolge:** 1. Folgeticket O2 (unabhängig, früh) und #204 mit dem Spike. 2. #205 parallel zu #204 und neu-1. 3. neu-1, neu-2, #206, danach neu-3 (braucht #205 und das Testsystem). 4. neu-4, sobald #276 steht. 5. #207 zuletzt. Alle Teile gehen zusammen nach Prod (Beschluss 9, O19). Stand 10.11.2026: Die ADR ist freigegeben, die Umsetzung läuft. Die Nummern der neuen Tickets vergibt der Chief of Staff; das steht noch aus. Rollout in Prod nur mit Ops-CoS und Go eines Admins.
