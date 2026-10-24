---
title: "Remote-Dokumente lassen sich jetzt auch aktiv löschen"
description: "BloomMD trennt eine aktive Sync-Session kontrolliert, bevor ein Remote-Dokument gelöscht wird."
date: 2026-09-07
commitDate: 2026-09-07
tags:
  - Sync
  - Collaboration
  - Web
  - Desktop
version: "0.4.3"
---

# Remote-Dokumente lassen sich jetzt auch aktiv löschen

Ein geöffnetes Remote-Dokument sollte nicht verhindern, dass es aus dem Workspace entfernt wird. BloomMD behandelt das Löschen jetzt als kontrollierten Ablauf für Web-App und Desktop.

## Session sauber beenden, Dokument löschen, Verbindung wiederherstellen

Vor dem serverseitigen Löschen wird eine aktive Sync-Room-Verbindung sauber getrennt. Danach löscht der Server das Dokument und die Dateiliste wird aktualisiert. Wenn der Löschvorgang fehlschlägt, versucht BloomMD die vorherige Verbindung wiederherzustellen und zeigt den konkreten Fehler an.

So bleiben aktive Yjs-Sitzungen und serverseitige Dokumentoperationen getrennt, ohne dass ein Löschversuch stillschweigend verloren geht.

**Commit-Datum:** 7. September 2026
