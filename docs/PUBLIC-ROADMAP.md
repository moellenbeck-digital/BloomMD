# Public Roadmap

Die oeffentliche Roadmap auf `bloommd.io/roadmap` zeigt bewusst kuratierte GitHub-Issues fuer
Beta-Tester und Interessierte. Sie ist kein vollstaendiger Spiegel des internen Project Boards.

## Ticket Freigeben

1. Das Issue muss im Repo `moellenbeck-digital/BloomMD` liegen.
2. Das Issue muss im Project `BloomMD Roadmap` stehen.
3. Der Project-Status muss einer oeffentlichen Spalte entsprechen:
   - `Feedback`
   - `Ready`
   - `In progress`
   - `In review`
4. Das Issue bekommt erst danach das Label `public-roadmap`.
5. Optional, aber empfohlen: Eine kurze kuratierte Zusammenfassung in den Issue-Body setzen:

```markdown
<!-- public-roadmap-summary: Kurzer Satz fuer Beta-Tester, ohne interne Details. -->
```

Diese Zusammenfassung wird auf der Roadmap angezeigt. Wenn sie fehlt, erzeugt BloomMD eine
reduzierte Beschreibung aus dem ersten passenden Absatz des Issue-Bodys.

## Nicht Oeffentlich Anzeigen

Kein `public-roadmap` fuer Issues mit:

- Security-, Secret-, Infrastruktur- oder Deployment-Details
- internen Launch-Gates, Abnahme-Checklisten oder Owner-only Entscheidungen
- privaten Pfaden, personenbezogenen Daten, Screenshots mit sensiblen Inhalten oder Tokens
- unfertigen Notizen, die fuer Beta-Tester nicht verstaendlich sind

Wenn ein Ticket intern bleiben soll, das Label `public-roadmap` entfernen. Die Marketing-App
aktualisiert GitHub-Daten regelmaessig; ein Pod-Restart ist dafuer nicht vorgesehen.

## Oeffentliche Tags

Tags werden aus GitHub-Labels und Titeln abgeleitet. Sichtbare Filter sind:

- `Mac`
- `Windows`
- `Linux`
- `Web`
- `Sync`
- `Obsidian`
- `Dokumentation`
- `Feedback`
- `Post-M1`
