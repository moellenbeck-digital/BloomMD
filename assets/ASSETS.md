# BloomMD — Asset Übersicht

## App Icons

| Datei | Größe | Verwendung |
|---|---|---|
| `app-icon-ios-1024.svg` | 1024×1024 | iOS App Store, iPad, iPhone |
| `app-icon-macos-512.svg` | 512×512 | macOS App (mit Shadow) |
| `app-icon-windows-256.svg` | 256×256 | Windows .ico / Linux |
| `app-icon-android-432.svg` | 432×432 | Android Adaptive Icon (Foreground) |

## Favicons & PWA

| Datei | Größe | Verwendung |
|---|---|---|
| `favicon-16.svg` | 16×16 | Browser-Tab Favicon |
| `favicon-32.svg` | 32×32 | Browser-Tab Favicon (HiDPI) |
| `pwa-icon-192.svg` | 192×192 | PWA Manifest, Android Home Screen |
| `pwa-icon-512.svg` | 512×512 | PWA Manifest, Splash |

## Logos (Wordmarks)

| Datei | Variante | Verwendung |
|---|---|---|
| `logo-horizontal-light.svg` | Hell | Website Header, Docs, heller Hintergrund |
| `logo-horizontal-dark.svg` | Dunkel | Dark Mode, dunkler Hintergrund |
| `logo-stacked-light.svg` | Hell, gestapelt | Landing Page Hero, zentrierte Layouts |
| `logo-stacked-dark.svg` | Dunkel, gestapelt | Dark Mode Hero |

## Social Media / Marketing

| Datei | Größe | Verwendung |
|---|---|---|
| `og-image-1200x630.svg` | 1200×630 | Open Graph (Facebook, LinkedIn, WhatsApp) |
| `twitter-card-1200x600.svg` | 1200×600 | Twitter/X Card |
| `platform-badges.svg` | 680×48 | Landing Page "Available on" Leiste |

## Splash Screens (Mobile)

| Datei | Größe | Verwendung |
|---|---|---|
| `splash-portrait.svg` | 1284×2778 | iOS/Android Splash (Light) |
| `splash-portrait-dark.svg` | 1284×2778 | iOS/Android Splash (Dark) |

## Farbpalette

| Farbe | Hex | Verwendung |
|---|---|---|
| Orange (Primary) | `#FF6B35` | Bloom-Akzent, Horizontale Striche |
| Orange (Secondary) | `#F7931E` | Gradient-Ende |
| Schwarz | `#1A1A1A` | Vertikale Striche, Text |
| Weiß | `#FAFAFA` | Hintergründe (Light Mode) |
| Dunkel | `#111111` | Hintergründe (Dark Mode) |
| Grau | `#666666` | "MD" im Wordmark (Light) |
| Grau (Dark) | `#888888` | "MD" im Wordmark (Dark) |

## PNG-Export

SVGs können mit jedem Tool in PNG konvertiert werden:

```bash
# Mit Inkscape (Batch)
for f in *.svg; do inkscape "$f" --export-type=png --export-filename="${f%.svg}.png"; done

# Mit rsvg-convert
rsvg-convert -w 1024 -h 1024 app-icon-ios-1024.svg > app-icon-ios-1024.png

# Für iOS alle Größen generieren
rsvg-convert -w 180 -h 180 app-icon-ios-1024.svg > icon-60@3x.png
rsvg-convert -w 120 -h 120 app-icon-ios-1024.svg > icon-60@2x.png
rsvg-convert -w 167 -h 167 app-icon-ios-1024.svg > icon-83.5@2x.png
rsvg-convert -w 152 -h 152 app-icon-ios-1024.svg > icon-76@2x.png
```
