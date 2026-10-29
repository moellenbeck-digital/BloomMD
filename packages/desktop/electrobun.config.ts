import { join } from "node:path";
import type { ElectrobunConfig } from "electrobun";
import packageJson from "./package.json";
import { macOSReleaseEnabled } from "./scripts/macos-signing";
import { prepareSplashHtml } from "./src/shared/splash-html";

const signedMacOSRelease = macOSReleaseEnabled();

const buildMetadataDefines: Record<string, string> = {
  "process.env.BLOOMMD_RELEASE_VERSION": JSON.stringify(process.env.BLOOMMD_RELEASE_VERSION ?? packageJson.version),
  "process.env.BLOOMMD_BUILD_SHA": JSON.stringify(process.env.BLOOMMD_BUILD_SHA ?? ""),
  "process.env.BLOOMMD_BUILD_TAG": JSON.stringify(process.env.BLOOMMD_BUILD_TAG ?? ""),
  "process.env.BLOOMMD_BUILD_TIME": JSON.stringify(process.env.BLOOMMD_BUILD_TIME ?? ""),
};

// The splash version comes from the same build metadata as About; the template only holds a placeholder.
const splashHtml = ".generated/splash/index.html";
prepareSplashHtml({
  templateFile: join(import.meta.dir, "src/splash/index.html"),
  outFile: join(import.meta.dir, splashHtml),
  env: process.env,
  packageVersion: packageJson.version,
});

export default {
  app: {
    name: "BloomMD",
    identifier: "app.bloommd",
    version: packageJson.version,
    description: "Visual Markdown mind maps with Markdown as the source of truth.",
    urlSchemes: ["bloommd"],
    fileAssociations: [{ ext: ["md", "markdown"], name: "Markdown Document", role: "Editor" }],
  },
  build: {
    bun: {
      define: buildMetadataDefines,
    },
    copy: {
      "../../LICENSE": "LICENSE",
      "../../LICENSE-MIT-legacy": "LICENSE-MIT-legacy",
      "dist/index.html": "views/mainview/index.html",
      "dist/assets": "views/mainview/assets",
      [splashHtml]: "views/splash/index.html",
    },
    // Electrobun converts the iconset to `.icns` with `iconutil` during the build. The PNGs are
    // committed (see `scripts/build-macos-icon.sh`) so the icon does not depend on which machine
    // happened to rasterise the SVG.
    mac: {
      bundleCEF: false,
      icons: "assets/AppIcon.iconset",
      codesign: signedMacOSRelease,
      notarize: signedMacOSRelease,
      entitlements: { "com.apple.security.get-task-allow": false },
    },
    linux: { bundleCEF: false, icon: "assets/AppIcon.iconset/icon_128x128.png" },
    win: { bundleCEF: false },
  },
  release: {
    baseUrl: "https://bloommd.io/_desktop-updates",
    generatePatch: true,
  },
  scripts: {
    postBuild: "scripts/prepare-macos-bundle.ts",
    postWrap: "scripts/prepare-macos-bundle.ts",
  },
} satisfies ElectrobunConfig;
