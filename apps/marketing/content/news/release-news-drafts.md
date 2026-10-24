---
title: "Release-News entstehen jetzt als prüfbare Entwürfe"
description: "Veröffentlichte BloomMD-Releases können automatisch zweisprachige News-Entwürfe für die Marketingseite vorbereiten."
date: 2026-08-28
commitDate: 2026-08-28
tags:
  - News
  - Releases
  - Marketing
version: "0.2.12"
sourceUrl: "https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.2.12"
---

# Release-News entstehen jetzt als prüfbare Entwürfe

Neue BloomMD-Releases sollen sichtbar werden, ohne ungeprüfte Commit-Nachrichten direkt zu veröffentlichen. Die Marketingseite unterstützt deshalb einen redaktionellen Ablauf für Release-News.

## Von GitHub zum Draft

Wenn ein stabiles GitHub-Release veröffentlicht wird, erzeugt die CI daraus einen deutsch- und englischsprachigen Markdown-Entwurf. Der Entwurf landet in einem Pull Request und kann vor dem Merge geprüft, gekürzt und ergänzt werden.

Die öffentlichen News bleiben damit dateibasiert und nachvollziehbar. Private Issues, interne Kommentare, Zugangsdaten und andere sensible Release-Inhalte werden vor der Erstellung des Entwurfs herausgefiltert.

Nach der redaktionellen Freigabe erscheint der Beitrag unter `/news`, wird in Sitemap und RSS-Feed aufgenommen und erhält eine eigene Detailseite. Blog-Beiträge bleiben davon getrennt und sind für längere, redaktionelle Texte gedacht.

**Commit-Datum:** 28. August 2026 · [Release ansehen](https://github.com/moellenbeck-digital/BloomMD/releases/tag/v0.2.12)
