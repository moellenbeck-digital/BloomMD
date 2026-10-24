---
title: "Anonyme Produktanalyse bleibt cookielos"
description: "BloomMD misst öffentliche Nutzung ohne Markdown-Inhalte, Namen, E-Mail-Adressen oder Tokens zu übertragen."
date: 2026-08-23
commitDate: 2026-08-23
tags:
  - Datenschutz
  - Plausible
  - Marketing
version: "0.2.2"
---

# Anonyme Produktanalyse bleibt cookielos

BloomMD verwendet Plausible für anonyme Pageviews und ausgewählte Produkt-Events auf der Marketingseite. Die Einbindung lädt die self-hosted Plausible-Instanz direkt und benötigt keine Cookies.

Getrackt werden nur freigegebene Ereignisse wie Demo-, Login- oder Kontakt-Klicks. Markdown-Inhalte, Dateinamen, Node-Titel, Formularinhalte und personenbezogene Daten bleiben außerhalb der Events.

So erhalten wir ein begrenztes Signal zur Nutzung der öffentlichen Seite, ohne den lokalen-first Ansatz mit Inhalts-Tracking zu unterlaufen.

**Commit-Datum:** 23. August 2026
