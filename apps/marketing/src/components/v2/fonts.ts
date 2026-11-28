import localFont from "next/font/local";
import "./fonts-faces.css";

/* Self-hosted OFL files (see ./fonts/OFL-*.txt), no external request. Subset to German and English,
   under 40 KB together: rebuild with ./fonts/subset.py.
   Only the two faces that carry most of the first screen are preloaded: display upright and text 400.
   Italic and bold are declared in ./fonts-faces.css and load when the CSS asks for them, so they do
   not compete with the stylesheets and the header logo on a slow line. They share the family name, and
   so the metric-matched fallback, of their preloaded sibling. */
const display = localFont({
  src: "./fonts/alegreya-subset-wght-normal.woff2",
  weight: "400 700",
  style: "normal",
  declarations: [{ prop: "font-family", value: "bmdDisplay" }],
  variable: "--font-bmd-display",
  display: "swap",
  preload: true,
  adjustFontFallback: "Times New Roman",
});

const text = localFont({
  src: "./fonts/alegreya-sans-subset-400-normal.woff2",
  weight: "400",
  style: "normal",
  declarations: [{ prop: "font-family", value: "bmdText" }],
  variable: "--font-bmd-text",
  display: "swap",
  preload: true,
  adjustFontFallback: "Arial",
});

export const bmdFonts = `${display.variable} ${text.variable}`;
