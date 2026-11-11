import { withPayload } from "@payloadcms/next/withPayload";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// The admin UI is the only page. Payload's admin needs inline scripts and styles; everything else is
// closed. The admin is never embedded elsewhere.
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  process.env.NODE_ENV === "production" ? "upgrade-insecure-requests" : "",
]
  .filter(Boolean)
  .join("; ");

/** @type {import("next").NextConfig} */
const nextConfig = {
  outputFileTracingRoot: join(__dirname, "../.."),
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), browsing-topics=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
  webpack: (webpackConfig) => {
    // Payload's own packages import `./x.js` for TypeScript files.
    webpackConfig.resolve.extensionAlias = {
      ".cjs": [".cts", ".cjs"],
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return webpackConfig;
  },
};

export default withPayload(nextConfig, { devBundleServerPackages: false });
