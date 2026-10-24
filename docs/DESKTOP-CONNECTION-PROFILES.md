# Desktop-Verbindungsprofile

BloomMD Desktop verwaltet die Arbeitsquelle über ein aktives Verbindungsprofil:

- `local` zeigt auf den aktuell gewählten lokalen Ordner.
- `remote` verweist über eine stabile Profil-ID auf genau einen gespeicherten Server.
- Ein Profil enthält Name, Server-URL, letzte Workspace-ID und den letzten erfolgreichen Verbindungszeitpunkt.
- Es gibt zu jedem Zeitpunkt höchstens einen aktiven Remote-Sync-Provider.

## Zugangstoken

Persönliche `bloom_pat_`-Tokens werden nicht in `.bloommd-desktop.json`, Browser-Storage,
Diagnosen oder Logs gespeichert. Auf macOS liegen sie als Generic-Password-Einträge im Keychain;
die Settings-Datei enthält nur die Token-Referenz. Die App reicht das Token ausschließlich im
Main-Prozess an `ApiFileStore` weiter.

Die frühere Einzelserver-Einstellung `remote.accessToken` wird beim ersten Start in ein Profil
überführt. Die Datei wird erst nach erfolgreichem Keychain-Schreiben umgeschrieben. Wenn ein
Server nicht erreichbar ist, bleibt das Profil erhalten und BloomMD arbeitet lokal weiter.

## Wechselverhalten

Ein Zielserver wird vor dem Wechsel mit Workspace- und Dateizugriff validiert. Bei einem Fehler
bleibt die bisherige Verbindung aktiv. Der Wechsel nach Lokal beendet nur den aktiven Sync und
ändert nicht die gespeicherten Serverprofile. Das Löschen eines Profils verlangt eine Bestätigung
und entfernt auch den zugehörigen Keychain-Eintrag.

Die M1-Beta verwendet macOS Keychain als native Secure-Storage-Implementierung. Linux- und
Windows-Backends werden vor den jeweiligen Plattform-Betas ergänzt; es gibt dort keinen
unsicheren Klartext-Fallback.
