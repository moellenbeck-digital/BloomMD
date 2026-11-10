# Desktop-Verbindungsprofile

BloomMD Desktop verwaltet die Arbeitsquelle über ein aktives Verbindungsprofil:

- `local` zeigt auf den aktuell gewählten lokalen Ordner.
- `remote` verweist über eine stabile Profil-ID auf genau einen gespeicherten Server.
- Ein Profil enthält Name, Server-URL, letzte Workspace-ID und den letzten erfolgreichen Verbindungszeitpunkt.
- Es gibt zu jedem Zeitpunkt höchstens einen aktiven Remote-Sync-Provider.

## Zugangstoken

Persönliche `bloom_pat_`-Tokens werden nicht in `.bloommd-desktop.json`, Browser-Storage,
Diagnosen oder Logs gespeichert. Sie liegen im Secure Store des Betriebssystems (je Plattform
siehe unten); die Settings-Datei enthält nur die Token-Referenz. Die App reicht das Token
ausschließlich im Main-Prozess an `ApiFileStore` weiter.

Die frühere Einzelserver-Einstellung `remote.accessToken` wird beim ersten Start in ein Profil
überführt. Die Datei wird erst nach erfolgreichem Schreiben in den Secure Store umgeschrieben. Wenn ein
Server nicht erreichbar ist, bleibt das Profil erhalten und BloomMD arbeitet lokal weiter.

## Wechselverhalten

Ein Zielserver wird vor dem Wechsel mit Workspace- und Dateizugriff validiert. Bei einem Fehler
bleibt die bisherige Verbindung aktiv. Der Wechsel nach Lokal beendet nur den aktiven Sync und
ändert nicht die gespeicherten Serverprofile. Das Löschen eines Profils verlangt eine Bestätigung
und entfernt auch den zugehörigen Eintrag im Secure Store.

## Secure-Store-Backends je Plattform

Alle Backends liegen in `packages/desktop/src/bun/secure-storage.ts` hinter derselben
Schnittstelle (`get`/`set`/`delete`). Die Service-Kennung ist
`io.moellenbeck-digital.bloommd.connection-profile`; der Eintrag ist je Profil-Schlüssel getrennt.

| Plattform | Backend | Hinweise |
|---|---|---|
| macOS | Keychain (Generic Password, über das `security`-CLI) | Das Token steht beim Schreiben hexkodiert in den Argumenten von `security`, nie im Klartext. |
| Linux | Secret Service (über `secret-tool` aus libsecret) | Das Token geht über stdin, nicht über Argumente. Ohne laufenden oder entsperrten Secret-Service-Anbieter meldet BloomMD `SECURE_STORAGE_UNAVAILABLE`. |
| Windows | Windows Credential Manager (generische Anmeldeinformation, Aufruf von `advapi32.dll` im Prozess) | Der Eintrag gehört dem angemeldeten Windows-Benutzer, andere Benutzer desselben Rechners sehen ihn nicht. Er bleibt über Abmeldungen auf diesem Rechner erhalten (`CRED_PERSIST_LOCAL_MACHINE`), wandert aber nicht mit einem Roaming-Profil. Das Token läuft nur im Speicher des BloomMD-Prozesses und erscheint weder in Argumenten noch in Umgebungsvariablen noch in einer Datei. |
| andere | kein Backend | `set` schlägt mit `SECURE_STORAGE_UNAVAILABLE` fehl. |

Auf keiner Plattform gibt es einen Klartext-Fallback: Ist der Secure Store nicht erreichbar oder
verweigert er den Zugriff, wird das Token nicht anderswo abgelegt. Unter Linux, Windows und auf
Plattformen ohne Backend schlagen Cloud-Verbindungen dann mit `SECURE_STORAGE_UNAVAILABLE` fehl;
unter macOS meldet ein fehlgeschlagener Keychain-Zugriff einen gewöhnlichen Fehler ohne diesen
Code. Fehlermeldungen enthalten nie das Token.

Das Windows-Backend ist durch Unit-Tests mit einem simulierten Credential Manager belegt, aber
noch nicht auf einem echten Windows-System geprüft; ein Windows-Build gehört noch nicht zur
Beta-Auslieferung (siehe [BETA-SCOPE.md](BETA-SCOPE.md)).
