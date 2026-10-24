# Mitwirken / Contributing

## Deutsch

Die Entwicklungsquelle ist dieses Monorepo. Das separate
[`bloommd-obsidian`](https://github.com/moellenbeck-digital/bloommd-obsidian)
Repository ist ein generierter Release-Mirror; Änderungen am Plugin gehören
nach `plugins/obsidian` hierher.

- Suche vor einem neuen Vorschlag oder Fehlerbericht nach einem bestehenden
  [Issue](https://github.com/moellenbeck-digital/BloomMD/issues). Beschreibe
  Version, Plattform, Schritte und erwartetes Verhalten. Die Maintainer ordnen
  das Issue dem BloomMD-Roadmap-Board zu.
- Teile in öffentlichen Issues, PRs und CI-Artefakten nur Testdaten. Nutze für
  Sicherheitslücken den vertraulichen Weg in [SECURITY.md](SECURITY.md).
- Erstelle Änderungen in einem Branch und verlinke das Issue im Pull Request.
  Halte Code und Kommentare auf Englisch; Tests liegen neben der Quelldatei.
  Die passenden Befehle stehen in [AGENTS.md](AGENTS.md).
- Prüfe vor dem Einreichen TypeScript, Tests und die betroffenen Builds. Bei
  nutzerrelevanten Änderungen gehören Version, Dokumentation und DE/EN-Texte
  zum Release-Umfang.
- Die öffentliche PR-CI nutzt nur Leserechte. Produktive GHCR-Images werden
  nach grüner Main-CI separat durch die Maintainer veröffentlicht.
- Reiche nur Code, Texte und Medien ein, für die du die nötigen Rechte hast.
  Nenne Herkunft und Lizenz von Drittmaterial im PR. Beiträge müssen unter
  den für den betroffenen Quellstand geltenden Bedingungen veröffentlicht
  werden können.

Aktueller BloomMD-Quellcode steht unter der [Elastic License 2.0](LICENSE).
Sie ist eine Source-available-Lizenz mit Nutzungsbeschränkungen, keine
OSI-Open-Source-Lizenz. Frühere veröffentlichte Versionen behalten ihre
bisherigen Lizenzbedingungen; die Grenze ist in [docs/LICENSING.md](docs/LICENSING.md)
beschrieben.

## English

This monorepo is the development source. The separate
[`bloommd-obsidian`](https://github.com/moellenbeck-digital/bloommd-obsidian)
repository is a generated release mirror; plugin changes belong in
`plugins/obsidian` here.

- Search existing [issues](https://github.com/moellenbeck-digital/BloomMD/issues)
  before reporting a bug or proposing a change. Include the version, platform,
  steps, and expected behavior. Maintainers add issues to the BloomMD Roadmap.
- Use only synthetic data in public issues, pull requests, and CI artifacts.
  Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
- Work on a branch and link the issue in your pull request. Keep code and
  comments in English and place tests beside their source files. See
  [AGENTS.md](AGENTS.md) for relevant commands.
- Run the affected TypeScript checks, tests, and builds before submitting.
  User-facing changes also need the appropriate version, documentation, and
  German and English release text.
- Public PR CI uses read-only permissions. Maintainers publish production
  GHCR images separately after the main CI succeeds.
- Submit only code, text, and media that you have the right to provide. State
  the source and license of third-party material in the PR. Contributions
  must be publishable under the terms applicable to the affected source tree.

Current BloomMD source is under the [Elastic License 2.0](LICENSE), a
source-available license with use restrictions rather than an OSI-approved
open-source license. Earlier published versions retain their previous terms;
see [docs/LICENSING.md](docs/LICENSING.md) for the release boundary.
