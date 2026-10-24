import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.bloommd.mobile",
  appName: "BloomMD",
  webDir: "dist",
  server: {
    // In development, load from Vite dev server
    // url: "http://localhost:5174",
    // cleartext: true,
  },
  plugins: {
    Filesystem: {
      // Request permissions on first use
    },
    SystemBars: {
      // The app interface is light only: dark status/navigation bar icons also in system dark mode.
      style: "LIGHT",
    },
  },
  ios: {
    contentInset: "automatic",
    // iPad gets the desktop-class layout (side panel, wide map); iPhone stays mobile.
    preferredContentMode: "recommended",
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
