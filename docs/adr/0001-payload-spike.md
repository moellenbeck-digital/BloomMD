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

Kurzablauf (der vollständige, ohne den Pod des coders lauffähige Ablauf mit allen Prüfskripten steht im Abschnitt „Wiederholung ohne den Pod des coders“ am Ende):

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

Mit Betreiber-Cookie (und `Origin`): `GET /api/users` 200, `PATCH /api/users/:id` 200, `GET /api/access` 200, `GET /api/operators/me` 200. Ein Betreiber ohne passende Zugriffsfunktion bekommt 403 (z. B. `GET /api/posts`, im ersten Prototyp nicht freigegeben, im Prüfgerüst unten freigegeben).

**Bauplan für den Inventar-Test (#204):** Er hat drei Teile und scheitert bei jeder unbekannten Route.

1. **Dateien:** alle `route.ts`/`page.tsx` unter `apps/cms/src/app` gegen eine Positivliste. Im Prototyp: `(payload)/admin/[[...segments]]`, `(payload)/api/[...slug]`, fünf Routen unter `svc/v1`. Keine Dateien für `graphql`, `graphql-playground`.
2. **Payload-Endpunkte aus der aufgelösten Konfiguration** (`payload.config.endpoints` und `collection.endpoints`, Skript `inv.ts`): **ca. 163 Endpunkte** bei 10 Collections (126 im Prüfgerüst unten mit 8 Collections) (6 eigene, 4 interne `payload-kv`, `payload-locked-documents`, `payload-preferences`, `payload-jobs`). Je Collection 12 Zeilen (`find`, `count`, `findByID`, `create`, `update`, `delete`, Versionen, `docAccess`, `duplicate`), je Auth-Collection 10 weitere (`login`, `logout`, `me`, `refresh-token`, `forgot-password`, `reset-password`, `verify/:id`, `unlock`, `first-register`, `init`), dazu `GET /api/access`. Ein Plugin fügt Endpunkte hinzu (`payload-totp`: `setup-totp`, `remove-totp`, `totp-attempts`). Jede neue Collection oder jedes Plugin ändert die Zahl, der Test muss das sichtbar machen.
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

## Abweichungen von der ADR (Stand der Nacharbeit)

Der erste Bericht zu diesem Spike nannte nur eine Stelle (Schicht 4, GraphQL). Die folgende Liste ist vollständig; die Stellen sind im [ADR](0001-payload-cms.md) korrigiert oder mit dem Spike-Ergebnis ergänzt. Die Beschlüsse vom 09.11. bleiben unverändert.

| # | ADR-Stelle | Aussage der ADR | Befund des Spikes | Korrektur |
|---|---|---|---|---|
| 1 | Abschnitt 3, Schicht 4 | „GraphQL aus, kein Playground“ | `graphQL.disable` allein sperrt den Playground nicht (200 ohne Anmeldung) | Route-Dateien `api/graphql` und `api/graphql-playground` löschen |
| 2 | Abschnitt 3, Schicht 4 | Standard-Endpunkte von `users` „abgeschaltet oder verweigert“ | Sie bleiben registriert (126 Endpunkte im Prüfgerüst, ca. 163 im ersten Prototyp); verweigert per Zugriffsfunktion, ohne Wächter antwortet `/api` mit 401/403 statt 404 | Wächter vor `/api`, Inventar-Test |
| 3 | Abschnitt 3, Dienst-Authentisierung | Wiederholschutz über die Nonce | Ein Speicher je Prozess genügt bei mehreren Replikas nicht | geteilter Nonce-Speicher (z. B. CMS-Datenbank) |
| 4 | Abschnitt 3, Option T | „Anfragen je Zeit begrenzt“ als gegeben | Payload hat kein Rate-Limit; `minRequestInterval` gilt nur mit Mailversand | Rate-Limit im Handler, bei Replikas geteilter Zähler |
| 5 | Abschnitt 3, Endpunkt `auth/login` | Zähler je Konto im CMS | Die native Sperre meldet „gesperrt“ anders als „falsch“ und verrät das Konto | Handler bildet beides auf dieselbe 401-Antwort ab |
| 6 | Abschnitt 8, Link | „im CMS nur als Hash gespeichert“ | Payload speichert Reset- und Verifizierungs-Token im Klartext; der Verifizierungs-Token hat keinen Ablauf | eigene Token-Collection mit Hash, Zweck, Ablauf |
| 7 | Abschnitt 8, Punkt 1 | Konten ohne Passwort anlegen | `payload.create` verweigert das | Import über `payload.db.create` (ohne Hooks) oder Zufallspasswort |
| 8 | Abschnitt 8, Passwort-Regel | Regel „wie heute“ (implizit überall wirksam) | `beforeValidate` greift beim Reset nicht; ein schwaches Passwort wurde angenommen | zusätzlich `beforeOperation`-Hook für `resetPassword` |
| 9 | Abschnitt 3, Betreiber / O9 | zweiter Faktor Pflicht | Payload hat keinen nativen zweiten Faktor | Community-Plugin oder Eigenbau, Oberfläche ungeprüft |
| 10 | A2 | Benutzer-ID 1:1 (dieselbe UUID) | `idType: 'uuid'` allein ignoriert die mitgegebene ID | eigenes Feld `id` (Text) in der CMS-Collection |
| 11 | Abschnitt 6, Missbrauchsschutz | „eindeutiger Index“ | Payload erzeugt keinen partiellen Index | Roh-SQL-Migration, Rennen-Test |
| 12 | Kontext, Spike; Abschnitt 2 | „das Repo erlaubt `node >=22 <23`“; Laufzeit offen | `.nvmrc` 22.22.2 liegt unter Payloads Engine `^22.23.4 \|\| >=24.22.1` | Node ≥ 22.23.4, Image auf Node; Aufgabe für #204 |
| 13 | Abschnitt 11 | „Nicht eingerechnet: CMS-Image auf Node“; Summe 70 bis 109 | Node-Image ist nötig | eingerechnet, Summe 77 bis 122 |

Bestätigt ohne Abweichung: Next 16.4.2 passt (Peer `>=16.3.3 <17`); `/svc/v1` als eigene Routen neben `/api`; Option T und Annahme A6 (mit den Ergänzungen 1, 3, 4); Sperre, Reset-Token (zurückgeben, 14 Tage, einmalig), Sitzungswiderruf, Hash-Stärke; PKCE und Sitzungen bleiben in der App (A1).

## Was der Spike nicht belegt

- Produktions-Build und -Start (Node und Bun), Speicherbedarf des Builds.
- Admin-Oberfläche im Browser: Anmeldung, Benutzerliste, Einrichtung des zweiten Faktors, Wirkung des Wächters auf alle Oberflächenaufrufe (nur `/admin` und `/admin/login` als HTML und die REST-Aufrufe mit Cookie geprüft).
- `disablePlaygroundInProduction`; `jobs.autoRun` mit mehreren Replikas; API-Schlüssel über HTTP.
- Mesh, Ingress, NetworkPolicy (O15), Medien-S3, Mails, Last.
- Passwort-Mails, Wartelisten-Konten, Testzeitraum, DSGVO-Abläufe: bewusst nicht Teil des Spikes.

## Wiederholung ohne den Pod des coders

Alle Dateien des Prototyps, die die Tabellen oben belegen, stehen unten als Codeblöcke (Prüfskripte und das nötige Gerüst, kein Produktivcode, ca. 400 Zeilen; Zusatzprüfungen zu API-Schlüssel, Job-Queue, TOTP-Plugin, Migrationen und `id` sind nicht enthalten und aus den Befehlen im Text einzeln nachzustellen). Es gibt keine Zugangsdaten: Das Postgres ist ein Wegwerf-Container oder ein npm-Postgres, alle Werte in `.env` sind Dummywerte.

**Voraussetzungen:** Node ≥ 22.23.4 (z. B. `npx -p node@22.23.4 node -v`), npm, Python 3, entweder Docker oder die Option „npm-Postgres“, Port 55439 und 3939 frei, ca. 1,5 GB Speicher für `next dev`, nur lokal, nichts davon im Repo ausführen: ein leeres Verzeichnis außerhalb des Checkouts verwenden.

```bash
export REPO=/pfad/zum/BloomMD-checkout           # enthält docs/adr/0001-payload-spike.md
mkdir -p /tmp/spike && cd /tmp/spike

# 1. Postgres mit Docker (Datenbank „cms“, Benutzer/Passwort „spike“); ohne Docker: Schritt 3b
docker run -d --name spike-pg -e POSTGRES_USER=spike -e POSTGRES_PASSWORD=spike -e POSTGRES_DB=cms -p 55439:5432 postgres:17-alpine

# 2. Vorlage erzeugen (Payload 3.93.0), Abhängigkeiten auf die des Repos stellen
npx --yes create-payload-app@3.93.0 -n proto -t blank --db postgres \
  --db-connection-string postgres://spike:spike@127.0.0.1:55439/cms --no-deps --no-agent --no-git
cd proto
node -e 'const p=require("./package.json");p.dependencies.next="16.4.2";p.dependencies.react="^19.2.8";p.dependencies["react-dom"]="^19.2.8";delete p.dependencies.sharp;for(const k of Object.keys(p.devDependencies))if(!/types|typescript|tsx/.test(k))delete p.devDependencies[k];delete p.pnpm;require("fs").writeFileSync("package.json",JSON.stringify(p,null,2))'
rm -rf "src/app/(frontend)" src/app/my-route src/collections/Media.ts tests vitest* playwright.config.ts eslint.config.mjs Dockerfile docker-compose.yml \
  "src/app/(payload)/api/graphql" "src/app/(payload)/api/graphql-playground"

# 3. Dateien aus diesem Dokument schreiben (Blöcke „Datei `…`“)
python3 -I - "$REPO/docs/adr/0001-payload-spike.md" . <<'PY'
import re, sys, pathlib
text = pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'); out = pathlib.Path(sys.argv[2])
for m in re.finditer(r"\*\*Datei `([^`]+)`\*\*\n\n```\w*\n(.*?)\n```", text, re.S):
    f = out / m.group(1); f.parent.mkdir(parents=True, exist_ok=True); f.write_text(m.group(2) + "\n", encoding='utf-8'); print("geschrieben", m.group(1))
PY

# 3b. nur ohne Docker: echtes Postgres 18 aus npm (das Skript hydrate-symlinks.js legt nur Symlinks an)
(cd pg && npm init -y >/dev/null && npm i embedded-postgres && node node_modules/@embedded-postgres/linux-x64/scripts/hydrate-symlinks.js   && (nohup node start.mjs > pg.log 2>&1 &) && sleep 20 && tail -1 pg.log)      # „READY“

# 4. installieren (npm; mit `bun install` geht es ebenfalls)
npm install --no-audit --no-fund
```

**O14 (Auth, Local API gegen Postgres), Ausgabe 38 Zeilen `[1a …]` bis `[8 …]` (im Doku-Lauf mit Node 22.23.4 und frischer Datenbank bestätigt):**

```bash
NODE_OPTIONS=--no-deprecation npx payload run scripts/o14.ts < /dev/null 2>&1 | grep -E '^\[[0-9]'
```

Erwartet (Auszug; Zeiten, IDs und welche der gleichzeitigen Bestätigungen gewinnt, wechseln): `1a OK`, `1b FEHLER`, `1c FEHLER`, `1e` Präfix `pbkdf2-sha256-v1:`, `2b FEHLER … locked`, `2e OK`, `3b gleichKlartext:true, laufzeitTage:"14.00"`, `3d FEHLER`, `3e OK`, `3f FEHLER`, `4b` ohne Ablauf-Spalte, `5a lebensdauerTage:"30.0"`, `5d`/`5e user:null`, `6c` genau ein `OK`, `6d n:1`, `7a FEHLER`, `7b OK`, `7c FEHLER`. Ohne den `beforeOperation`-Hook in `Users.ts` (Block entfernen) wird `3d` zu `OK`: das ist die Abweichung 8.

**O16 (HTTP gegen den Dev-Server):**

```bash
NODE_OPTIONS=--no-deprecation npx payload run scripts/seed.ts < /dev/null      # Betreiber, Lese-Token, drei Beiträge
NODE_OPTIONS="--no-deprecation --max-old-space-size=1800" npx next dev -p 3939 &   # warten bis „Ready“
curl -s -o /dev/null -w '%{http_code}\n' localhost:3939/svc/v1/health/ready        # 200, kompiliert beim ersten Aufruf (dauert)
node scripts/o16.mjs                                                           # Abschnitte A bis E
NODE_OPTIONS=--no-deprecation npx payload run scripts/inv.ts < /dev/null 2>&1 | grep -c -E '^(GET|POST|PATCH|PUT|DELETE) '   # Zahl der Payload-Endpunkte (**126** mit diesem Gerüst: 5 eigene und 3 interne Collections; der erste Prototyp mit zusätzlichem API-Schlüssel-Konto und Job-Queue kam auf ca. 163)
```

Erwartet: Abschnitt A `401, 401, 401, 401`, Nonce-Wiederholung `200` dann `401`; B `201`, Token (40 Zeichen), `redeem` schwaches Passwort `400`, gutes `200`, zweites Mal `400`, Login `200`, dann `429`; C `401, 401, 200 (nur „Veröffentlicht“, kein Entwurf), 200, 404, 404, 404`, `/admin` `200`; D: alle `/api/*` ohne Anmeldung `404` außer `GET /api/operators/me` `200` und `POST /api/operators/login` `400`; GraphQL und Playground `404`; E mit Betreiber-Cookie `200` (auch `/api/posts`, im Gerüst für Betreiber freigegeben). Zum Beleg der Abweichung 1 (so geprüft: `200` mit Datei, `404` ohne): die Datei der Vorlage anlegen, `graphQL.disable: true` bleibt gesetzt, dann `GET /api/graphql-playground` abfragen und die Datei wieder löschen:

```bash
mkdir -p "src/app/(payload)/api/graphql-playground" && cat > "src/app/(payload)/api/graphql-playground/route.ts" <<'EOF'
import config from '@payload-config'
import '@payloadcms/next/css'
import { GRAPHQL_PLAYGROUND_GET } from '@payloadcms/next/routes'
export const GET = GRAPHQL_PLAYGROUND_GET(config)
EOF
sleep 4; curl -s -o /dev/null -w '%{http_code}\n' localhost:3939/api/graphql-playground   # 200
rm -rf "src/app/(payload)/api/graphql-playground"; sleep 4; curl -s -o /dev/null -w '%{http_code}\n' localhost:3939/api/graphql-playground   # 404
```

**Aufräumen:** `kill %1` (Dev-Server), `docker rm -f spike-pg` bzw. das npm-Postgres beenden, `rm -rf /tmp/spike`.

**Datei `pg/start.mjs`**

```js
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
const pg = new EmbeddedPostgres({ databaseDir: "./pgdata", user: "spike", password: "spike", port: 55439, persistent: true });
if (!existsSync("./pgdata/PG_VERSION")) await pg.initialise();
await pg.start();
await pg.createDatabase("cms").catch((e) => console.log("createDatabase:", e.message));
console.log("READY");
setInterval(() => {}, 1 << 30);
```

### Dateien des Prototyps (Wegwerfcode, Prüfgerüst)

Zusammenhang: `payload.config.ts` bindet die Collections, `shared.ts` und `svc.ts` sind Hilfen (Passwort-Regel, kanonische Adresse, HMAC-Prüfung, Zähler), `src/app/svc/v1/**` sind die Routen aus Abschnitt 3, `(payload)/api/[...slug]/route.ts` ist der Wächter aus 3 D, `scripts/` sind die Prüfläufe.

**Datei `.env`**

```
DATABASE_URL=postgres://spike:spike@127.0.0.1:55439/cms
PAYLOAD_SECRET=spike-secret-not-real-0123456789abcdef
SVC_APP_KEY=spike-app-hmac-key-not-real
```

**Datei `src/payload.config.ts`**

```ts
import { postgresAdapter } from '@payloadcms/db-postgres'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import { Users } from './collections/Users'
import { Operators } from './collections/Operators'
import { Posts, ReadTokens, MobileAuthCodes } from './collections/Posts'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default buildConfig({
  admin: { user: Operators.slug, importMap: { baseDir: path.resolve(dirname) } },
  collections: [Operators, Users, Posts, ReadTokens, MobileAuthCodes],
  secret: process.env.PAYLOAD_SECRET || '',
  graphQL: { disable: true, disablePlaygroundInProduction: true },
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  db: postgresAdapter({ pool: { connectionString: process.env.DATABASE_URL || '' }, push: true }),
  cors: [],
  csrf: ['http://localhost:3939'],
  auth: { passwordHashIterations: 600000 } as never,
})
```

**Datei `src/lib/shared.ts`**

```ts
import crypto from 'node:crypto'
export const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex')
export function canonicalEmail(email: string): string {
  const n = email.trim().toLowerCase(); const at = n.lastIndexOf('@'); if (at < 0) return n
  const local = n.slice(0, at); const domain = n.slice(at + 1)
  const gmail = domain === 'gmail.com' || domain === 'googlemail.com'
  let s = local.split('+')[0]!; if (gmail) s = s.replaceAll('.', '')
  return `${s || local}@${gmail ? 'gmail.com' : domain}`
}
// same rule as apps/app/src/lib/passwordAuth.ts
export function passwordRuleError(p: string): string | null {
  if (p.length < 10) return 'Das Passwort muss mindestens 10 Zeichen lang sein.'
  if (!/[a-z]/i.test(p) || !/[0-9]/.test(p)) return 'Das Passwort muss Buchstaben und Zahlen enthalten.'
  return null
}
export const pkceChallenge = (verifier: string) => crypto.createHash('sha256').update(verifier).digest('base64url')
// HMAC call signature (ADR 3): method, path, body hash, timestamp, nonce
export function sign(key: string, m: string, path: string, body: string, ts: string, nonce: string) {
  return crypto.createHmac('sha256', key).update([m, path, sha256(body), ts, nonce].join('\n')).digest('hex')
}
const seenNonces = new Map<string, number>()
export function verifySignature(key: string, req: { method: string; path: string; body: string; headers: Headers }): boolean {
  const sig = req.headers.get('x-svc-signature'); const ts = req.headers.get('x-svc-timestamp'); const nonce = req.headers.get('x-svc-nonce')
  if (!sig || !ts || !nonce) return false
  if (Math.abs(Date.now() - Number(ts)) > 60_000) return false
  const exp = sign(key, req.method, req.path, req.body, ts, nonce)
  const a = Buffer.from(sig), b = Buffer.from(exp)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false
  if (seenNonces.has(nonce)) return false
  seenNonces.set(nonce, Date.now()); for (const [k, t] of seenNonces) if (Date.now() - t > 120_000) seenNonces.delete(k)
  return true
}
// minimal in-process fixed-window limiter (handler-level, ADR: app keeps bloom_rate_limits)
const buckets = new Map<string, { n: number; exp: number }>()
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now(); const b = buckets.get(key)
  if (!b || b.exp < now) { buckets.set(key, { n: 1, exp: now + windowMs }); return true }
  b.n++; return b.n <= limit
}
```

**Datei `src/lib/svc.ts`**

```ts
import config from '@payload-config'
import { getPayload } from 'payload'
import { rateLimit, sha256, verifySignature } from './shared'
export const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { 'cache-control': 'no-store' } })
export const getP = () => getPayload({ config })
export async function signed(req: Request): Promise<{ body: any } | Response> {
  const text = await req.text()
  const ok = verifySignature(process.env.SVC_APP_KEY!, { method: req.method, path: new URL(req.url).pathname, body: text, headers: req.headers })
  if (!ok) return json({ error: 'unauthorized' }, 401)
  try { return { body: text ? JSON.parse(text) : {} } } catch { return json({ error: 'bad json' }, 400) }
}
export { rateLimit, sha256 }
```

**Datei `src/collections/Users.ts`**

```ts
import { ValidationError, type CollectionConfig } from 'payload'
import { canonicalEmail, passwordRuleError } from '../lib/shared'

const isOp = ({ req }: { req: { user?: { collection?: string } | null } }) => req.user?.collection === 'operators'
// End users (platform identity). No REST access for anyone; the service layer uses the Local API.
export const Users: CollectionConfig = {
  slug: 'users',
  admin: { useAsTitle: 'email' },
  auth: {
    tokenExpiration: 60 * 60 * 24 * 30,        // JWT/session lifetime (30 d like the app cookie)
    maxLoginAttempts: 5,                        // lock after 5 wrong passwords
    lockTime: 15 * 60 * 1000,                   // 15 min
    forgotPassword: { expiration: 14 * 24 * 3600 * 1000 }, // 14 days (ADR 8)
    verify: true,                               // generates _verificationToken
    useSessions: true,
  },
  access: { read: isOp as never, create: isOp as never, update: isOp as never, delete: isOp as never, unlock: isOp as never },
  fields: [
    { name: 'emailCanonical', type: 'text', index: true, admin: { readOnly: true } },
    { name: 'emailVerifiedAt', type: 'date' },
    { name: 'trialGuarded', type: 'checkbox', defaultValue: true },
    { name: 'status', type: 'select', defaultValue: 'active', options: ['active', 'deletion_requested'] },
    { name: 'sessionsValidAfter', type: 'date' },
  ],
  hooks: {
    beforeOperation: [
      ({ args, operation }) => {
        if (operation === 'resetPassword') {
          const pw = (args as { data?: { password?: string } }).data?.password
          const err = typeof pw === 'string' ? passwordRuleError(pw) : 'Passwort fehlt'
          if (err) throw new ValidationError({ errors: [{ message: err, path: 'password' }] })
        }
        return args
      },
    ],
    beforeValidate: [
      ({ data, operation }) => {
        if (!data) return data
        if (typeof data.password === 'string') {
          const err = passwordRuleError(data.password)
          if (err) throw new ValidationError({ errors: [{ message: err, path: 'password' }] })
        }
        if (typeof data.email === 'string') data.emailCanonical = canonicalEmail(data.email)
        return data
      },
    ],
  },
}
```

**Datei `src/collections/Operators.ts`**

```ts
import type { CollectionConfig } from 'payload'
export const Operators: CollectionConfig = {
  slug: 'operators',
  admin: { useAsTitle: 'email' },
  auth: { tokenExpiration: 60 * 60 * 8, maxLoginAttempts: 5, lockTime: 15 * 60 * 1000 },
  fields: [{ name: 'role', type: 'select', defaultValue: 'admin', options: ['admin', 'support', 'editor'] }],
  access: {
    read: ({ req }) => req.user?.collection === 'operators',
    create: ({ req }) => req.user?.collection === 'operators',
    update: ({ req }) => req.user?.collection === 'operators',
    delete: ({ req }) => req.user?.collection === 'operators',
  },
}
```

**Datei `src/collections/Posts.ts`**

```ts
import type { CollectionConfig } from 'payload'
const op = ({ req }: { req: { user?: { collection?: string } | null } }) => req.user?.collection === 'operators'
export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: { useAsTitle: 'title' },
  versions: { drafts: true },
  access: { read: op as never, create: op as never, update: op as never, delete: op as never },
  fields: [{ name: 'kind', type: 'select', options: ['blog', 'news'], required: true }, { name: 'locale', type: 'select', options: ['de', 'en'], required: true }, { name: 'title', type: 'text', required: true }, { name: 'body', type: 'textarea' }],
}
export const ReadTokens: CollectionConfig = {
  slug: 'read-tokens',
  access: { read: () => false, create: op as never, update: op as never, delete: op as never },
  fields: [{ name: 'hash', type: 'text', required: true, unique: true }, { name: 'label', type: 'text' }, { name: 'uses', type: 'number', defaultValue: 0 }],
}
export const MobileAuthCodes: CollectionConfig = {
  slug: 'mobile-auth-codes',
  access: { read: () => false, create: () => false, update: () => false, delete: () => false },
  fields: [{ name: 'codeHash', type: 'text', unique: true, required: true }, { name: 'challenge', type: 'text', required: true }, { name: 'stateHash', type: 'text', required: true }, { name: 'userId', type: 'text', required: true }, { name: 'expiresAt', type: 'date', required: true }, { name: 'usedAt', type: 'date' }],
}
```

**Datei `src/app/(payload)/api/[...slug]/route.ts`**

```ts
import config from '@payload-config'
import '@payloadcms/next/css'
import { REST_DELETE, REST_GET, REST_OPTIONS, REST_PATCH, REST_POST, REST_PUT } from '@payloadcms/next/routes'
import { getPayload } from 'payload'

// Guard: /api only answers for a signed-in operator (admin UI), plus the operator login endpoints.
const OPEN = /^\/api\/operators\/(login|logout|me|refresh-token|init|first-register|forgot-password|reset-password)$/
async function guard(req: Request): Promise<Response | null> {
  const path = new URL(req.url).pathname
  if (OPEN.test(path)) return null
  const p = await getPayload({ config })
  const { user } = await p.auth({ headers: req.headers })
  return user?.collection === 'operators' ? null : new Response('Not Found', { status: 404 })
}
type Ctx = { params: Promise<{ slug: string[] }> }
const wrap = (h: (c: typeof config) => (r: Request, c: Ctx) => Promise<Response>) => async (req: Request, ctx: Ctx) => (await guard(req)) ?? h(config)(req, ctx)
export const GET = wrap(REST_GET as never)
export const POST = wrap(REST_POST as never)
export const DELETE = wrap(REST_DELETE as never)
export const PATCH = wrap(REST_PATCH as never)
export const PUT = wrap(REST_PUT as never)
export const OPTIONS = REST_OPTIONS(config)
```

**Datei `src/app/svc/v1/health/ready/route.ts`**

```ts
import { getP, json } from '@/lib/svc'
export async function GET() { const p = await getP(); await p.count({ collection: 'users' }); return json({ ready: true }) }
```

**Datei `src/app/svc/v1/auth/login/route.ts`**

```ts
import { getP, json, rateLimit, signed } from '@/lib/svc'
export async function POST(req: Request) {
  const s = await signed(req); if (s instanceof Response) return s
  const { email, password } = s.body as { email: string; password: string }
  if (!rateLimit(`login:${String(email).toLowerCase()}`, 10, 15 * 60_000)) return json({ error: 'rate_limited' }, 429)
  const p = await getP()
  try {
    const r = await p.login({ collection: 'users', data: { email, password } })
    return json({ userId: r.user.id, status: (r.user as any).status, sessionsValidAfter: (r.user as any).sessionsValidAfter ?? null })
  } catch { return json({ error: 'invalid_credentials' }, 401) }
}
```

**Datei `src/app/svc/v1/password-resets/route.ts`**

```ts
import { getP, json, rateLimit, signed } from '@/lib/svc'
export async function POST(req: Request) {
  const s = await signed(req); if (s instanceof Response) return s
  const { email } = s.body as { email: string }
  if (!rateLimit(`reset:${String(email).toLowerCase()}`, 3, 60 * 60_000)) return json({ error: 'rate_limited' }, 429)
  const p = await getP()
  const token = await p.forgotPassword({ collection: 'users', data: { email }, disableEmail: true })
  return json({ accepted: true, token: token ?? null })
}
```

**Datei `src/app/svc/v1/tokens/redeem/route.ts`**

```ts
import { getP, json, signed } from '@/lib/svc'
export async function POST(req: Request) {
  const s = await signed(req); if (s instanceof Response) return s
  const { token, password } = s.body as { token: string; password: string }
  const p = await getP()
  try { await p.resetPassword({ collection: 'users', data: { token, password }, overrideAccess: true }); return json({ ok: true }) }
  catch (e) { return json({ error: 'invalid_token_or_password', detail: (e as Error).message }, 400) }
}
```

**Datei `src/app/svc/v1/content/[kind]/route.ts`**

```ts
import { getP, json, rateLimit, sha256 } from '@/lib/svc'
export async function GET(req: Request, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params
  if (kind !== 'blog' && kind !== 'news') return json({ error: 'not_found' }, 404)
  const auth = req.headers.get('authorization') ?? ''
  const tok = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!tok || !rateLimit('read:' + sha256(tok).slice(0, 8), 600, 60_000)) return json({ error: 'unauthorized' }, 401)
  const p = await getP()
  const f = await p.find({ collection: 'read-tokens', where: { hash: { equals: sha256(tok) } }, limit: 1, overrideAccess: true })
  if (!f.docs[0]) return json({ error: 'unauthorized' }, 401)
  await p.update({ collection: 'read-tokens', id: f.docs[0].id, data: { uses: ((f.docs[0] as any).uses ?? 0) + 1 }, overrideAccess: true })
  const posts = await p.find({ collection: 'posts', where: { and: [{ kind: { equals: kind } }, { _status: { equals: 'published' } }] }, overrideAccess: true, draft: false, limit: 50 })
  return json({ items: posts.docs.map((d: any) => ({ id: d.id, title: d.title, locale: d.locale, body: d.body })) })
}
```

**Datei `scripts/seed.ts`**

```ts
import { getPayload } from 'payload'
import config from '../src/payload.config'
import { sha256 } from '../src/lib/shared'
const p = await getPayload({ config })
const ex = await p.find({ collection: 'operators', where: { email: { equals: 'admin@example.test' } }, limit: 1 })
if (!ex.docs[0]) await p.create({ collection: 'operators', data: { email: 'admin@example.test', password: 'Operator-Pass-123', role: 'admin' } })
const t = await p.find({ collection: 'read-tokens', where: { hash: { equals: sha256('spike-read-token-0123456789') } }, limit: 1 })
if (!t.docs[0]) await p.create({ collection: 'read-tokens', data: { hash: sha256('spike-read-token-0123456789'), label: 'marketing' } })
const n = await p.count({ collection: 'posts' })
if (!n.totalDocs) {
  await p.create({ collection: 'posts', data: { kind: 'blog', locale: 'de', title: 'Veröffentlicht', body: 'x', _status: 'published' } })
  await p.create({ collection: 'posts', data: { kind: 'blog', locale: 'de', title: 'Entwurf', body: 'geheim', _status: 'draft' } })
  await p.create({ collection: 'posts', data: { kind: 'news', locale: 'en', title: 'News live', body: 'y', _status: 'published' } })
}
console.log('seeded'); process.exit(0)
```

**Datei `scripts/o14.ts`**

```ts
import { getPayload } from 'payload'
import config from '../src/payload.config'
import pg from 'pg'
import crypto from 'node:crypto'
import { pkceChallenge, sha256 } from '../src/lib/shared'

const out = (k: string, v: unknown) => console.log(`[${k}] ${typeof v === 'string' ? v : JSON.stringify(v)}`)
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' ').slice(0, 160)
const run = Date.now().toString(36)
const payload = await getPayload({ config })
const db = new pg.Client({ connectionString: process.env.DATABASE_URL }); await db.connect()
const q = async (s: string, p: unknown[] = []) => (await db.query(s, p)).rows
const GOOD = 'Sup3rGeheim123'
const mk = (n: string) => `${n}${run}@example.test`
const attempt = async (f: () => Promise<unknown>) => { try { await f(); return 'OK' } catch (e) { return 'FEHLER: ' + msg(e) } }

// ---- 1 Passwort-Regel
out('1a regel ohne hook (operators, Payload-Standard) "abc"', await attempt(() => payload.create({ collection: 'operators', data: { email: mk('op0'), password: 'abc', role: 'admin' } })))
out('1b users "kurz1" (<10)', await attempt(() => payload.create({ collection: 'users', data: { email: mk('p1'), password: 'kurz1' }, disableVerificationEmail: true })))
out('1c users "nurbuchstaben" (keine Zahl)', await attempt(() => payload.create({ collection: 'users', data: { email: mk('p2'), password: 'nurbuchstaben' }, disableVerificationEmail: true })))
out('1d users GOOD', await attempt(() => payload.create({ collection: 'users', data: { email: mk('p3'), password: GOOD }, disableVerificationEmail: true })))
const h = await q('select hash, salt from users where email=$1', [mk('p3')])
out('1e hash-Format', { prefix: h[0].hash.slice(0, 24), hashHexLen: h[0].hash.length, saltHexLen: h[0].salt.length })

// ---- 2 Sperre
const u = mk('lock'); await payload.create({ collection: 'users', data: { email: u, password: GOOD }, disableVerificationEmail: true })
const res: string[] = []
for (let i = 1; i <= 5; i++) res.push(await attempt(() => payload.login({ collection: 'users', data: { email: u, password: 'falsch12345' } })))
out('2a 5 Fehlversuche', [...new Set(res)])
out('2b 6. Versuch mit RICHTIGEM Passwort', await attempt(() => payload.login({ collection: 'users', data: { email: u, password: GOOD } })))
out('2c unbekanntes Konto', await attempt(() => payload.login({ collection: 'users', data: { email: mk('gibtsnicht'), password: GOOD } })))
out('2d lock_until/login_attempts', await q('select login_attempts, lock_until from users where email=$1', [u]))
await q("update users set lock_until = now() - interval '1 minute' where email=$1", [u])
await q('update users set _verified=true where email=$1',[u])
out('2e nach Ablauf der Sperre, richtiges Passwort', await attempt(() => payload.login({ collection: 'users', data: { email: u, password: GOOD } })))

// ---- 3 Reset + Einmal-Token
const r = mk('reset'); await payload.create({ collection: 'users', data: { email: r, password: GOOD }, disableVerificationEmail: true })
const tok = await payload.forgotPassword({ collection: 'users', data: { email: r }, disableEmail: true })
out('3a forgotPassword(disableEmail) gibt Token zurück', { type: typeof tok, len: String(tok).length })
const row = (await q('select reset_password_token, reset_password_expiration from users where email=$1', [r]))[0]
out('3b Token in der DB', { gleichKlartext: row.reset_password_token === tok, sha256: row.reset_password_token === sha256(String(tok)), laufzeitTage: ((new Date(row.reset_password_expiration).getTime() - Date.now()) / 864e5).toFixed(2) })
out('3c forgotPassword unbekannte Adresse', await attempt(async () => { const x = await payload.forgotPassword({ collection: 'users', data: { email: mk('nobody') }, disableEmail: true }); out('3c Rückgabe', String(x)) }))
out('3d resetPassword schwaches PW', await attempt(() => payload.resetPassword({ collection: 'users', data: { token: String(tok), password: 'kurz' }, overrideAccess: true })))
out('3e resetPassword gutes PW', await attempt(() => payload.resetPassword({ collection: 'users', data: { token: String(tok), password: 'Neu12345678x' }, overrideAccess: true })))
out('3f zweite Einlösung', await attempt(() => payload.resetPassword({ collection: 'users', data: { token: String(tok), password: 'Nochmal12345x' }, overrideAccess: true })))
await q("update users set reset_password_expiration = now() - interval '1 second' where email=$1", [r])
const t2 = await payload.forgotPassword({ collection: 'users', data: { email: r }, disableEmail: true })
await q("update users set reset_password_expiration = now() - interval '1 second' where email=$1", [r])
out('3g abgelaufener Token', await attempt(() => payload.resetPassword({ collection: 'users', data: { token: String(t2), password: 'Nochmal12345x' }, overrideAccess: true })))
const a = await payload.forgotPassword({ collection: 'users', data: { email: r }, disableEmail: true })
const b = await payload.forgotPassword({ collection: 'users', data: { email: r }, disableEmail: true })
out('3h 2 Anforderungen direkt hintereinander (disableEmail): kein minRequestInterval', { gleich: a === b })

// ---- 4 Verifizierungs-Token
const v = mk('verify'); await payload.create({ collection: 'users', data: { email: v, password: GOOD }, disableVerificationEmail: true })
const vrow = (await q('select _verificationtoken, _verified from users where email=$1', [v]))[0]
out('4a Verifizierungstoken (Spalten)', Object.keys(vrow).map((k) => k) )
out('4b Token klar in DB, kein Ablaufdatum', { tokenLen: String(vrow._verificationtoken).length, hatAblaufSpalte: (await q("select column_name from information_schema.columns where table_name='users' and column_name ilike '%verif%'")).map((c: any) => c.column_name) })
out('4c verifyEmail', await attempt(() => payload.verifyEmail({ collection: 'users', token: vrow._verificationtoken })))
out('4d verifyEmail zweites Mal', await attempt(() => payload.verifyEmail({ collection: 'users', token: vrow._verificationtoken })))

// ---- 5 Sitzungen / JWT
const s = mk('sess'); await payload.create({ collection: 'users', data: { email: s, password: GOOD }, disableVerificationEmail: true })
await q('update users set _verified=true where email=$1', [s])
const lg = await payload.login({ collection: 'users', data: { email: s, password: GOOD } })
const claims = JSON.parse(Buffer.from(lg.token!.split('.')[1]!, 'base64url').toString())
out('5a JWT-Claims', { keys: Object.keys(claims), lebensdauerTage: ((claims.exp - claims.iat) / 86400).toFixed(1) })
const authOf = async () => (await payload.auth({ headers: new Headers({ Authorization: `JWT ${lg.token}` }) })).user
out('5b Token gültig', { user: (await authOf())?.email === s })
out('5c sessions-Zeilen', (await q('select count(*)::int n from users_sessions us join users u on u.id=us._parent_id where u.email=$1', [s]))[0])
await q('delete from users_sessions where _parent_id=(select id from users where email=$1)', [s])
out('5d nach Löschen der Session (Widerruf)', { user: (await authOf())?.email ?? null })
const lg2 = await payload.login({ collection: 'users', data: { email: s, password: GOOD } })
const tk = await payload.forgotPassword({ collection: 'users', data: { email: s }, disableEmail: true })
await payload.resetPassword({ collection: 'users', data: { token: String(tk), password: 'Wieder12345xy' }, overrideAccess: true })
out('5e nach Passwort-Reset: alte Sitzung', { user: (await payload.auth({ headers: new Headers({ Authorization: `JWT ${lg2.token}` }) })).user?.email ?? null })

// ---- 6 Postfach-Index
await q(`create unique index if not exists users_trial_canonical_idx on users (email_canonical) where email_verified_at is not null and trial_guarded`)
const dom = `mb${run}.test`
const mkU = (local: string) => payload.create({ collection: 'users', data: { email: `${local}@${dom}`, password: GOOD }, disableVerificationEmail: true })
const [x1, x2, x3] = await Promise.all([mkU('max.mustermann'), mkU('max.mustermann+shop'), mkU('Max.Mustermann+b')])
out('6a kanonische Adresse', (await q('select email, email_canonical from users where id = any($1)', [[x1.id, x2.id, x3.id]])).map((r: any) => r.email_canonical))
const g1 = await payload.create({ collection: 'users', data: { email: `a.b.c${run}@gmail.com`, password: GOOD }, disableVerificationEmail: true })
const g2 = await payload.create({ collection: 'users', data: { email: `abc${run}+x@googlemail.com`, password: GOOD }, disableVerificationEmail: true })
out('6b Gmail', (await q('select email_canonical from users where id = any($1)', [[g1.id, g2.id]])).map((r: any) => r.email_canonical))
const confirm = (id: number | string) => payload.update({ collection: 'users', id, data: { emailVerifiedAt: new Date().toISOString() }, overrideAccess: true })
const race = await Promise.allSettled([x1.id, x2.id, x3.id].map(confirm))
out('6c 3 gleichzeitige Bestätigungen', race.map((x) => (x.status === 'fulfilled' ? 'OK' : 'FEHLER: ' + msg(x.reason))))
out('6d bestätigt in DB', (await q('select count(*)::int n from users where email_canonical=$1 and email_verified_at is not null', [`max.mustermann@${dom}`]))[0])
const race2 = await Promise.allSettled([g1.id, g2.id].map(confirm))
out('6e Gmail-Rennen', race2.map((x) => (x.status === 'fulfilled' ? 'OK' : 'FEHLER')))

// ---- 7 Mobile PKCE (eigener Ablauf, Local API)
const verifier = crypto.randomBytes(48).toString('base64url'); const challenge = pkceChallenge(verifier)
const code = 'bloom_mac_' + crypto.randomBytes(32).toString('base64url'); const state = crypto.randomBytes(24).toString('base64url')
await payload.create({ collection: 'mobile-auth-codes', data: { codeHash: sha256(code), challenge, stateHash: sha256(state), userId: String(x1.id), expiresAt: new Date(Date.now() + 300000).toISOString() }, overrideAccess: true })
async function redeem(c: string, ver: string, st: string) {
  const f = await payload.find({ collection: 'mobile-auth-codes', where: { codeHash: { equals: sha256(c) } }, overrideAccess: true, limit: 1 })
  const d = f.docs[0] as any; if (!d || d.usedAt || new Date(d.expiresAt) < new Date()) throw new Error('code ungültig')
  if (pkceChallenge(ver) !== d.challenge || sha256(st) !== d.stateHash) throw new Error('PKCE/state falsch')
  const upd = await db.query('update "mobile_auth_codes" set used_at=now() where id=$1 and used_at is null returning id', [d.id])
  if (!upd.rowCount) throw new Error('bereits benutzt'); return d.userId
}
out('7a falscher Verifier', await attempt(() => redeem(code, crypto.randomBytes(48).toString('base64url'), state)))
out('7b richtig', await attempt(() => redeem(code, verifier, state)))
out('7c Wiederholung', await attempt(() => redeem(code, verifier, state)))

// ---- 8 Betreiber: Konten gesperrt? Sperre auch hier
out('8 operators auth-Felder', (await q("select column_name from information_schema.columns where table_name='operators' order by 1")).map((c: any) => c.column_name).filter((c: string) => /lock|login|reset|hash|salt|session|api|verif/.test(c)))
await db.end(); process.exit(0)
```

**Datei `scripts/o16.mjs`**

```js
import crypto from 'node:crypto'
const B = 'http://localhost:3939'
const KEY = 'spike-app-hmac-key-not-real'
const sha = (v) => crypto.createHash('sha256').update(v).digest('hex')
const sign = (m, path, body, ts, nonce) => crypto.createHmac('sha256', KEY).update([m, path, sha(body), ts, nonce].join('\n')).digest('hex')
async function call(method, path, { body, headers = {}, signed } = {}) {
  const text = body === undefined ? '' : JSON.stringify(body)
  const h = { ...headers }; if (h.cookie) h.origin = 'http://localhost:3939'
  if (body !== undefined) h['content-type'] = 'application/json'
  if (signed) { const ts = String(signed.ts ?? Date.now()), nonce = signed.nonce ?? crypto.randomUUID(); h['x-svc-timestamp'] = ts; h['x-svc-nonce'] = nonce; h['x-svc-signature'] = signed.sig ?? sign(method, path, text, ts, nonce) }
  const r = await fetch(B + path, { method, headers: h, body: body === undefined ? undefined : text, redirect: 'manual' })
  const t = await r.text(); return { status: r.status, text: t.slice(0, 110).replace(/\s+/g, ' '), headers: r.headers }
}
const row = (label, r) => console.log(`${label.padEnd(58)} -> ${r.status} ${r.text.slice(0, 70)}`)
const run = Date.now().toString(36)
const mail = `svc${run}@example.test`

console.log('## A. /svc/v1 neben /api (eigene Routen, Signatur der App)')
row('GET  /svc/v1/health/ready', await call('GET', '/svc/v1/health/ready'))
row('POST /svc/v1/auth/login ohne Signatur', await call('POST', '/svc/v1/auth/login', { body: { email: 'a@b.c', password: 'x' } }))
row('POST /svc/v1/auth/login falsche Signatur', await call('POST', '/svc/v1/auth/login', { body: { email: 'a@b.c', password: 'x' }, signed: { sig: 'ab'.repeat(32) } }))
row('POST /svc/v1/auth/login Zeitstempel -5 min', await call('POST', '/svc/v1/auth/login', { body: { email: 'a@b.c', password: 'x' }, signed: { ts: Date.now() - 300000 } }))
const n = crypto.randomUUID()
row('POST /svc/v1/auth/login signiert, unbekanntes Konto', await call('POST', '/svc/v1/auth/login', { body: { email: 'a@b.c', password: 'x' }, signed: { nonce: n } }))
const ts = String(Date.now()); const body = { email: 'a@b.c' }
const r1 = await fetch(B + '/svc/v1/password-resets', { method: 'POST', headers: { 'content-type': 'application/json', 'x-svc-timestamp': ts, 'x-svc-nonce': 'replay-' + run, 'x-svc-signature': sign('POST', '/svc/v1/password-resets', JSON.stringify(body), ts, 'replay-' + run) }, body: JSON.stringify(body) })
const r2 = await fetch(B + '/svc/v1/password-resets', { method: 'POST', headers: { 'content-type': 'application/json', 'x-svc-timestamp': ts, 'x-svc-nonce': 'replay-' + run, 'x-svc-signature': sign('POST', '/svc/v1/password-resets', JSON.stringify(body), ts, 'replay-' + run) }, body: JSON.stringify(body) })
console.log(`${'Wiederholung derselben Nonce'.padEnd(58)} -> erster Aufruf ${r1.status}, Wiederholung ${r2.status}`)

console.log('\n## B. Reset-Token zurückgeben, einlösen (App versendet)')
// legit account created via Local API happens in other script; create via admin op below. Use existing run user from o14? create here through operator session
const lg = await call('POST', '/api/operators/login', { body: { email: 'admin@example.test', password: 'Operator-Pass-123' } })
const cookie = (lg.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
console.log(`operator login /api/operators/login -> ${lg.status}, Cookie gesetzt: ${cookie.includes('payload-token')}`)
const cu = await call('POST', '/api/users', { headers: { cookie }, body: { email: mail, password: 'Sup3rGeheim123' } })
row('Operator legt Nutzer an (POST /api/users mit Operator-Cookie)', cu)
const pr = await fetch(B + '/svc/v1/password-resets', { method: 'POST', headers: (() => { const t = String(Date.now()), nn = crypto.randomUUID(); const b = JSON.stringify({ email: mail }); return { 'content-type': 'application/json', 'x-svc-timestamp': t, 'x-svc-nonce': nn, 'x-svc-signature': sign('POST', '/svc/v1/password-resets', b, t, nn) } })(), body: JSON.stringify({ email: mail }) })
const prj = await pr.json(); console.log(`POST /svc/v1/password-resets -> ${pr.status} accepted=${prj.accepted} tokenLen=${prj.token?.length}`)
const un = await call('POST', '/svc/v1/password-resets', { body: { email: 'nobody@example.test' }, signed: {} })
console.log(`POST /svc/v1/password-resets unbekanntes Konto -> ${un.status} ${un.text}`)
row('redeem schwaches Passwort', await call('POST', '/svc/v1/tokens/redeem', { body: { token: prj.token, password: 'kurz' }, signed: {} }))
row('redeem gutes Passwort', await call('POST', '/svc/v1/tokens/redeem', { body: { token: prj.token, password: 'Neu12345678x' }, signed: {} }))
row('redeem zweites Mal', await call('POST', '/svc/v1/tokens/redeem', { body: { token: prj.token, password: 'Neu12345678y' }, signed: {} }))
// verify the user (verify:true) via operator PATCH then login via svc
const list = await (await fetch(B + `/api/users?where[email][equals]=${encodeURIComponent(mail)}`, { headers: { cookie, origin: B } })).json()
const uid = list.docs?.[0]?.id
row('Operator setzt _verified (PATCH /api/users/:id)', await call('PATCH', '/api/users/' + uid, { headers: { cookie }, body: { _verified: true } }))
row('POST /svc/v1/auth/login richtig', await call('POST', '/svc/v1/auth/login', { body: { email: mail, password: 'Neu12345678x' }, signed: {} }))
let last
for (let i = 0; i < 11; i++) last = await call('POST', '/svc/v1/auth/login', { body: { email: mail, password: 'falsch12345' }, signed: {} })
row('11 Fehlversuche in Folge, letzter (Handler-Limit 10/15 min)', last)

console.log('\n## C. Lese-Token (Option T) auf /svc/v1/content')
row('GET /svc/v1/content/blog ohne Token', await call('GET', '/svc/v1/content/blog'))
row('GET /svc/v1/content/blog falsches Token', await call('GET', '/svc/v1/content/blog', { headers: { authorization: 'Bearer nope' } }))
const ok = await call('GET', '/svc/v1/content/blog', { headers: { authorization: 'Bearer spike-read-token-0123456789' } })
console.log(`GET /svc/v1/content/blog gültiges Token -> ${ok.status}`, ok.text)
row('GET /svc/v1/content/news gültiges Token', await call('GET', '/svc/v1/content/news', { headers: { authorization: 'Bearer spike-read-token-0123456789' } }))
row('GET /svc/v1/content/users (nicht erlaubte Art)', await call('GET', '/svc/v1/content/users', { headers: { authorization: 'Bearer spike-read-token-0123456789' } }))
row('Token auf /api/posts (kein Payload-Auth)', await call('GET', '/api/posts', { headers: { authorization: 'Bearer spike-read-token-0123456789' } }))
row('Token auf /api/users', await call('GET', '/api/users', { headers: { authorization: 'Bearer spike-read-token-0123456789' } }))
row('Token auf /admin', await call('GET', '/admin', { headers: { authorization: 'Bearer spike-read-token-0123456789' } }))

console.log('\n## D. Pfad-Inventar unauthentifiziert (kein Cookie)')
const probes = [['GET', '/'], ['GET', '/admin'], ['GET', '/admin/login'], ['GET', '/api'], ['GET', '/api/users'], ['POST', '/api/users/login'], ['POST', '/api/users/forgot-password'], ['POST', '/api/users/first-register'], ['GET', '/api/users/me'], ['GET', '/api/posts'], ['GET', '/api/read-tokens'], ['GET', '/api/access'], ['GET', '/api/payload-preferences/x'], ['GET', '/api/operators'], ['GET', '/api/operators/me'], ['POST', '/api/operators/login'], ['GET', '/api/graphql'], ['POST', '/api/graphql'], ['GET', '/api/graphql-playground'], ['GET', '/api/_openapi'], ['GET', '/api/openapi.json'], ['GET', '/api/globals'], ['GET', '/api/payload-jobs/run'], ['GET', '/robots.txt'], ['GET', '/svc/v1'], ['GET', '/svc/v1/nope'], ['GET', '/my-route']]
for (const [m, p] of probes) row(`${m} ${p}`, await call(m, p, m === 'POST' ? { body: {} } : {}))

console.log('\n## E. Pfad-Inventar mit Operator-Cookie (Admin-UI braucht /api)')
for (const [m, p] of [['GET', '/api/users'], ['GET', '/api/posts'], ['GET', '/api/access'], ['GET', '/api/operators/me'], ['GET', '/admin'], ['GET', '/api/graphql-playground']]) row(`${m} ${p}`, await call(m, p, { headers: { cookie } }))
```

**Datei `scripts/inv.ts`**

```ts
import { getPayload } from 'payload'
import config from '../src/payload.config'
const p = await getPayload({ config })
const seen = new Set<string>()
for (const e of p.config.endpoints) seen.add(`${e.method.toUpperCase()} /api${e.path} (global)`)
for (const c of p.config.collections) for (const e of c.endpoints || []) seen.add(`${e.method.toUpperCase()} /api/${c.slug}${e.path}`)
console.log([...seen].sort().join('\n')); console.log('n=', seen.size)
process.exit(0)
```
