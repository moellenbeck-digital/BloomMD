---
title: "Linux-Serverprofile speichern Zugangsdaten jetzt sicher"
description: "BloomMD nutzt unter Linux den systemweiten Secret Service, damit Serverprofile nach einem Neustart sicher weiterverwendet werden können."
date: 2026-09-05
commitDate: 2026-09-05
tags:
  - Linux
  - Sicherheit
  - Sync
  - Desktop
version: "0.5.3"
sourceUrl: "https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.5.3"
---

# Linux-Serverprofile speichern Zugangsdaten jetzt sicher

Ein Serverprofil ist erst dann praktisch, wenn es beim nächsten Start noch vorhanden ist — ohne dass das persönliche Zugriffstoken in einer normalen Einstellungsdatei liegt. BloomMD unterstützt dafür unter Linux jetzt den standardisierten Secret Service.

## Profil bleibt, Token bleibt geschützt

Die Profilinformationen werden lokal gespeichert, das Token selbst liegt im systemweiten Schlüsselbund. BloomMD kann Profile nach einem Neustart wieder anbieten, ohne Geheimnisse in JSON-Dateien, Kommandozeilenargumente oder Logs zu schreiben.

Fehlt der Secret Service oder ist der Schlüsselbund gesperrt, zeigt die App eine konkrete Linux-Hilfe an. Die Lösung ist nicht an GNOME Keyring gebunden, sondern nutzt die standardisierte `org.freedesktop.secrets`-Schnittstelle.

**Release-Datum:** 5. September 2026 · [Release ansehen](https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.5.3)
