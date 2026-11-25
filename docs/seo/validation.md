# Korrekturrunde 1: reproduzierbare lokale Prüfung

```sh
bun run --cwd apps/marketing test
bun run --cwd apps/marketing build
bun run --cwd apps/marketing start --port 3330
# In einem zweiten Terminal:
python3 docs/seo/audit.py http://localhost:3330 > docs/seo/local-after.jsonl
curl -fsSL https://schema.org/version/latest/schemaorg-current-https.jsonld -o /tmp/schemaorg.json
python3 docs/seo/schema-check.py docs/seo/local-after.jsonl /tmp/schemaorg.json
```

Tester-Vokabular vom 25.11.2026 SHA256: `0a4b8c4c910fc831ec8695196510973390906a5ee34dc6b862dfec4d21a12f74`.
Latest ist beweglich: bei Wiederholung Hash vergleichen. Der Validator stammt aus der unabhängigen Testerprüfung, jetzt ohne feste /tmp-Eingabepfade. Er prüft Typ-/Property-Existenz, geerbte Domains und ausgewählte Objekt-/Skalarranges. Kein vollständiger JSON-LD-, Rich-Results- oder semantischer Faktenvalidator. Kein Nachweis für alle Seiten.

Nur der Pinning-Test erhält 10 Sekunden Testdeadline für seinen unveränderten 5-Sekunden-Abort. Produktcode und Sicherheitsverhalten bleiben unverändert.
Build und Volltests liefen sequenziell auf dem lokalen Mac (kein geteilter Dev-Team-Pod).
