# ADR 0001, Anhang: Ergebnis des Payload-Spikes (O14, O16, O17, O12)

- **Ticket:** #103 (Epic #196, erster Schritt von #204). **Datum der Prüfung:** 2026-11-10.
- **Gehört zu:** [ADR 0001](0001-payload-cms.md), Abschnitte 3, 5, 8, 11 und offene Punkte O12, O14, O16, O17.
- **Art:** Ergebnis eines Wegwerf-Prototyps. Der Prototyp liegt außerhalb des Repos und ist nicht eingecheckt. Belege sind Befehle und gekürzte Ausgaben in diesem Dokument. Es gibt keinen Produktivcode, keine Änderung an `apps/app`, `apps/marketing` oder Prod.
- **Wichtigster Vorbehalt:** Es lief **kein Produktions-Build** (`next build`) und **kein Browser-Test** der Admin-Oberfläche. Der Pod hat 4 GiB Speicher, und die Payload-Vorlage setzt für den Build `--max-old-space-size=8000`. Beides gehört in #204 (CI) und zum tester (#206). Was nur im Dev-Modus belegt ist, steht an der Stelle.

## Ergebnis in Kürze

| Frage | Antwort |
|---|---|
| Payload-Version | **3.93.0** (npm `latest`, geprüft 2026-11-10, veröffentlicht 2026-11-04) |
| Läuft Payload auf Bun? | Die **Local API und `/svc/v1`-Handler laufen unter Bun**. `next dev` unter Bun nur mit `--webpack`; mit Turbopack Fehler 500. Produktions-Build unter Bun **nicht geprüft**. **Empfehlung: CMS-Image mit Node ≥ 22.23.4** (Installation mit `bun install` geht) |
| Passt zum Repo? | Next 16.4.2 und React 19.2.8 passen. **`.nvmrc` 22.22.2 liegt unter Payloads Engine `^22.23.4 \|\| >=24.22.1`** und muss angehoben werden |
| O14 (Auth für Endnutzer) | Trägt, aber nur **mit Hooks und Eigenbau** an vier Stellen: Passwort-Regel (auch beim Reset), Token als Hash mit Ablauf, partieller Eindeutigkeitsindex, Rate-Limit. Sperre, Reset-Token, Sitzungen und Widerruf gehen nativ. **Kein zweiter Faktor nativ**, nur Community-Plugin |
| O16 (`/svc/v1`, Token) | **Machbar.** `/svc/v1` als Next-Route-Handler neben `/api`. Option T funktioniert. `/api` lässt sich per Wächter sperren. **`graphQL.disable` allein reicht nicht**: der Playground antwortete trotzdem, erst das Löschen der Route-Dateien sperrt ihn |
| O12 (News) | Das CMS kann Release-Notes selbst abrufen (c): als Job der Payload-Queue belegt. Braucht Egress zu GitHub und ein Token |
| O17 (Aufwand) | **77 bis 122 Personentage** (vorher 70 bis 109), weiterhin Annahme |

## Prüfumgebung

| Was | Wert |
|---|---|
| Prototyp | `/tmp/spike103/proto` (Payload 3.93.0, `@payloadcms/db-postgres` 3.93.0, Next 16.4.2, React ^19.2.8, `payload-totp` 3.0.7). Nicht eingecheckt |
| Postgres | **Postgres 18.6**, echt (npm `embedded-postgres@18.6.0-beta.19`, Port 55439), Pod ohne Docker. Kein SQLite. Die CI des Repos nutzt `postgres:17-alpine`; die Unterschiede betreffen nichts, was der Spike prüft |
| Node | 22.23.4 (Gegenprobe, `npm i node@22.23.4`) und 26.12.1 (Pod) |
| Bun | 1.4.2 im Pod (das Repo pinnt 1.4.4) |
| Treiber/ORM | `pg` 8.20.0, `drizzle-orm` 0.45.2, `drizzle-kit` 0.31.7 (kommen mit dem Adapter) |

Ablauf zum Nachvollziehen (aus einem leeren Verzeichnis außerhalb des Repos):

```bash
npm view payload version dist-tags --json          # 3.93.0, latest
npx create-payload-app@3.93.0 -n proto -t blank --db postgres --db-connection-string postgres://… --no-deps --no-agent --no-git
# package.json: next 16.4.2, react ^19.2.8; npm install            -> 387 Pakete, 702 MB (bun install: 440 Pakete, 6 s, 935 MB)
NODE_OPTIONS=--no-deprecation npx payload run scripts/o14.ts     # Auth-Tests, Local API gegen Postgres
npx next dev -p 3939 && node scripts/o16.mjs                      # HTTP-Tests gegen den Dev-Server
```

## 1. Version und Laufzeit (Todo 1)

| Punkt | Befund | Beleg |
|---|---|---|
| Version | 3.93.0 stabil. Takt grob alle 1 bis 2 Wochen (3.91.0 15.10., 3.92.0 22.10., 3.92.1 27.10., 3.93.0 04.11.). `canary`/`beta` sind 4.0, nicht verwenden | `npm view payload dist-tags time --json` |
| Node | `engines.node: ^22.23.4 \|\| >=24.22.1` für `payload`, `@payloadcms/next`, `@payloadcms/ui`. **Repo: `.nvmrc` 22.22.2, `engines >=22 <23`.** 22.22.2 erfüllt die Engine nicht. Läuft unter 22.23.4 und 26.12.1 | `npm view payload engines`; `cat .nvmrc` |
| Next.js | Peer `>=16.3.3 <17.0.0` (zusätzlich 15.x-Zeilen). Repo 16.4.2 passt. Ein Wechsel von Next muss in die Payload-Spanne fallen, die Spanne ist eng | `npm view @payloadcms/next peerDependencies` |
| React | Peer `^19.0.1 \|\| ^19.1.2 \|\| ^19.2.1`, Repo `^19.2.8` passt. `npm install` löste 19.3.1 auf | `npm ls react` |
| GraphQL | `graphql ^16.8.1` ist Peer-Pflicht, auch wenn GraphQL abgeschaltet ist | `npm view payload peerDependencies` |
| Postgres-Adapter | `@payloadcms/db-postgres` (Drizzle). Läuft gegen Postgres 18.6. Dev-Modus `push: true` legt das Schema selbst an und **fragt interaktiv** nach (Umbenennung oder neue Tabelle). Ein nicht-interaktiver Lauf hing dort. In allen Nicht-Dev-Umgebungen `push: false` und Migrationen | Lauf hing bei „Is readers table created or renamed …?“ |
| Migrationsweg | `payload migrate:create <name>` erzeugt aus dem Schema-Diff `src/migrations/<zeit>_<name>.ts` und `.json`, `migrate`, `migrate:status`, `migrate:down` laufen. Eine leere Migration für eigenes SQL erzeugt der Befehl nicht (kein Diff, keine Datei); sie wird von Hand nach dem Muster der erzeugten Datei angelegt und in `src/migrations/index.ts` eingetragen | siehe unten |
| Passwort-Hash | `auth.passwordHashIterations` kennt **nur 100 000 oder 600 000** (Standard 600 000). Altformat (25 000 Iterationen, 512 Byte) wird gelesen | `config/sanitize.js`, `generatePasswordSaltHash.js` |

Migrationen, gekürzt:

```text
$ PAYLOAD_PUSH=0 npx payload migrate:create initial      -> src/migrations/20261110_093845_initial.ts (298 Zeilen)
$ npx payload migrate                                    -> Migrated: 20261110_093845_initial (192ms)
                                                            Migrated: 20261110_100000_mailbox_index (5ms)   (von Hand angelegt)
$ npx payload migrate:status                             -> beide „Yes“, Batch 1
$ npx payload migrate:down                               -> Migrated down: 20261110_093845_initial
CREATE UNIQUE INDEX users_trial_canonical_idx ON public.users USING btree (email_canonical)
  WHERE ((email_verified_at IS NOT NULL) AND trial_guarded)
```

### Bun oder Node?

| Prüfung | Ergebnis |
|---|---|
| `bun scripts/o14.ts` (Local API, Postgres) | gleiche Ausgabe wie unter Node (Hash-Format, Sperre, Reset, JWT, Index-Rennen, PKCE) |
| `bun --bun next dev` (Turbopack) | **500**: `Failed to load external module @payloadcms/db-postgres-<hash>: Cannot find package …` |
| `bun --bun next dev --webpack` | funktioniert; die HTTP-Tests (Abschnitt O16) liefern **dieselben Statuscodes** wie unter Node/Turbopack |
| `bun install` | 440 Pakete in 6 s (Bun blockiert Lifecycle-Skripte; für den Spike nicht nötig) |
| `next build` / `next start` (Node und Bun) | **nicht geprüft** (Pod-Speicher, Regel des Teams) |

**Empfehlung:** CMS-Image auf **Node 22 (≥ 22.23.4)** als Laufzeit, Installation und Skripte weiter mit Bun. Gründe: Payload deklariert Node als Engine, Turbopack unter Bun scheitert, Next ist auf Node ausgelegt. Das ist der Posten „CMS-Image auf Node statt Bun“, der in ADR 11 „nicht eingerechnet“ war; er steht jetzt in Zeile 1 der Aufwandstabelle. Der Produktions-Build und sein Speicherbedarf sind das erste, was #204 in der CI belegen muss.

## 2. O14: Auth für Endnutzer

Collection `users` im Prototyp: `auth: { tokenExpiration: 30 Tage, maxLoginAttempts: 5, lockTime: 15 min, forgotPassword.expiration: 14 Tage, verify: true, useSessions: true }`, Zugriff für alle außer Betreiber verweigert. Ausgabe des Laufs `scripts/o14.ts` (Node 22.23.4, Postgres 18.6), gekürzt:

```text
[1a "abc" für operators (Payload-Standard, kein Hook)]  OK
[1b users "kurz1"]                                      FEHLER: The following field is invalid: password
[1c users "nurbuchstaben"]                              FEHLER: …
[1e hash-Format] {"prefix":"pbkdf2-sha256-v1:","hashHexLen":81,"saltHexLen":64}
[2a 5 Fehlversuche] "FEHLER: The email or password provided is incorrect."
[2b 6. Versuch mit RICHTIGEM Passwort] FEHLER: This user is locked due to having too many failed login attempts.
[2d] {"login_attempts":"5","lock_until":"…+15 min"}
[3a forgotPassword(disableEmail)] {"type":"string","len":40}
[3b Token in der DB] {"gleichKlartext":true,"sha256":false,"laufzeitTage":"14.00"}
[3d resetPassword schwaches PW] FEHLER   [3e gutes PW] OK   [3f zweite Einlösung] FEHLER: Token is either invalid or has expired.
[4b Verifizierungstoken] Klartext in der DB, keine Ablauf-Spalte
[5a JWT-Claims] {"keys":["id","collection","email","sid","iat","exp"],"lebensdauerTage":"30.0"}
[5d nach Löschen der Session] {"user":null}   [5e nach Passwort-Reset: alte Sitzung] {"user":null}
[6c 3 gleichzeitige Bestätigungen] ["FEHLER: … email_canonical","OK","FEHLER: … email_canonical"]
[6d bestätigt in DB] {"n":1}   [6e Gmail-Rennen] ["OK","FEHLER"]
[7a falscher Verifier] FEHLER   [7b richtig] OK   [7c Wiederholung] FEHLER: code ungültig
```

| Punkt | Urteil | Befund und Beleg |
|---|---|---|
| **Passwort-Regel** (≥ 10 Zeichen, Buchstaben und Zahlen, wie `apps/app/src/lib/passwordAuth.ts`) | **geht mit Hook** | Payload prüft nur Länge (Standard `minLength` 3): `abc` wird akzeptiert (1a). Die Regel kommt als `beforeValidate`-Hook (Anlegen, Ändern: 1b, 1c). **Achtung:** der Reset umgeht `beforeValidate`; mit nur diesem Hook wurde im ersten Lauf ein schwaches Passwort beim Reset **angenommen** (und verbrauchte den Token). Es braucht zusätzlich einen `beforeOperation`-Hook für `resetPassword` (3d), Betreiberkonten brauchen die Regel ebenfalls |
| **Hash** | nativ, **stärker als die App** | PBKDF2-HMAC-SHA256, **600 000 Iterationen** (Standard; wählbar nur 100 000 oder 600 000), Salt 32 Byte (64 Hex, eigene Spalte), Schlüssel 32 Byte, Format `pbkdf2-sha256-v1:<hex>`. Die App nutzt 310 000. Kosten: ca. **184 ms je Hash** im Pod (5 Konten in 918 ms), also etwa doppelt so viel CPU je Login wie heute. Die Lastprobe gehört in den Testsystem-Lauf |
| **Sperre nach Fehlversuchen** | **nativ** | `maxLoginAttempts` und `lockTime` je Konto. Nach 5 Fehlversuchen ist das Konto 15 Minuten gesperrt, auch mit richtigem Passwort (2b). Nach Ablauf geht das Login wieder (2e). Ein erfolgreicher Reset hebt die Sperre auf (Quelltext `resetPassword.js`). **Aber:** die Sperre meldet sich anders als ein falsches Passwort („locked“ gegenüber „incorrect“) und verrät damit, dass das Konto existiert. Der Handler von `/svc/v1/auth/login` bildet beides auf dieselbe 401-Antwort ab |
| **Rate-Limit** (Login, Reset) | **geht nicht nativ, Eigenbau** | Kein Treffer für Rate-Limit im Quelltext von `auth`, `config`, `collections`. Die Sperre zählt je Konto, nicht je Quelle. `forgotPassword.minRequestInterval` (15 s) gilt **nur ohne `disableEmail`**; wer den Token zurückgibt (O5), hat keine Drosselung (3h: zwei Anforderungen direkt hintereinander liefern zwei Token). Im Prototyp ein Zähler im Handler (11 Fehlversuche, Grenze 10 je 15 min: 429). Im Betrieb mit ≥ 2 Replikas braucht er geteilten Speicher (Postgres-Tabelle). Die App zählt ohnehin selbst (`bloom_rate_limits`, 10 je 15 min je Adresse und Quelle) |
| **Reset: Token zurückgeben** | **nativ** | `payload.forgotPassword({ collection, data: { email }, disableEmail: true })` gibt den Token zurück (3a). Unbekannte Adresse: Rückgabe `null`, kein Fehler (3c); der Handler muss die Antwortform gleich halten (so im Prototyp: `{accepted: true, token: null}`) |
| **Gültigkeit 14 Tage** | **nativ** | `forgotPassword.expiration` (gemessen 14,00 Tage, 3b). Ein abgelaufener Token wird abgelehnt (3g) |
| **Einmalverwendung** | **nativ** | Zweite Einlösung scheitert (3f). Der Reset beendet alle Sitzungen des Kontos (5e) |
| **Token nur als Hash gespeichert** (ADR 3 und 8) | **geht nicht nativ, Eigenbau** | Der Reset-Token steht im **Klartext** in `reset_password_token` (3b, `sha256: false`). Der Verifizierungs-Token (`verify: true`, `_verificationtoken`) steht ebenfalls im Klartext, ist einmalig, hat aber **keine Ablauf-Spalte** (4b). Für Bestätigung, Aktivierung der Wartelisten-Konten und Reset empfiehlt der Spike **eine eigene Collection** `auth-tokens` (Zweck, Hash, Ablauf, `usedAt`, Benutzer-ID) mit Einlösung per atomarem Update, wie `bloom_auth_tokens` heute. Dann entfällt `verify: true`, und Payload-Felder und -Endpunkte für Reset und Verifizierung werden nicht genutzt |
| **Mobile-Login mit PKCE** | **geht nicht nativ, Eigenbau; gehört aber in die App** | Payload hat keinen OAuth-/PKCE-Server. Eigener Ablauf im Prototyp: Collection `mobile-auth-codes` (Hash des Codes, Challenge, Hash des States, Ablauf, `usedAt`) und S256-Prüfung: falscher Verifier abgelehnt (7a), richtiger Verifier einmal gültig (7b), Wiederholung abgelehnt (7c). Nach ADR A1 bleiben Mobile-Codes und Zugriffstoken ohnehin in der App (`bloom_mobile_auth_codes`, `apps/app/src/lib/mobile-auth.ts`). Das CMS muss dafür nur Benutzer-ID und Status liefern. **Empfehlung: PKCE bleibt unverändert in `apps/app`.** Das senkt den Aufwand der CMS-Seite |
| **Sitzungen/JWT** | **nativ, aber im Zielbild kaum gebraucht** | JWT mit `id, collection, email, sid, iat, exp`; `tokenExpiration` einstellbar (30,0 Tage gemessen). Mit `useSessions: true` (Standard) liegt je Sitzung eine Zeile in `users_sessions`; Löschen der Zeile widerruft sofort bei der nächsten Prüfung (5d). Ein Passwort-Reset beendet alle Sitzungen (5e). Verhältnis zu A1: Die App behält ihre eigenen Sitzungen (Cookie, `bloom_sessions`); das CMS stellt für Endnutzer keine Sitzung aus, `/svc/v1/auth/login` liefert Benutzer-ID, Status und `sessionsValidAfter`. `sessionsValidAfter` kennt Payload nicht, es ist ein eigenes Feld |
| **Eindeutiger Index je kanonischem Postfach** | **geht mit Roh-SQL-Migration und Hook** | Payload kann **keinen partiellen** Unique-Index (`where email_verified_at is not null and trial_guarded`) und keine generierte Spalte aus dem Schema erzeugen. Er kommt per Hand-Migration (siehe Abschnitt 1) wie `apps/app/db/014_email_canonical.sql`. Die kanonische Adresse berechnet ein Hook aus `email` (gleiche Regel wie `email-canonical.ts`, `+tag`, Gmail-Punkte, googlemail: 6a, 6b); die SQL-Variante der App mit generierter Spalte entfällt dann, die Regel steht nur noch einmal (TypeScript). **Gleichzeitige Bestätigungen:** drei Bestätigungen derselben Adresse im selben Moment: eine gelingt, zwei scheitern am Index (6c, 6d), ebenso Gmail-Punkte/googlemail (6e). Payload meldet den Fehler als `ValidationError` zum Feld `email_canonical` (HTTP 400), nicht als eindeutige „Postfach vergeben“-Meldung; die Abbildung auf die App-Meldung ist Handler-Sache |
| **Zweiter Faktor für Betreiber (O9)** | **nicht nativ; Plugin oder Eigenbau** | Im Quelltext von `payload` und `@payloadcms/next` gibt es keine TOTP-/MFA-Unterstützung. Plugins: **`payload-totp` 3.0.7** (MIT, Peer `payload ^3.88`, ca. 19 500 Downloads/Woche, ein Maintainer, erstellt 01/2025) und `@purposeinplay/payload-totp` 0.5.1 (MIT, Team, ca. 260 Downloads/Woche, erstellt 06/2026). Mit 3.93.0 **lädt die Konfiguration** mit `payload-totp` (`forceSetup: true`) und fügt `POST /api/setup-totp`, `POST /api/remove-totp` und die Collection `totp-attempts` hinzu. Das Plugin **überschreibt die Zugriffsfunktionen aller Collections** (Herstellerhinweis: als letztes Plugin eintragen), verlangt eine `proxy.ts` für den Kopf `x-pathname` und sperrt nach zu vielen falschen Codes. **Nicht geprüft:** der Oberflächenablauf (Einrichtung, Anmeldung mit Code), das braucht einen Browser. Das ist ein Posten für #206 und den tester. Eigenbau (TOTP-Bibliothek `otpauth`, eigene Strategie) ist die Alternative, wenn das Plugin nicht trägt |

### Weitere Funde zu O14

- **Konto ohne Passwort** (ADR 8, Migration): `payload.create` verweigert ein Konto ohne Passwort (`password` invalid). Zwei Wege geprüft: (1) Zufallspasswort (184 ms je Konto, also z. B. 10 000 Konten ≈ 31 Minuten CPU, parallelisierbar) oder (2) `payload.db.create` (umgeht Hooks und Validierung, **kein Hash, kein Salt**): Login mit beliebigem Passwort scheitert, `forgotPassword` und `resetPassword` funktionieren danach (Test `ids2`). Beim Weg (2) müssen kanonische Adresse und Pflichtfelder von der Migration selbst gesetzt werden.
- **Benutzer-ID 1:1 aus dem Bestand** (A2): Mit `idType: 'uuid'` erzeugt Payload **eigene** UUIDs, eine mitgegebene `id` wird ignoriert (Test `ids`: gleich=false). Mit einem **eigenen Feld `id` (Typ `text`)** in der Collection wird die mitgegebene UUID übernommen, auch über `payload.db.create` (gleich=true), und bleibt nach dem Login erhalten. A2 ist damit machbar, die ID ist dann Text statt `uuid` in der CMS-Datenbank.
- **Betreiber** (`operators`) haben dieselben Sperr-Felder (`login_attempts`, `lock_until`, `reset_password_*`, Hash, Salt). Die Passwort-Regel gilt dort nur, wenn der Hook auch dort hängt (1a).

## 3. O16: `/svc/v1` und Token

Prototyp: Next-Route-Handler unter `src/app/svc/v1/**/route.ts` neben der Payload-Route `src/app/(payload)/api/[...slug]/route.ts`, Aufruf der Local API in den Handlern. HTTP-Läufe (`scripts/o16.mjs`, Dev-Server Port 3939, Node/Turbopack **und** Bun/webpack mit gleichen Statuscodes), gekürzt.

### A. Eigene Routen neben `/api` und Dienst-Signatur der App

```text
GET  /svc/v1/health/ready                       -> 200 {"ready":true}
POST /svc/v1/auth/login ohne Signatur           -> 401
POST /svc/v1/auth/login falsche Signatur        -> 401
POST /svc/v1/auth/login Zeitstempel -5 min      -> 401
POST /svc/v1/auth/login signiert, unbekannt     -> 401 {"error":"invalid_credentials"}
Wiederholung derselben Nonce (password-resets)  -> erster Aufruf 200, Wiederholung 401
```

**Ja, `/svc/v1/*` lässt sich als eigene Routen von `apps/cms` neben `/api` betreiben** (Next-Route-Handler, keine Payload-Endpunkte nötig). Die HMAC-Prüfung aus ADR 3 (Methode, Pfad, Hash des Bodys, Zeitstempel ±60 s, Nonce) ist in rund 20 Zeilen umgesetzt. **Der Nonce-Speicher im Prototyp liegt im Prozess; bei ≥ 2 Replikas braucht der Wiederholschutz einen geteilten Speicher** (Postgres), das steht jetzt im Aufwand.

### B. Reset-Token zurückgeben, einlösen (App versendet)

```text
POST /svc/v1/password-resets                    -> 200 {"accepted":true,"token":"<40 Zeichen>"}
POST /svc/v1/password-resets unbekanntes Konto  -> 200 {"accepted":true,"token":null}
POST /svc/v1/tokens/redeem schwaches Passwort   -> 400 (Token bleibt gültig)
POST /svc/v1/tokens/redeem gutes Passwort       -> 200 {"ok":true}
POST /svc/v1/tokens/redeem zweites Mal          -> 400 Token invalid
POST /svc/v1/auth/login richtig                 -> 200 {"userId":29,"status":"active","sessionsValidAfter":null}
11 Fehlversuche in Folge (Handler-Limit 10)     -> 429 {"error":"rate_limited"}
```

Der Betreiber legt Nutzer über `POST /api/users` mit Cookie an (201), das ist der Pfad, den die Admin-Oberfläche braucht. Unbekannte und bekannte Adresse unterscheiden sich in der Antwort nur im Feld `token`, das die App nie weitergibt.

### C. Option T: dienstseitig geprüftes, undurchsichtiges Lese-Token

```text
GET /svc/v1/content/blog ohne Token             -> 401
GET /svc/v1/content/blog falsches Token         -> 401
GET /svc/v1/content/blog gültiges Token         -> 200 {"items":[{"title":"Veröffentlicht",…}]}   (Entwurf fehlt)
GET /svc/v1/content/news gültiges Token         -> 200 {"items":[{"title":"News live",…}]}
GET /svc/v1/content/users gültiges Token        -> 404
Token auf /api/posts                            -> 404
Token auf /api/users                            -> 404
Token auf /admin                                -> 200 (Anmeldeseite, ohne Sitzung wirkungslos)
```

- **Machbarkeit:** ja. Das Token ist kein Payload-API-Schlüssel und keine Payload-Sitzung. Die Prüfung sitzt **im Handler** von `/svc/v1/content/[kind]`: SHA-256 des Bearer-Werts, Nachschlagen in der Collection `read-tokens` (Feld `hash`, eindeutig), Zugriff über die Local API mit `overrideAccess` nur für Blog/News mit `_status: published`. Bei 256 Bit Zufall reicht SHA-256 (kein Passwort-Hash nötig).
- **Rotation:** zwei Zeilen gleichzeitig. **Widerruf:** Zeile löschen, wirkt sofort. **Audit:** Zähler `uses` je Token (Prototyp zählt hoch; ADR: nur Zähler und Zeit).
- **Aufwand:** etwa 60 Zeilen Handler plus Collection und Test, **0,5 bis 1 Personentag** (eigene Rate-Limit-Logik und Rotation eingerechnet).
- **Wo die Prüfung sitzt:** nur in `apps/cms`, nicht im Mesh. Auf `/api` und `/admin` ist das Token wirkungslos, auch wenn jemand das Netz erreicht (ADR 3, Annahme A6 bestätigt).

### D. `/api`, GraphQL und Playground abschalten oder sperren

| Schicht | Konfiguration im Prototyp | Ergebnis |
|---|---|---|
| GraphQL | `graphQL: { disable: true }`, Route-Dateien der Vorlage **behalten** | `POST /api/graphql` 404, `GET /api/graphql` 405, **`GET /api/graphql-playground` 200 (HTML-Seite des Playgrounds, ohne Anmeldung)** |
| GraphQL, Route-Dateien **gelöscht** (`api/graphql/route.ts`, `api/graphql-playground/route.ts`) | | beide 404 (`Route not found`) |
| REST `/api/*` | Wrapper um `REST_GET/POST/PATCH/PUT/DELETE`: ohne Sitzung eines `operators`-Kontos **404**, ausgenommen nur Login, `me`, `logout`, `refresh-token`, `forgot-password`, `reset-password`, `init`, `first-register` der Collection `operators` | siehe E |
| Cookie-Anmeldung | `csrf: ['http://localhost:3939']` | Ein Cookie ohne `Origin`-Kopf wird von Payload nicht als Sitzung anerkannt (im Prototyp antwortet dann der Wächter mit 404), mit passendem `Origin` wird es angenommen (Browser senden ihn) |

**Ja: `/api` lässt sich per Prüfung sperren, sodass nur `/svc/v1` und der Admin-Pfad antworten.** Zwei Bedingungen:

1. Die Route-Dateien `api/graphql` und `api/graphql-playground` der Vorlage **müssen gelöscht** werden. `graphQL.disable: true` allein sperrt den Playground im Dev-Lauf nicht. `disablePlaygroundInProduction` wurde nicht geprüft (kein Produktions-Build). Das ist ein Prüfpunkt für den Inventar-Test.
2. Die Admin-Oberfläche ruft im Browser dieselbe REST-API desselben Ursprungs auf (ADR 2). Der Wächter lässt `/api` deshalb **mit Betreiber-Sitzung** durch. Für App und Marketing (Netzwerk) ist `/api` ohne Sitzung 404.

Der Wächter (rund 15 Zeilen, `src/app/(payload)/api/[...slug]/route.ts`):

```ts
const OPEN = /^\/api\/operators\/(login|logout|me|refresh-token|init|first-register|forgot-password|reset-password)$/
async function guard(req: Request) {
  if (OPEN.test(new URL(req.url).pathname)) return null
  const { user } = await (await getPayload({ config })).auth({ headers: req.headers })
  return user?.collection === 'operators' ? null : new Response('Not Found', { status: 404 })
}
export const GET = async (req, ctx) => (await guard(req)) ?? REST_GET(config)(req, ctx)   // ebenso POST/PATCH/PUT/DELETE
```

### E. Inventar der erreichbaren Pfade im Prototyp (Grundlage für den Inventar-Test)

Ohne Anmeldung (`scripts/o16.mjs`, Abschnitt D), mit Statuscode:

| Pfad | Status | Anmerkung |
|---|---|---|
| `GET /admin`, `GET /admin/login` | 200 | Anmeldeseite der Oberfläche, plus `/_next/*` (Assets) |
| `GET /api/operators/me` | 200 `{"user":null}` | Betreiber-Login-Pfade sind offen (Liste `OPEN`) |
| `POST /api/operators/login` | 400 (Validierung) | erreichbar, braucht gültige Daten |
| `GET /svc/v1/health/ready` | 200 | bewusst offen, ohne Daten |
| `POST /svc/v1/auth/login`, `/password-resets`, `/tokens/redeem` | 401 | ohne Signatur |
| `GET /svc/v1/content/{blog,news}` | 401 | ohne Token |
| `GET /`, `/api`, `/robots.txt`, `/svc/v1`, `/svc/v1/nope`, `/my-route` | 404 | |
| `GET/POST /api/users`, `/api/users/login`, `/forgot-password`, `/first-register`, `/me`, `/api/posts`, `/api/read-tokens`, `/api/access`, `/api/payload-preferences/x`, `/api/operators`, `/api/globals`, `/api/payload-jobs/run` | 404 | Wächter |
| `GET/POST /api/graphql`, `GET /api/graphql-playground`, `/api/openapi.json`, `/api/_openapi` | 404 | Route-Dateien gelöscht |

Mit Betreiber-Cookie (und `Origin`): `GET /api/users` 200, `PATCH /api/users/:id` 200, `GET /api/access` 200, `GET /api/operators/me` 200. Ein Betreiber ohne passende Zugriffsfunktion bekommt 403 (z. B. `GET /api/posts`, im Prototyp nicht freigegeben).

**Bauplan für den Inventar-Test (#204):** Er hat drei Teile und scheitert bei jeder unbekannten Route.

1. **Dateien:** alle `route.ts`/`page.tsx` unter `apps/cms/src/app` gegen eine Positivliste. Im Prototyp: `(payload)/admin/[[...segments]]`, `(payload)/api/[...slug]`, fünf Routen unter `svc/v1`. Keine Dateien für `graphql`, `graphql-playground`.
2. **Payload-Endpunkte aus der aufgelösten Konfiguration** (`payload.config.endpoints` und `collection.endpoints`, Skript `inv.ts`): **ca. 163 Endpunkte** bei 10 Collections (6 eigene, 4 interne `payload-kv`, `payload-locked-documents`, `payload-preferences`, `payload-jobs`). Je Collection 12 Zeilen (`find`, `count`, `findByID`, `create`, `update`, `delete`, Versionen, `docAccess`, `duplicate`), je Auth-Collection 10 weitere (`login`, `logout`, `me`, `refresh-token`, `forgot-password`, `reset-password`, `verify/:id`, `unlock`, `first-register`, `init`), dazu `GET /api/access`. Ein Plugin fügt Endpunkte hinzu (`payload-totp`: `setup-totp`, `remove-totp`, `totp-attempts`). Jede neue Collection oder jedes Plugin ändert die Zahl, der Test muss das sichtbar machen.
3. **HTTP-Probe** aller Pfade aus 1 und 2 ohne Anmeldung gegen den laufenden Dienst: erlaubt sind nur 200 für die Positivliste (Anmeldeseite, `health/ready`, Betreiber-Login), 401 für `/svc/v1` ohne Signatur oder Token, sonst 404.

### F. Alternative aus O16: Payload-API-Schlüssel mit Zugriffsfunktionen

Geprüft über die Local API (`scripts/apikey.ts`, **nicht** über HTTP): Collection `readers` mit `auth: { useAPIKey: true, disableLocalStrategy: true }`, `posts.read` liefert für `readers` nur `{ _status: { equals: 'published' } }`.

```text
[apikey] DB: {"apiKeyIstKlartext":false,"apiKeyLen":110,"indexLen":64}
[apikey] auth -> readers
[apikey] Lesen mit API-Key (overrideAccess=false): ["News live:published","Veröffentlicht:published"]
[apikey] users lesen: FEHLER (not allowed)     [apikey] schreiben: FEHLER (not allowed)
[apikey] falscher Key -> null
```

Es funktioniert (Entwürfe nicht sichtbar, Benutzer und Schreiben verweigert), hat aber Nachteile gegenüber Option T:

- Der Schlüssel liegt **verschlüsselt** (umkehrbar mit `PAYLOAD_SECRET`), nur der Index ist ein HMAC; kein reiner Hash.
- Er gilt auf **`/api`**. App und Marketing müssten `/api` erreichen, die Pfadregel im Mesh (O15, Schicht 2) trüge die Begrenzung allein, und der Wächter aus D müsste API-Schlüssel durchlassen. Alle Standard-Endpunkte (`find`, `count`, `versions`) wären für den Schlüssel erreichbar, nicht nur der enumerierte Vertrag.
- Kein Rate-Limit, keine Rotation außer neuer Schlüssel je Aufrufer.

**Empfehlung: Option T bleibt.** Der API-Schlüssel ist ein vertretbarer Rückfall, falls Marketing aus technischen Gründen nur `/api` aufrufen kann; dann ist O15(b) (Pfadregel im Mesh) Pflicht.

## 4. O12: Weg für News

Prüfung der Payload-Job-Queue (Skript `jobs.ts`): ein Task `release-news` ruft `GET https://api.github.com/repos/<repo>/releases/latest` und legt einen **Entwurf** der Collection `posts` an.

```text
[job] {"queuedId":3,"ran":{"jobStatus":{"3":{"status":"success"}}},"draft":"Release v3.93.0","status":"draft"}
```

- **(c) Abruf durch das CMS ist machbar:** Task in der Queue (rund 15 Zeilen), Auslöser per `jobs.autoRun` (cron) im Dienst oder per Aufruf von `GET /api/payload-jobs/run` durch einen CronJob im Cluster. Die Umwandlung von Release-Notes in einen zweisprachigen Entwurf (`apps/marketing/scripts/generate-news-draft.ts`, 69 Zeilen, liest heute `GITHUB_EVENT_PATH`) lässt sich übernehmen.
- **Voraussetzungen:** Egress zu `api.github.com` (die NetworkPolicy aus ADR 3 erlaubt ausgehend nur Datenbank, Medien, Mail, DNS), ein lesendes GitHub-Token als zusätzliches Secret (für ein privates Repo), und die Entscheidung, welches Replika den Job startet (`jobs.shouldAutoRun`). **Nicht geprüft:** Verhalten von `autoRun` mit mehreren Replikas und die Übersetzungsqualität.
- **Einschätzung:** (c) ist technisch der kürzeste Weg. Scheitert der Egress an der Netzregel, ist (a) (CronJob im Cluster, der gegen eine Schreib-Route des CMS arbeitet) möglich, braucht aber einen zusätzlichen **schreibenden** Endpunkt in `/svc/v1`, den die ADR-Tabelle nicht kennt und der die Regel „Marketing/App ändern keine Inhalte“ berührt. (b) bleibt als Notausgang. Empfehlung wie in der ADR: **(c)**, Egress in #205 mit Ops klären. Aufwand etwa 1 Personentag (in Zeile Marketing eingerechnet).

## 5. O17: Aufwand neu geschätzt

Weiterhin **Annahme, kein Beleg, Streuung hoch** (ADR A8). Personentage; „alt“ ist die Spanne aus ADR 11. Der Spike selbst ist erledigt; sein Rest (Dinge, die er nicht belegt hat) steht in Zeile 2.

| Paket | alt | neu | Begründung |
|---|---|---|---|
| `apps/cms` aufsetzen (Workspace, Image, Release-Check, CI, Doku) | 4 bis 6 | **5 bis 8** | CMS-Image mit Node ≥ 22.23.4 (Bun-Basisimage reicht nach Spike nicht, früher „nicht eingerechnet“: +1 bis 2). `.nvmrc` 22.22.2 anheben (die CI nutzt `node-version-file`, betrifft alle Jobs). Build-Speicher von Payload/Next (Vorlage 8 GB Heap) in der CI belegen. `bun install` selbst läuft (6 s) |
| Spike (O14/O16) | 3 bis 5 | **1 bis 2** | Erledigt mit diesem Dokument. Rest in #204: Produktions-Build und -Start, Inventar-Test als Code, Oberflächenablauf der Admin-App und des zweiten Faktors, `disablePlaygroundInProduction` |
| Datenmodell und Collections | 6 bis 9 | **8 bis 12** | Mehr als angenommen: eigenes `id`-Feld (UUID 1:1), eigene Token-Collection mit Hash und Ablauf (Payload speichert Klartext, Verifizierung ohne Ablauf), partieller Eindeutigkeitsindex per Hand-Migration, Hooks für Passwort-Regel (Anlegen, Ändern **und** Reset), kanonische Adresse, `sessionsValidAfter`, Betreiberkonten mit derselben Regel, Zugriff überall verweigern, Versionen für Blog/News |
| Schnittstelle `/svc/v1`, Dienst-Authentisierung, OpenAPI, Vertragstests | 6 bis 9 | **8 bis 12** | Routen und Signatur gehen (belegt). Dazu: geteilter Nonce-Speicher für ≥ 2 Replikas, eigenes Rate-Limit (nicht nativ, geteilter Zähler), Wächter für `/api`, einheitliche Fehlerabbildung (Sperre und „Postfach vergeben“ dürfen nichts verraten), Lese-Token mit Rotation (0,5 bis 1) |
| Umbau von `apps/app` | 10 bis 15 | **10 bis 15** | Unverändert, nicht Gegenstand des Spikes. Befund stützt die Schätzung eher: PKCE, Mobile-Codes und Sitzungen bleiben in der App (A1), das CMS liefert nur ID, Status und `sessionsValidAfter` |
| Sync und Referenztabelle prüfen | 3 bis 5 | **3 bis 5** | Unverändert, vom Spike nicht berührt |
| Migration (Export, Import, Idempotenz, Abgleich, Rückexport, Passwort-Mail) | 5 bis 8 | **6 bis 10** | Konten ohne Passwort: Hooks umgehen (`db.create`) oder Zufallspasswort (184 ms je Konto). UUIDs nur mit eigenem `id`-Feld. Pflichtfelder und kanonische Adresse setzt die Migration selbst. Idempotenter Upsert und Abgleich unverändert |
| Datenschutz | 4 bis 6 | **4 bis 6** | Unverändert, vom Spike nicht berührt |
| Admin-Oberfläche | 6 bis 9 | **8 bis 12** | Zweiter Faktor nur über Community-Plugin (Anpassung, `proxy.ts`, Wirkung auf alle Collections, Oberfläche ungeprüft) oder Eigenbau (3 bis 5 allein). Passwort-Regel auch für Betreiber, Rollen, Benutzerliste mit Testzeitraum |
| Marketing: Lesepfad, Cache, Übernahme, News-Ablauf (O12) | 4 bis 6 | **4 bis 7** | Lesepfad mit Token belegt. News per Job (c): +1 für Task, Egress-Klärung und Secret |
| GitOps und Betrieb (#205) | 5 bis 8 | **5 bis 8** | Vom Spike nicht belegt (O15 offen). Dazu Node-Image und Egress zu GitHub (O12) |
| Testsystem mit pseudonymisiertem Abbild | 5 bis 8 | **5 bis 8** | Unverändert. Die Lastprobe für Login (600 000 Iterationen) gehört hierher |
| Cutover, Rückweg, Probeläufe, Doku | 3 bis 5 | **3 bis 5** | Unverändert |
| Tests (Unit, Integration, E2E, Ausfall) | 6 bis 10 | **7 bis 12** | Zusätzlich: Inventar-Test, Rennen-Test gegen Postgres in der CI (der Dienst `postgres:17` ist vorhanden), Signatur- und Token-Tests, Test des Reset-Hooks, Lauf unter der Ziel-Node-Version |
| **Summe** | **70 bis 109** | **77 bis 122** | +7 bis +13 |

Summe nachgerechnet: untere Werte 5+1+8+8+10+3+6+4+8+4+5+5+3+7 = 77, obere 8+2+12+12+15+5+10+6+12+7+8+8+5+12 = 122.

### Risiken, die die Spanne treiben

1. **Produktions-Build und Speicher** (nicht belegt): Payload-Vorlage setzt 8 GB Heap für `next build`; CI-Runner, Docker-Build und Pod müssen das tragen. Scheitert das, wächst Zeile 1.
2. **Enge Versionskopplung:** Payload gibt Next (`>=16.3.3 <17`) und Node (`^22.23.4`) eng vor, mit Veröffentlichungen im Wochen-Takt. Das Ziel „Sicherheitsfixes in 14 Tagen“ (ADR 12, O4) bedeutet laufende Pflege von Next, Node-Pin und Payload gemeinsam; Next-Updates der beiden anderen Apps sind an die Payload-Spanne gebunden.
3. **Eigenbau an sicherheitskritischen Stellen:** Token-Collection, Rate-Limit, Signatur mit Wiederholschutz, Passwort-Regel beim Reset. Jede Lücke dort ist eine Lücke der Anmeldung der gesamten Cloud. Die Hooks sind dünn, aber ein vergessener Hook (Reset!) lässt schwache Passwörter zu.
4. **Zweiter Faktor:** Plugin eines Einzelmaintainers oder Eigenbau; Oberfläche ungeprüft. Fällt das Plugin durch, +3 bis 5.
5. **Mesh und Ingress (O15)** vom Spike nicht beantwortet. Fehlt die Pfadregel, trägt allein der Wächter und der Inventar-Test; die Schichten 2 und 4 der ADR werden schwerer.
6. **CPU je Login** (600 000 Iterationen, ca. 184 ms) gegenüber 310 000 heute: Das CMS braucht mehr Replikas oder die Iterationen müssen auf 100 000 gesenkt werden (schwächer als heute). Die Lastprobe fehlt.
7. **Migration mit Hook-Umgehung** (`db.create`): schnell, aber ohne Validierung. Ein Fehler in der Migration erzeugt Konten, die die Hooks nie gesehen haben.
8. **Datenbankversion:** getestet nur mit Postgres 18, das Repo (CI) nutzt 17; CNPG-Version in Prod ist nicht bekannt. Risiko gering, Prüfung in #204 mit `postgres:17` der CI.

## Was der Spike nicht belegt

- Produktions-Build und -Start (Node und Bun), Speicherbedarf des Builds.
- Admin-Oberfläche im Browser: Anmeldung, Benutzerliste, Einrichtung des zweiten Faktors, Wirkung des Wächters auf alle Oberflächenaufrufe (nur `/admin` und `/admin/login` als HTML und die REST-Aufrufe mit Cookie geprüft).
- `disablePlaygroundInProduction`; `jobs.autoRun` mit mehreren Replikas; API-Schlüssel über HTTP.
- Mesh, Ingress, NetworkPolicy (O15), Medien-S3, Mails, Last.
- Passwort-Mails, Wartelisten-Konten, Testzeitraum, DSGVO-Abläufe: bewusst nicht Teil des Spikes.
