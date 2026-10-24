---
title: "Remote-Verbindungen verbinden sich kontrolliert neu"
description: "BloomMD unterscheidet temporäre Netzwerkunterbrechungen von dauerhaften Sync-Fehlern und hält den Reconnect nachvollziehbar."
date: 2026-08-28
commitDate: 2026-08-28
tags:
  - Sync
  - Desktop
  - Collaboration
version: "0.2.12"
sourceUrl: "https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.2.12"
---

# Remote-Verbindungen verbinden sich kontrolliert neu

Eine kurz unterbrochene Netzwerkverbindung soll die Arbeit in BloomMD nicht aus dem Tritt bringen. Der Desktop-Client und der SyncProvider teilen sich deshalb jetzt einen klar definierten Reconnect-Ablauf.

## Ein Ablauf statt paralleler Schleifen

Temporäre Unterbrechungen werden mit exponentiellem Backoff und einer begrenzten Zahl von Versuchen behandelt. Für jeden neuen Versuch kann ein frisches Sync-Ticket angefordert werden; abgelaufene Tickets werden nicht endlos wiederverwendet.

Dauerhafte Zustände wie fehlende Berechtigung, ein nicht vorhandenes Dokument oder ein voller Raum wechseln in einen verständlichen Fehlerzustand. Dort kann die Verbindung bewusst manuell erneut gestartet werden.

Die Oberfläche unterscheidet zwischen offline, erneuter Verbindung und einem endgültig fehlgeschlagenen Reconnect. Bewusste Disconnects und Workspace-Wechsel lösen keinen nachlaufenden Reconnect aus.

**Commit-Datum:** 28. August 2026 · [Release ansehen](https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.2.12)
