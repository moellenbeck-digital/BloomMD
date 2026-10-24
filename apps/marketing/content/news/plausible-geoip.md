---
title: "Plausible sieht jetzt die echte Besucherregion"
description: "BloomMD lädt Plausible direkt und vermeidet Proxy-Verfälschungen bei der anonymen GeoIP-Auswertung."
date: 2026-08-31
commitDate: 2026-08-31
tags:
  - Datenschutz
  - Plausible
  - Marketing
version: "0.4.1"
---

# Plausible sieht jetzt die echte Besucherregion

Anonyme Produktanalyse ist nur dann hilfreich, wenn die technischen Messdaten nicht durch den eigenen Proxy verfälscht werden. BloomMD lädt Plausible deshalb direkt von der selbst gehosteten Instanz.

## Direkter Weg statt App-Rewrite

Script und Events gehen direkt an `plausible.moellenbeck-digital.io`. Der bisherige serverseitige Next.js-Rewrite über `bloommd.io` entfällt. Dadurch erhält Plausible die echte Besucher-IP für die GeoIP-Auswertung und nicht die Adresse der Marketing-Infrastruktur.

Die Einbindung bleibt cookielos und überträgt weiterhin keine Markdown-Inhalte, Dateinamen, Node-Titel oder Zugangstokens. Erfasst werden nur freigegebene anonyme Seitenaufrufe und Produkt-Events.

**Commit-Datum:** 31. August 2026
