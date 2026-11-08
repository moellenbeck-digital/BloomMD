---
title: "Plausible sieht jetzt die echte Besucherregion"
description: "BloomMD gibt Plausible die echte Besucherregion für die anonyme GeoIP-Auswertung mit; Stand 5. November 2026: Weiterleitung über die eigene Domain."
date: 2026-08-31
commitDate: 2026-08-31
tags:
  - Datenschutz
  - Plausible
  - Marketing
version: "0.4.1"
---

# Plausible sieht jetzt die echte Besucherregion

Anonyme Produktanalyse ist nur dann hilfreich, wenn die technischen Messdaten nicht durch den eigenen Proxy verfälscht werden. BloomMD hat Plausible deshalb zunächst direkt von der selbst gehosteten Instanz geladen.

## Direkter Weg statt App-Rewrite

Script und Events gingen damals direkt an die Plausible-Instanz. Der bisherige serverseitige Next.js-Rewrite über `bloommd.io` entfiel. Dadurch erhielt Plausible die echte Besucher-IP für die GeoIP-Auswertung und nicht die Adresse der Marketing-Infrastruktur.

## Aktualisierung vom 5. November 2026

Plausible läuft jetzt auf einer neuen Instanz unter `plausible.ops.moellenbeck-digital.io`. Der Browser lädt Script und Events wieder über die eigene Domain (`bloommd.io/_plausible/…`), BloomMD leitet sie serverseitig an die Instanz weiter. Die Aussage oben, dass der Rewrite entfällt und Script und Events direkt an die Instanz gehen, gilt damit nicht mehr.

Damit die GeoIP-Auswertung weiterhin stimmt, reicht die Weiterleitung die Besucher-IP und den User-Agent an Plausible durch. Cookies und alle anderen Header bleiben bei BloomMD. Die Content-Security-Policy erlaubt dafür keinen Fremdhost mehr, nur die eigene Domain.

Die Einbindung bleibt cookielos und überträgt weiterhin keine Markdown-Inhalte, Dateinamen, Node-Titel oder Zugangstokens. Erfasst werden nur freigegebene anonyme Seitenaufrufe und Produkt-Events.

**Commit-Datum:** 31. August 2026
