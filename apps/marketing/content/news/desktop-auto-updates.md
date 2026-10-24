---
title: "macOS-Updates kommen jetzt direkt aus BloomMD"
description: "Die Desktop-App prüft stabile Updates und lädt sie über den BloomMD-Updatepfad."
date: 2026-08-23
commitDate: 2026-08-23
tags:
  - macOS
  - Updates
  - Desktop
version: "0.2.4"
---

# macOS-Updates kommen jetzt direkt aus BloomMD

Die macOS-App kann stabile Updates jetzt selbst prüfen und den Download im About-Dialog anzeigen. Die Installation erfolgt erst nach ausdrücklicher Bestätigung.

Der Downloadpfad läuft über BloomMD, während die Release-Artefakte im CI gebaut, geprüft und veröffentlicht werden. Dadurch kann die App auf neue Builds hinweisen, ohne die GitHub-Release-Adresse in der Oberfläche offenzulegen.

Für die Closed Beta bleibt die Vertrauenskette separat: Der damalige Build ist ad-hoc signiert und noch nicht notarisiert.

**Commit-Datum:** 23. August 2026
