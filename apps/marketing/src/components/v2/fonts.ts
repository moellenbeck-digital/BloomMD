import localFont from "next/font/local";

/* Self-hosted OFL files (see ./fonts/OFL-*.txt), no external request. Subset to German and English,
   under 40 KB together: rebuild with ./fonts/subset.py.
   Preloaded (cheap since the subset): the hero text then has its final font when it fades in. A later
   swap would repaint it and make it the LCP element. Slower lines still get the metric-matched fallback. */
const display = localFont({
  src: [
    { path: "./fonts/alegreya-subset-wght-normal.woff2", weight: "400 700", style: "normal" },
    { path: "./fonts/alegreya-subset-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-bmd-display",
  display: "swap",
  preload: true,
  adjustFontFallback: "Times New Roman",
});

const text = localFont({
  src: [
    { path: "./fonts/alegreya-sans-subset-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/alegreya-sans-subset-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-bmd-text",
  display: "swap",
  preload: true,
  adjustFontFallback: "Arial",
});

export const bmdFonts = `${display.variable} ${text.variable}`;
