export function createStarterMarkdown() {
  const now = new Date().toISOString();
  const id = crypto.randomUUID().slice(0, 8);

  return [
    "---",
    "title: BloomMD Start",
    `id: ${id}`,
    `created: "${now}"`,
    `updated: "${now}"`,
    "tags:",
    "  - bloommd",
    "  - start",
    "layout:",
    "  direction: LR",
    "---",
    "",
    "# BloomMD Start",
    "",
    "Willkommen in BloomMD. Diese Datei ist normales Markdown und bleibt jederzeit in anderen Editoren nutzbar.",
    "",
    "## Erste Schritte",
    "",
    "- Erstelle neue Zweige direkt in der Mindmap.",
    "- Verschiebe Struktur per Drag-and-drop.",
    "- Bearbeite Inhalte im Seiteneditor.",
    "- Speichere und exportiere als .md-Datei.",
    "",
    "## Warum das wichtig ist",
    "",
    "BloomMD soll visuelles Denken mit offenen Dateien verbinden, ohne Lock-in oder Pflicht-Cloud.",
  ].join("\n");
}
