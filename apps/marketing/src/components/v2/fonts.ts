import localFont from "next/font/local";

/* Self-hosted OFL files (see ./fonts/OFL-*.txt). Latin subset, no external request. */
const display = localFont({
  src: [
    { path: "./fonts/alegreya-latin-wght-normal.woff2", weight: "400 900", style: "normal" },
    { path: "./fonts/alegreya-latin-wght-italic.woff2", weight: "400 900", style: "italic" },
  ],
  variable: "--font-bmd-display",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});

const text = localFont({
  src: [
    { path: "./fonts/alegreya-sans-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/alegreya-sans-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-bmd-text",
  display: "swap",
  adjustFontFallback: "Arial",
});

export const bmdFonts = `${display.variable} ${text.variable}`;
