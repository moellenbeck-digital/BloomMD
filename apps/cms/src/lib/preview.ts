/**
 * HTML of the editorial preview (`app/preview/[kind]/[id]`): every value is escaped, the body is shown as text
 * (Markdown is not rendered; it is the source the marketing site will render later, #366). Pure, so the escaping is tested.
 */
export const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const STATUS: Record<string, string> = { draft: "Entwurf", published: "Veröffentlicht" };
const LOCALE: Record<string, string> = { de: "Deutsch", en: "English" };

export function previewHtml(kind: "blog" | "news", doc: Record<string, unknown>): string {
  const image = doc.image && typeof doc.image === "object" ? (doc.image as { alt?: unknown }) : null;
  const tags = Array.isArray(doc.tags) ? doc.tags.map(String).join(", ") : "";
  const meta = [
    kind === "blog" ? "Blog" : "News",
    STATUS[String(doc._status)] ?? String(doc._status ?? ""),
    LOCALE[String(doc.locale)] ?? String(doc.locale ?? ""),
    doc.date ? new Date(String(doc.date)).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" }) : "",
    doc.version ? `Version ${String(doc.version)}` : "",
    tags ? `Tags: ${tags}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return `<!doctype html>
<html lang="${doc.locale === "en" ? "en" : "de"}">
<head><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><title>Vorschau: ${escapeHtml(doc.title)}</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem}.meta{color:#555;font-size:.9rem}.banner{background:#fff3cd;padding:.5rem 1rem;border-radius:.25rem}.body{white-space:pre-wrap}</style></head>
<body>
<p class="banner" data-testid="preview-banner">Vorschau für Betreiber – nicht öffentlich</p>
<h1 data-testid="preview-title">${escapeHtml(doc.title)}</h1>
<p class="meta" data-testid="preview-meta">${escapeHtml(meta)}</p>
${doc.summary ? `<p><strong>${escapeHtml(doc.summary)}</strong></p>` : ""}
${image ? `<p class="meta">Bild: ${escapeHtml(image.alt ?? "(ohne Alternativtext)")}</p>` : ""}
<div class="body" data-testid="preview-body">${escapeHtml(doc.body)}</div>
</body>
</html>
`;
}
