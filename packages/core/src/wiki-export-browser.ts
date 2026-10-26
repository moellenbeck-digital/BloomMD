/**
 * The read-only Wiki browser that ships inside a static export as `index.html`.
 *
 * One self-contained document: no framework, no CDN, no fonts, no analytics. At runtime it makes
 * exactly one kind of request — `fetch("wiki.json")` from its own origin — and falls back to the
 * copy of that JSON embedded in the page, which is what makes it work from `file://`.
 *
 * Safety rests on construction, not on filtering: the client only ever builds DOM nodes with
 * `textContent`, never `innerHTML`, so Markdown cannot turn into markup. Links are additionally
 * limited to http(s) and bundle-relative targets, and a CSP meta tag (script and style pinned by
 * hash) keeps the page from talking to anyone else even if that ever regressed.
 *
 * The client source lives in template literals: it must not contain backticks or `${`.
 */

import { createHash } from "node:crypto";

const WIKI_BROWSER_CSS = String.raw`
:root{color-scheme:light dark;--bg:#fff;--fg:#1a1a1a;--muted:#5c5c5c;--line:#dcdcdc;--card:#fafafa;--brand:#ff6b35;--brand-ink:#b84218;--brand-bg:#fff4ee;--ok-bg:#ecfdf5;--ok-line:#6ee7b7;--ok-fg:#065f46;--warn-bg:#fffbeb;--warn-line:#fcd34d;--warn-fg:#78350f;--bad-bg:#fef2f2;--bad-line:#fca5a5;--bad-fg:#7f1d1d}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#ececec;--muted:#a3a3a3;--line:#3a3a3a;--card:#1d1d1d;--brand-ink:#ff9a72;--brand-bg:#2a1d17;--ok-bg:#0f2a20;--ok-line:#1f7a5a;--ok-fg:#a7f3d0;--warn-bg:#2b2410;--warn-line:#8a6d1a;--warn-fg:#fde68a;--bad-bg:#2c1414;--bad-line:#8a2f2f;--bad-fg:#fecaca}}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--brand-ink)}
code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.9em}
pre{overflow:auto;padding:.75rem;background:var(--card);border:1px solid var(--line)}
:not(pre)>code{background:var(--card);padding:.05rem .3rem;border:1px solid var(--line)}
button,input{font:inherit;color:inherit}
.hdr{display:flex;flex-wrap:wrap;align-items:center;gap:.75rem 1.25rem;padding:.75rem 1.25rem;border-bottom:3px solid var(--brand)}
.hdr[hidden]{display:none}
.hdr h1{margin:0;font-size:1.15rem}
.stats{display:flex;flex-wrap:wrap;gap:.35rem;margin-left:auto}
.lang{display:flex;gap:.25rem}
.bar{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;padding:.6rem 1.25rem;border-bottom:1px solid var(--line)}
.tab{border:1px solid var(--line);background:transparent;padding:.3rem .75rem;cursor:pointer;font-weight:600;color:var(--muted)}
.tab[aria-pressed="true"],.tab[aria-current="true"]{border-color:var(--brand);background:var(--brand-bg);color:var(--brand-ink)}
.layout{display:grid;grid-template-columns:300px minmax(0,1fr);gap:1.5rem;padding:1.25rem}
@media (max-width:760px){.layout{grid-template-columns:1fr}}
.side{border-right:1px solid var(--line);padding-right:1.25rem}
@media (max-width:760px){.side{border-right:0;padding-right:0}}
.side input[type=search]{width:100%;padding:.45rem .6rem;border:1px solid var(--line);background:var(--bg)}
.opt{display:flex;gap:.4rem;align-items:center;margin-top:.6rem;font-size:.8rem;color:var(--muted)}
.tags{display:flex;flex-wrap:wrap;gap:.25rem;margin-top:.6rem}
.tag{border:1px solid var(--line);background:transparent;padding:.05rem .45rem;font-size:.75rem;cursor:pointer;color:var(--muted)}
.tag[aria-pressed="true"]{border-color:var(--brand);background:var(--brand-bg);color:var(--brand-ink)}
.count{margin:.8rem 0 .3rem;font-size:.75rem;color:var(--muted)}
.item{display:block;width:100%;text-align:left;border:0;border-left:3px solid transparent;background:transparent;padding:.4rem .6rem;cursor:pointer;margin-bottom:.15rem;text-decoration:none;color:inherit}
.item:hover{background:var(--card)}
.item[aria-current="true"]{border-left-color:var(--brand);background:var(--brand-bg)}
.item b{display:block;font-size:.9rem}
.item small{color:var(--muted)}
.main{min-width:0;padding:1.25rem}
.layout .main{padding:0}
.path{font:.75rem ui-monospace,Menlo,monospace;color:var(--muted);margin:0}
h2.title{margin:.3rem 0 .6rem;font-size:1.9rem;line-height:1.2}
.badges{display:flex;flex-wrap:wrap;gap:.35rem;margin:.4rem 0}
.badge{display:inline-block;border:1px solid var(--line);padding:.05rem .5rem;font-size:.75rem;font-weight:600;background:var(--card);color:var(--muted)}
.b-verified{border-color:var(--ok-line);background:var(--ok-bg);color:var(--ok-fg)}
.b-generated,.b-draft,.b-warn{border-color:var(--warn-line);background:var(--warn-bg);color:var(--warn-fg)}
.b-expired,.b-deprecated,.b-bad{border-color:var(--bad-line);background:var(--bad-bg);color:var(--bad-fg)}
.meta{font-size:.8rem;color:var(--muted);margin:.4rem 0}
.md h3,.md h4,.md h5,.md h6{margin:1.4rem 0 .4rem;line-height:1.3}
.md p{margin:.7rem 0}
.md ul,.md ol{margin:.6rem 0;padding-left:1.5rem}
.md blockquote{margin:.8rem 0;padding:.1rem 1rem;border-left:3px solid var(--line);color:var(--muted)}
.md table{border-collapse:collapse;margin:.8rem 0;display:block;overflow:auto}
.md th,.md td{border:1px solid var(--line);padding:.3rem .6rem;text-align:left}
.md img,.md video{max-width:100%;height:auto}
.md hr{border:0;border-top:1px solid var(--line);margin:1.2rem 0}
.gone{border-bottom:1px dashed var(--warn-line);color:var(--warn-fg);cursor:help}
.broken{border-bottom:1px dashed var(--bad-line);color:var(--bad-fg);cursor:help}
.sec{margin-top:2rem;border-top:1px solid var(--line);padding-top:1rem}
.sec h3{margin:0;font-size:.8rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.sec .hint{margin:.3rem 0;font-size:.8rem;color:var(--muted)}
.cards{display:grid;gap:.75rem;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));margin-top:.75rem}
.card{border:1px solid var(--line);background:var(--card);padding:.6rem .75rem;min-width:0}
.card.warn{border-color:var(--warn-line);background:var(--warn-bg);color:var(--warn-fg)}
.card.bad{border-color:var(--bad-line);background:var(--bad-bg);color:var(--bad-fg)}
.card .kind{font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;opacity:.8}
.card code{display:block;word-break:break-all;margin:.2rem 0}
.card .why{font-size:.75rem;margin:.2rem 0 0}
.card img,.card video{max-width:100%;max-height:12rem;display:block;margin-top:.4rem}
.card audio{width:100%;margin-top:.4rem}
.cite{list-style:none;padding:0;margin:.75rem 0 0;display:grid;gap:.5rem}
.cite li{border:1px solid var(--line);padding:.45rem .7rem}
.cite li.drift{border-color:var(--warn-line);background:var(--warn-bg);color:var(--warn-fg)}
.cite code{display:block;word-break:break-all;font-size:.75rem;color:var(--muted)}
.warnline{color:var(--warn-fg);margin:.5rem 0}
.mapi{list-style:none;padding:0;display:grid;gap:.75rem}
.mapi li{border:1px solid var(--line);padding:.7rem 1rem;background:var(--card)}
.mapi dl{margin:.5rem 0 0;font-size:.8rem;color:var(--muted)}
.mapi dt{display:inline;font-weight:700}
.mapi dd{display:inline;margin:0}
.linkbtn{border:0;background:none;padding:0;cursor:pointer;text-decoration:underline;color:var(--brand-ink);font-weight:700;font-size:1rem;text-align:left}
.err{margin:1.5rem;padding:1rem;border:1px solid var(--bad-line);background:var(--bad-bg);color:var(--bad-fg)}
.embed .layout{padding:.75rem}
`;

const WIKI_BROWSER_JS = String.raw`
(function () {
  "use strict";

  var I18N = {
    de: {
      pages: "Seiten", index: "Index", log: "Log", map: "Knowledge Map", view: "Ansicht", language: "Sprache",
      search: "Wiki durchsuchen", placeholder: "Titel, Pfad, Tag, Status, Inhalt", onlyProblems: "Nur Seiten mit Problemen",
      countOf: "von", wikiPages: "Wiki-Seiten", noPage: "Keine Seite gefunden.", noLog: "Kein Log vorhanden.", noIndex: "Kein Index vorhanden.",
      indexTitle: "Wiki-Index", logTitle: "Wiki-Log", loading: "Wiki wird geladen …", loadError: "Das Wiki konnte nicht geladen werden.",
      noscript: "Dieser Wiki-Browser braucht JavaScript.",
      citations: "Quellen und Zitate", noCitations: "Diese Seite nennt keine Quelle. Aussagen darauf lassen sich nicht überprüfen.",
      sourceChanged: "Quelle verändert", unknownSource: "unbekannte Quelle", noHash: "ohne Hash — Veränderung nicht feststellbar",
      withoutSource: "ohne Quelle", changedShort: " · Quelle verändert", noSourceShort: " · ohne Quelle",
      references: "Verweise und Medien", externalNote: "Externe Adressen werden nicht geladen, nur auf Klick geöffnet. Vorher verlässt keine Anfrage diese Seite.",
      unavailable: "nicht verfügbar", openFile: "Datei öffnen", openExternal: "Extern öffnen", openPage: "Seite öffnen", sizeKb: "KB", noRefs: "Keine Verweise.",
      mapTitle: "Knowledge Map", mapIntro: "Knoten sind Konzeptseiten, Kanten stammen aus Wiki-Links, Tags und zitierten Quellen — nicht aus der Ordnerstruktur. Defekte Verweise bleiben sichtbar.",
      pointsTo: "Verweist auf: ", linkedBy: "Wird verlinkt von: ", sources: "Quellen: ", nothing: "nichts", nobody: "niemandem", brokenLink: "defekt",
      trust: { verified: "verifiziert", generated: "generiert", unattributed: "nicht zugeordnet" },
      lifecycle: { draft: "Entwurf", stable: "stabil", deprecated: "veraltet" },
      expired: "abgelaufen", generatedBy: "Generiert von", verifiedBy: "Verifiziert von", staleAfter: "Gültig bis", updated: "Aktualisiert", on: "am",
      stats: { pages: "Seiten", sources: "Quellen", stale: "Quellen verändert", expired: "abgelaufen", broken: "defekte Links", noSource: "ohne Quelle" },
      okf: "OKF",
      kinds: { wiki: "Wiki-Link", image: "Bild", video: "Video", audio: "Audio", pdf: "PDF", file: "Datei", web: "Web" },
      reasons: {
        "outside-bundle": "Ziel liegt außerhalb des Bundles.", scheme: "Nicht unterstütztes Schema.", "not-found": "Datei existiert im Bundle nicht.",
        "not-a-file": "Ziel ist keine Datei.", "type-not-allowed": "Dateityp wird im Export nicht ausgeliefert.", "too-large": "Datei ist zu groß für den Export.",
        "reserved-name": "Name ist im Export reserviert.", hidden: "Versteckte Pfade werden nicht exportiert.", "invalid-encoding": "Ungültig kodierter Pfad.",
        "page-not-found": "Keine Seite mit diesem Namen im Bundle.", external: "Externe Adresse."
      }
    },
    en: {
      pages: "Pages", index: "Index", log: "Log", map: "Knowledge Map", view: "View", language: "Language",
      search: "Search the wiki", placeholder: "Title, path, tag, status, content", onlyProblems: "Only pages with problems",
      countOf: "of", wikiPages: "Wiki pages", noPage: "No page found.", noLog: "No log available.", noIndex: "No index available.",
      indexTitle: "Wiki index", logTitle: "Wiki log", loading: "Loading wiki …", loadError: "The wiki could not be loaded.",
      noscript: "This wiki browser needs JavaScript.",
      citations: "Sources and citations", noCitations: "This page names no source. Its claims cannot be verified.",
      sourceChanged: "Source changed", unknownSource: "unknown source", noHash: "without hash — drift cannot be detected",
      withoutSource: "without source", changedShort: " · source changed", noSourceShort: " · without source",
      references: "References and media", externalNote: "External addresses are never loaded, only opened on click. No request leaves this page beforehand.",
      unavailable: "not available", openFile: "Open file", openExternal: "Open externally", openPage: "Open page", sizeKb: "KB", noRefs: "No references.",
      mapTitle: "Knowledge Map", mapIntro: "Nodes are concept pages; edges come from wiki links, tags and cited sources — not from the folder structure. Broken references remain visible.",
      pointsTo: "Points to: ", linkedBy: "Linked from: ", sources: "Sources: ", nothing: "nothing", nobody: "nobody", brokenLink: "broken",
      trust: { verified: "verified", generated: "generated", unattributed: "unattributed" },
      lifecycle: { draft: "draft", stable: "stable", deprecated: "deprecated" },
      expired: "expired", generatedBy: "Generated by", verifiedBy: "Verified by", staleAfter: "Valid until", updated: "Updated", on: "on",
      stats: { pages: "pages", sources: "sources", stale: "sources changed", expired: "expired", broken: "broken links", noSource: "without source" },
      okf: "OKF",
      kinds: { wiki: "Wiki link", image: "Image", video: "Video", audio: "Audio", pdf: "PDF", file: "File", web: "Web" },
      reasons: {
        "outside-bundle": "Target lies outside the bundle.", scheme: "Unsupported scheme.", "not-found": "File does not exist in the bundle.",
        "not-a-file": "Target is not a file.", "type-not-allowed": "File type is not shipped in the export.", "too-large": "File is too large for the export.",
        "reserved-name": "Name is reserved in the export.", hidden: "Hidden paths are not exported.", "invalid-encoding": "Invalid path encoding.",
        "page-not-found": "No page with this name in the bundle.", external: "External address."
      }
    }
  };

  var params = new URLSearchParams(window.location.search);
  var embed = params.get("embed") === "1";

  function pickLang() {
    var wanted = params.get("lang");
    if (wanted === "de" || wanted === "en") return wanted;
    var prefs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "en"]);
    return String(prefs[0] || "en").toLowerCase().indexOf("de") === 0 ? "de" : "en";
  }

  var state = { data: null, lang: pickLang(), route: { view: "pages", path: null }, query: "", tag: null, onlyProblems: false };
  var T = function () { return I18N[state.lang]; };

  // ---- URL safety -------------------------------------------------------------------------

  // Only http(s) and bundle-relative targets ever become a link or a media source.
  function isSafeUrl(url) {
    if (typeof url !== "string") return false;
    var value = url.trim();
    if (!value || /[\u0000-\u001f\\]/.test(value)) return false;
    if (/^[a-z][a-z0-9+.\-]*:/i.test(value)) return /^https?:\/\//i.test(value);
    if (value.charAt(0) === "/") return false;
    return value.split(/[?#]/, 1)[0].split("/").every(function (part) { return part !== ".."; });
  }

  function localUrl(path) {
    return path.split("/").map(encodeURIComponent).join("/");
  }

  // ---- DOM helpers ------------------------------------------------------------------------

  function append(el, kids) {
    if (kids === null || kids === undefined || kids === false) return;
    if (Array.isArray(kids)) { kids.forEach(function (kid) { append(el, kid); }); return; }
    el.appendChild(typeof kids === "object" ? kids : document.createTextNode(String(kids)));
  }

  function h(tag, props, kids) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value === null || value === undefined || value === false) return;
        if (key === "class") el.className = value;
        else if (key.indexOf("on") === 0) el.addEventListener(key.slice(2), value);
        else if (key === "href" || key === "src") { if (isSafeUrl(value)) el.setAttribute(key, value); }
        else el.setAttribute(key, value === true ? "" : String(value));
      });
    }
    append(el, kids);
    return el;
  }

  function badge(text, cls, testid) {
    return h("span", { class: "badge" + (cls ? " " + cls : ""), "data-testid": testid || null }, text);
  }

  // ---- Markdown → DOM (no HTML is ever parsed) ----------------------------------------------

  var INLINE = [
    { type: "code", re: /\x60([^\x60]+)\x60/g },
    { type: "image", re: /!\[([^\]]*)\]\(([^)\s]+)(?:\s+["']([^"']+)["'])?\)/g },
    { type: "wiki", re: /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g },
    { type: "link", re: /\[([^\]]+)\]\(([^)\s]+)(?:\s+["']([^"']+)["'])?\)/g },
    { type: "bold", re: /\*\*([^*]+)\*\*/g },
    { type: "italic", re: /\*([^*\s][^*]*)\*/g }
  ];

  function inline(text, ctx, noLinks) {
    var out = [];
    var pos = 0;
    while (pos < text.length) {
      var best = null;
      for (var i = 0; i < INLINE.length; i++) {
        var rule = INLINE[i];
        rule.re.lastIndex = pos;
        var m = rule.re.exec(text);
        if (m && (!best || m.index < best.m.index)) best = { rule: rule, m: m };
      }
      if (!best) { out.push(text.slice(pos)); break; }
      if (best.m.index > pos) out.push(text.slice(pos, best.m.index));
      out.push(renderInline(best.rule.type, best.m, ctx, noLinks));
      pos = best.m.index + best.m[0].length;
    }
    return out;
  }

  function renderInline(type, m, ctx, noLinks) {
    if (type === "code") return h("code", null, m[1]);
    if (type === "bold") return h("strong", null, inline(m[1], ctx, noLinks));
    if (type === "italic") return h("em", null, inline(m[1], ctx, noLinks));
    if (type === "image") return renderImage(m[1], m[2], m[3], ctx);
    if (type === "wiki") {
      var target = m[1].trim();
      return renderTarget(ctx.previews["wiki:" + target], (m[2] || target).trim(), null, noLinks);
    }
    return renderTarget(ctx.previews["res:" + m[2]], null, m, noLinks, ctx);
  }

  function renderTarget(preview, label, match, noLinks, ctx) {
    var content = label !== null ? label : inline(match[1], ctx, true);
    var title = match && match[3] ? match[3] : null;
    if (!preview) return h("span", { class: "gone" }, content);
    if (preview.availability === "missing") return h("span", { class: "broken", title: reasonText(preview) }, content);
    if (preview.availability === "unsafe") return h("span", { class: "gone", title: reasonText(preview) }, content);
    if (noLinks) return h("span", null, content);
    if (preview.availability === "needs-consent") {
      return h("a", { href: preview.reference.target, target: "_blank", rel: "noopener noreferrer nofollow", title: title }, content);
    }
    var page = preview.resolvedPath && state.pages[preview.resolvedPath];
    if (page || preview.resolvedPath === "index.md" || preview.resolvedPath === "log.md") {
      return h("a", { href: pageHash(preview.resolvedPath), title: title }, content);
    }
    return h("a", { href: preview.resolvedPath ? localUrl(preview.resolvedPath) : null, target: "_blank", rel: "noopener noreferrer", title: title }, content);
  }

  function renderImage(alt, target, title, ctx) {
    var preview = ctx.previews["res:" + target];
    if (preview && preview.availability === "available" && preview.resolvedPath && preview.reference.kind === "image") {
      return h("img", { src: localUrl(preview.resolvedPath), alt: alt, title: title, loading: "lazy" });
    }
    var label = alt || target;
    if (preview && preview.availability === "needs-consent") {
      return h("a", { href: target, target: "_blank", rel: "noopener noreferrer nofollow" }, "[" + T().kinds.image + ": " + label + "]");
    }
    return h("span", { class: preview && preview.availability === "missing" ? "broken" : "gone", title: preview ? reasonText(preview) : null },
      "[" + T().kinds.image + " " + T().unavailable + ": " + label + "]");
  }

  var BLOCK_START = /^(\s{0,3}(#{1,6}\s|>|\x60{3}|([-*+]|\d+[.)])\s)|\s*([-*_])(\s*\4){2,}\s*$)/;
  var TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

  function splitRow(line) {
    var cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
    return cells.map(function (cell) { return cell.trim(); });
  }

  function blocks(lines, ctx) {
    var out = [];
    var i = 0;
    while (i < lines.length) {
      var line = lines[i];
      var m;
      if (!line.trim()) { i++; continue; }
      if (/^\s*\x60{3}/.test(line)) {
        var code = [];
        i++;
        while (i < lines.length && !/^\s*\x60{3}/.test(lines[i])) { code.push(lines[i]); i++; }
        i++;
        out.push(h("pre", null, h("code", null, code.join("\n"))));
        continue;
      }
      if ((m = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line))) {
        // The page title is the h2; content headings start one level below it.
        out.push(h("h" + Math.min(6, m[1].length + 2), null, inline(m[2], ctx)));
        i++;
        continue;
      }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push(h("hr")); i++; continue; }
      if (/^\s{0,3}>/.test(line)) {
        var quote = [];
        while (i < lines.length && /^\s{0,3}>/.test(lines[i])) { quote.push(lines[i].replace(/^\s{0,3}>\s?/, "")); i++; }
        out.push(h("blockquote", null, blocks(quote, ctx)));
        continue;
      }
      if (line.indexOf("|") >= 0 && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].indexOf("-") >= 0) {
        var head = splitRow(line);
        var rows = [];
        i += 2;
        while (i < lines.length && lines[i].trim() && lines[i].indexOf("|") >= 0) { rows.push(splitRow(lines[i])); i++; }
        out.push(h("table", null, [
          h("thead", null, h("tr", null, head.map(function (c) { return h("th", null, inline(c, ctx)); }))),
          h("tbody", null, rows.map(function (r) { return h("tr", null, r.map(function (c) { return h("td", null, inline(c, ctx)); })); }))
        ]));
        continue;
      }
      if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
        var items = [];
        while (i < lines.length && lines[i].trim() && (/^\s*([-*+]|\d+[.)])\s+/.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))) {
          var im = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
          if (im) items.push({ indent: im[1].replace(/\t/g, "    ").length, ordered: /\d/.test(im[2]), text: im[3] });
          else items[items.length - 1].text += " " + lines[i].trim();
          i++;
        }
        out.push(buildList(items, 0, items[0].indent, ctx).node);
        continue;
      }
      var para = [line.trim()];
      i++;
      while (i < lines.length && lines[i].trim() && !BLOCK_START.test(lines[i])) { para.push(lines[i].trim()); i++; }
      out.push(h("p", null, inline(para.join(" "), ctx)));
    }
    return out;
  }

  function buildList(items, start, indent, ctx) {
    var list = h(items[start].ordered ? "ol" : "ul");
    var i = start;
    while (i < items.length && items[i].indent >= indent) {
      if (items[i].indent > indent) {
        var nested = buildList(items, i, items[i].indent, ctx);
        if (list.lastChild) list.lastChild.appendChild(nested.node);
        i = nested.next;
        continue;
      }
      list.appendChild(h("li", null, inline(items[i].text, ctx)));
      i++;
    }
    return { node: list, next: i };
  }

  function renderMarkdown(source, previews) {
    var ctx = { previews: previews };
    return h("div", { class: "md" }, blocks(String(source).replace(/^﻿/, "").split(/\r?\n/), ctx));
  }

  function stripFrontmatter(raw) {
    return String(raw).replace(/^﻿?---[ \t]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/, "");
  }

  function previewMap(list) {
    var map = {};
    (list || []).forEach(function (preview) {
      var ref = preview.reference;
      var key = (ref.kind === "wiki" ? "wiki:" : "res:") + ref.target;
      if (!map[key]) map[key] = preview;
    });
    return map;
  }

  function reasonText(preview) {
    var reasons = T().reasons;
    return (preview.reasonCode && reasons[preview.reasonCode]) || preview.reason || "";
  }

  // ---- Data helpers -----------------------------------------------------------------------

  function pageHash(path) {
    if (path === "index.md") return "#/index";
    if (path === "log.md") return "#/log";
    return "#/page/" + encodeURIComponent(path);
  }

  function isExpired(page) {
    if (page.expired) return true;
    if (!page.staleAfter) return false;
    var deadline = Date.parse(page.staleAfter + "T23:59:59.999Z");
    return isFinite(deadline) && deadline < Date.now();
  }

  function hasProblem(page) {
    var summary = page.citationSummary || { total: 0, drifted: 0 };
    return summary.total === 0 || summary.drifted > 0 || (page.issues || []).length > 0 ||
      (page.previews || []).some(function (p) { return p.availability === "missing" || p.availability === "unsafe"; });
  }

  function filteredPages() {
    var needle = state.query.trim().toLowerCase();
    return state.data.pages.filter(function (page) {
      if (state.tag && (page.tags || []).indexOf(state.tag) < 0) return false;
      if (state.onlyProblems && !hasProblem(page)) return false;
      if (!needle) return true;
      var haystack = [page.title, page.path, page.type, page.lifecycle, page.trustTier].concat(page.tags || []).join(" ").toLowerCase();
      return haystack.indexOf(needle) >= 0 || page.content.toLowerCase().indexOf(needle) >= 0;
    });
  }

  // ---- Views ------------------------------------------------------------------------------

  var els = {};

  function formatEvent(event) {
    return event.by + " " + T().on + " " + event.at;
  }

  function renderCitations(page) {
    var t = T();
    var list = page.citations || [];
    var section = h("section", { class: "sec", "data-testid": "wiki-citations" }, h("h3", null, t.citations + " (" + list.length + ")"));
    if (!list.length) {
      section.appendChild(h("p", { class: "warnline", "data-testid": "wiki-no-source" }, t.noCitations));
      return section;
    }
    section.appendChild(h("ul", { class: "cite" }, list.map(function (c) {
      return h("li", { class: c.drifted ? "drift" : null, "data-testid": "wiki-citation" }, [
        h("b", null, c.title || c.resource),
        c.drifted ? [" ", badge(t.sourceChanged, "b-warn", "wiki-source-changed")] : null,
        c.unknown ? [" ", badge(t.unknownSource)] : null,
        h("code", null, c.resource),
        c.contentHash ? h("code", null, c.contentHash) : h("small", null, t.noHash)
      ]);
    })));
    return section;
  }

  function referenceCard(preview) {
    var t = T();
    var ref = preview.reference;
    var kindLabel = t.kinds[ref.kind] || ref.kind;
    var attrs = function (cls, testid) { return { class: "card" + (cls ? " " + cls : ""), "data-testid": testid }; };
    if (preview.availability === "unsafe" || preview.availability === "missing") {
      return h("div", attrs(preview.availability === "unsafe" ? "bad" : "warn", "wiki-reference-" + preview.availability), [
        h("div", { class: "kind" }, kindLabel + " · " + t.unavailable),
        h("code", null, ref.target),
        h("p", { class: "why" }, reasonText(preview))
      ]);
    }
    if (preview.availability === "needs-consent") {
      return h("div", attrs("", "wiki-reference"), [
        h("div", { class: "kind" }, kindLabel),
        h("a", { href: ref.target, target: "_blank", rel: "noopener noreferrer nofollow" }, ref.label || ref.target),
        h("code", null, ref.target)
      ]);
    }
    var path = preview.resolvedPath;
    var internal = path && (state.pages[path] || path === "index.md" || path === "log.md");
    var body = [h("div", { class: "kind" }, kindLabel)];
    if (internal) {
      body.push(h("a", { href: pageHash(path) }, ref.label || path));
    } else if (path) {
      var url = localUrl(path);
      if (ref.kind === "image") body.push(h("img", { src: url, alt: ref.alt || ref.label, loading: "lazy" }));
      else if (ref.kind === "video") body.push(h("video", { src: url, controls: true, preload: "none" }));
      else if (ref.kind === "audio") body.push(h("audio", { src: url, controls: true, preload: "none" }));
      body.push(h("a", { href: url, target: "_blank", rel: "noopener noreferrer" }, (ref.label || path) + " — " + t.openFile));
      body.push(h("code", null, path));
      if (preview.byteSize !== null && preview.byteSize !== undefined) body.push(h("small", null, Math.ceil(preview.byteSize / 1024) + " " + t.sizeKb));
    }
    return h("div", attrs("", "wiki-reference"), body);
  }

  function renderReferences(page) {
    var t = T();
    var previews = page.previews || [];
    if (!previews.length) return null;
    return h("section", { class: "sec", "data-testid": "wiki-references" }, [
      h("h3", null, t.references),
      h("p", { class: "hint" }, t.externalNote),
      h("div", { class: "cards" }, previews.map(referenceCard))
    ]);
  }

  function renderPage(page) {
    var t = T();
    if (!page) return h("p", { "data-testid": "wiki-no-page" }, t.noPage);
    var badges = [
      badge(t.trust[page.trustTier] || page.trustTier, "b-" + page.trustTier, "wiki-badge-trust"),
      badge(t.lifecycle[page.lifecycle] || page.lifecycle, "b-" + page.lifecycle, "wiki-badge-lifecycle")
    ];
    if (isExpired(page)) badges.push(badge(t.expired, "b-expired", "wiki-badge-expired"));
    badges.push(badge(page.type));
    (page.tags || []).forEach(function (tag) { badges.push(badge("#" + tag)); });

    var meta = [];
    if (page.generated) meta.push(h("div", null, t.generatedBy + ": " + formatEvent(page.generated)));
    (page.verified || []).forEach(function (event) { meta.push(h("div", null, t.verifiedBy + ": " + formatEvent(event))); });
    if (page.staleAfter) meta.push(h("div", null, t.staleAfter + ": " + page.staleAfter));
    if (page.updated) meta.push(h("div", null, t.updated + ": " + page.updated));

    return h("article", { "data-testid": "wiki-page" }, [
      h("p", { class: "path" }, page.path),
      h("h2", { class: "title" }, page.title),
      h("div", { class: "badges" }, badges),
      meta.length ? h("div", { class: "meta" }, meta) : null,
      renderMarkdown(page.content, previewMap(page.previews)),
      renderCitations(page),
      renderReferences(page)
    ]);
  }

  function renderPagesView() {
    var t = T();
    var data = state.data;
    var allTags = {};
    data.pages.forEach(function (page) { (page.tags || []).forEach(function (tag) { allTags[tag] = true; }); });
    var tagNames = Object.keys(allTags).sort();

    var list = h("div", { "data-testid": "wiki-list" });
    var count = h("p", { class: "count", "data-testid": "wiki-count" });
    var article = h("div", { class: "main" });

    function selectedPage(filtered) {
      if (state.route.path) return state.pages[state.route.path] || null;
      return filtered[0] || null;
    }

    function refresh() {
      var filtered = filteredPages();
      var selected = selectedPage(filtered);
      count.textContent = filtered.length + " " + t.countOf + " " + data.pages.length + " " + t.pages.toLowerCase();
      list.textContent = "";
      filtered.forEach(function (page) {
        var summary = page.citationSummary || { total: 0, drifted: 0 };
        list.appendChild(h("a", {
          class: "item", href: pageHash(page.path), "aria-current": selected && selected.path === page.path ? "true" : "false", "data-testid": "wiki-list-item"
        }, [
          h("b", null, page.title),
          h("small", null, page.type + (summary.drifted > 0 ? t.changedShort : "") + (summary.total === 0 ? t.noSourceShort : ""))
        ]));
      });
      article.textContent = "";
      article.appendChild(renderPage(selected));
    }

    var search = h("input", {
      type: "search", "aria-label": t.search, placeholder: t.placeholder, value: state.query, "data-testid": "wiki-search",
      oninput: function (event) { state.query = event.target.value; refresh(); }
    });
    var problems = h("input", {
      type: "checkbox", "data-testid": "wiki-only-problems", checked: state.onlyProblems ? true : null,
      onchange: function (event) { state.onlyProblems = event.target.checked; refresh(); }
    });
    var tagBox = h("div", { class: "tags" }, tagNames.map(function (tag) {
      return h("button", {
        type: "button", class: "tag", "aria-pressed": state.tag === tag ? "true" : "false",
        onclick: function (event) {
          state.tag = state.tag === tag ? null : tag;
          Array.prototype.forEach.call(tagBox.children, function (button) { button.setAttribute("aria-pressed", button === event.currentTarget && state.tag ? "true" : "false"); });
          refresh();
        }
      }, tag);
    }));

    refresh();
    return h("div", { class: "layout" }, [
      h("nav", { class: "side", "aria-label": t.wikiPages }, [
        search,
        h("label", { class: "opt" }, [problems, t.onlyProblems]),
        tagNames.length ? tagBox : null,
        count,
        list
      ]),
      article
    ]);
  }

  function renderDocument(title, raw, previews, emptyText, testid) {
    var t = T();
    var body = raw ? renderMarkdown(stripFrontmatter(raw), previewMap(previews)) : h("p", null, emptyText);
    return h("div", { class: "main", "data-testid": testid }, [h("h2", { class: "title" }, title), body]);
  }

  function renderMap() {
    var t = T();
    var graph = state.data.graph || { nodes: [], edges: [] };
    var byId = {};
    graph.nodes.forEach(function (node) { byId[node.id] = node; });
    var items = graph.nodes.map(function (node) {
      var outgoing = graph.edges.filter(function (edge) { return edge.kind === "link" && edge.source === node.id; });
      var incoming = graph.edges.filter(function (edge) { return edge.kind === "link" && edge.target === node.id; });
      return h("li", null, [
        h("div", { class: "badges" }, [
          h("a", { class: "linkbtn", href: pageHash(node.path) }, node.title),
          badge(node.kind), badge(t.trust[node.trustTier] || node.trustTier, "b-" + node.trustTier),
          node.missingProvenance ? badge(t.withoutSource, "b-warn") : null
        ]),
        h("dl", null, [
          h("div", null, [h("dt", null, t.pointsTo), h("dd", null, outgoing.length ? outgoing.map(function (edge) {
            return edge.broken ? edge.label + " (" + t.brokenLink + ")" : (byId[edge.target] ? byId[edge.target].title : edge.label);
          }).join(", ") : t.nothing)]),
          h("div", null, [h("dt", null, t.linkedBy), h("dd", null, incoming.length ? incoming.map(function (edge) {
            return byId[edge.source] ? byId[edge.source].title : edge.source;
          }).join(", ") : t.nobody)]),
          h("div", null, [h("dt", null, t.sources), h("dd", null, String(node.citationCount))])
        ])
      ]);
    });
    return h("div", { class: "main", "data-testid": "wiki-knowledge-map" }, [
      h("h2", { class: "title" }, t.mapTitle), h("p", { class: "meta" }, t.mapIntro), h("ul", { class: "mapi" }, items)
    ]);
  }

  function renderHeader() {
    var t = T();
    var data = state.data;
    var s = data.status;
    var health = data.graphHealth || { brokenLinks: 0, pagesWithoutProvenance: 0 };
    var stats = [
      badge(s.pageCount + " " + t.stats.pages),
      badge(s.sourceCount + " " + t.stats.sources)
    ];
    if (s.staleSourceCount > 0) stats.push(badge(s.staleSourceCount + " " + t.stats.stale, "b-warn"));
    if (s.expiredPageCount > 0) stats.push(badge(s.expiredPageCount + " " + t.stats.expired, "b-expired"));
    if (health.brokenLinks > 0) stats.push(badge(health.brokenLinks + " " + t.stats.broken, "b-warn"));
    if (health.pagesWithoutProvenance > 0) stats.push(badge(health.pagesWithoutProvenance + " " + t.stats.noSource));
    if (s.okfVersion) stats.push(badge(t.okf + " " + s.okfVersion));

    function langButton(code) {
      return h("button", {
        type: "button", class: "tab", "aria-pressed": state.lang === code ? "true" : "false", "data-testid": "wiki-lang-" + code, lang: code,
        onclick: function () { setLang(code); }
      }, code.toUpperCase());
    }
    return [
      h("h1", { "data-testid": "wiki-title" }, data.title),
      h("div", { class: "stats" }, stats),
      h("div", { class: "lang", role: "group", "aria-label": t.language }, [langButton("de"), langButton("en")])
    ];
  }

  function renderBar() {
    var t = T();
    var tabs = [["pages", t.pages], ["index", t.index], ["log", t.log], ["map", t.map]];
    return tabs.map(function (tab) {
      return h("button", {
        type: "button", class: "tab", "aria-pressed": state.route.view === tab[0] ? "true" : "false", "data-testid": "wiki-view-" + tab[0],
        onclick: function () { window.location.hash = tab[0] === "pages" ? "#/pages" : "#/" + tab[0]; }
      }, tab[1]);
    });
  }

  function render() {
    var t = T();
    var data = state.data;
    document.documentElement.lang = state.lang;
    document.title = data.title;
    els.hdr.textContent = "";
    append(els.hdr, renderHeader());
    els.bar.textContent = "";
    append(els.bar, renderBar());
    els.bar.setAttribute("aria-label", t.view);
    els.main.textContent = "";
    var view = state.route.view;
    if (view === "index") els.main.appendChild(renderDocument(t.indexTitle, data.index, data.indexPreviews, t.noIndex, "wiki-index"));
    else if (view === "log") els.main.appendChild(renderDocument(t.logTitle, data.log, data.logPreviews, t.noLog, "wiki-log"));
    else if (view === "map") els.main.appendChild(renderMap());
    else els.main.appendChild(renderPagesView());
  }

  function setLang(code) {
    state.lang = code;
    params.set("lang", code);
    try {
      window.history.replaceState(null, "", "?" + params.toString() + window.location.hash);
    } catch (error) {
      // Some sandboxed frames refuse history changes; the language still switches in place.
      console.warn("wiki: could not update the URL", error);
    }
    render();
  }

  function parseRoute() {
    var hash = window.location.hash.replace(/^#\/?/, "");
    if (hash === "index" || hash === "log" || hash === "map") return { view: hash, path: null };
    if (hash.indexOf("page/") === 0) {
      var path = null;
      try { path = decodeURIComponent(hash.slice(5)); } catch (error) { console.warn("wiki: bad page link", error); }
      return { view: "pages", path: path };
    }
    return { view: "pages", path: null };
  }

  function onRoute() {
    state.route = parseRoute();
    render();
    if (state.route.view === "pages") window.scrollTo(0, 0);
  }

  // ---- Boot -------------------------------------------------------------------------------

  function inlineData() {
    var node = document.getElementById("wiki-data");
    return node ? JSON.parse(node.textContent) : null;
  }

  function loadData() {
    // Pages opened from file:// cannot fetch their neighbours, so they read the embedded copy directly.
    if (window.location.protocol === "file:") return Promise.resolve(inlineData());
    return fetch("wiki.json", { cache: "no-cache" }).then(function (response) {
      if (!response.ok) throw new Error("wiki.json: HTTP " + response.status);
      return response.json();
    }).catch(function (error) {
      console.warn("wiki: falling back to the embedded wiki.json", error);
      return inlineData();
    });
  }

  function boot() {
    var root = document.getElementById("app");
    document.documentElement.lang = state.lang;
    if (embed) document.documentElement.classList.add("embed");
    els.hdr = h("header", { class: "hdr", hidden: embed ? true : null });
    els.bar = h("nav", { class: "bar" });
    els.main = h("main");
    root.textContent = "";
    root.appendChild(h("p", { class: "meta" }, T().loading));
    loadData().then(function (data) {
      if (!data || !Array.isArray(data.pages)) throw new Error("wiki.json is missing or malformed");
      state.data = data;
      state.pages = {};
      data.pages.forEach(function (page) { state.pages[page.path] = page; });
      root.textContent = "";
      append(root, [els.hdr, els.bar, els.main]);
      window.addEventListener("hashchange", onRoute);
      onRoute();
    }).catch(function (error) {
      console.error("wiki: load failed", error);
      root.textContent = "";
      root.appendChild(h("div", { class: "err", role: "alert", "data-testid": "wiki-error" }, T().loadError));
    });
  }

  boot();
})();
`;

/** Escapes JSON for a `<script type="application/json">` block: no `</script>`, no HTML comments. */
function jsonForScript(json: string): string {
  return json
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll(" ", "\\u2028")
    .replaceAll(" ", "\\u2029");
}

function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

const sha256Base64 = (text: string): string => createHash("sha256").update(text, "utf8").digest("base64");

/**
 * Builds `index.html`. Deterministic: the same data always yields the same bytes.
 *
 * The CSP pins the inline script and style by hash and allows requests to the own origin only
 * (`wiki.json`, bundle media). It is a belt-and-braces layer — the client does not use `innerHTML`.
 */
export function renderWikiBrowserHtml(options: { title: string; dataJson: string }): string {
  const csp = [
    "default-src 'none'",
    `script-src 'sha256-${sha256Base64(WIKI_BROWSER_JS)}'`,
    `style-src 'sha256-${sha256Base64(WIKI_BROWSER_CSS)}'`,
    // `file:` only matters when the export is opened from disk, where 'self' is not matched uniformly.
    "img-src 'self' file:",
    "media-src 'self' file:",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");

  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="referrer" content="no-referrer">',
    '<meta name="robots" content="noindex">',
    `<title>${escapeHtml(options.title)}</title>`,
    `<style>${WIKI_BROWSER_CSS}</style>`,
    "</head>",
    "<body>",
    '<div id="app"></div>',
    "<noscript>This wiki browser needs JavaScript. / Dieser Wiki-Browser braucht JavaScript.</noscript>",
    `<script id="wiki-data" type="application/json">${jsonForScript(options.dataJson)}</script>`,
    `<script>${WIKI_BROWSER_JS}</script>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
