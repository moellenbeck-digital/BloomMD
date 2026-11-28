import localFont from "next/font/local";

/* Self-hosted OFL files (see ./fonts/OFL-*.txt), no external request. Subset to German and English,
   under 40 KB together: rebuild with ./fonts/subset.py.
   No preload: preloaded fonts compete with the CSS and doubled the first paint on a throttled line.
   Text paints at once in a metric-matched fallback and swaps. */
const display = localFont({
  src: [
    { path: "./fonts/alegreya-subset-wght-normal.woff2", weight: "400 700", style: "normal" },
    { path: "./fonts/alegreya-subset-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-bmd-display",
  display: "swap",
  preload: false,
  adjustFontFallback: "Times New Roman",
});

const text = localFont({
  src: [
    { path: "./fonts/alegreya-sans-subset-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/alegreya-sans-subset-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-bmd-text",
  display: "swap",
  preload: false,
  adjustFontFallback: "Arial",
});

export const bmdFonts = `${display.variable} ${text.variable}`;
