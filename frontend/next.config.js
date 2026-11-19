/** @type {import("next").NextConfig} */
const path = require("path");

const nextConfig = {
  // Self-contained server bundle for the Docker image (frontend/Dockerfile).
  output: "standalone",
  experimental: {
    externalDir: true,
    // Monorepo: trace files from the repo root so ../shared is included in the standalone bundle.
    outputFileTracingRoot: path.join(__dirname, "..")
  },
  async redirects() {
    return [{ source: "/favicon.ico", destination: "/icon.svg", permanent: false }];
  },
  /** Proxy API to backend so the browser calls same-origin `/api/*` (avoids CORS / blocked cross-origin fetches). */
  async rewrites() {
    const backend = process.env.BACKEND_URL || "http://127.0.0.1:4000";
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/uploads/:path*", destination: `${backend}/uploads/:path*` }
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups"
          }
        ]
      }
    ];
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias = { ...config.resolve.alias };
      // Use browser build (fetch-based); subpath not in exports, so resolve via package dir
      const snarkjsBuildDir = path.dirname(require.resolve("snarkjs"));
      config.resolve.alias.snarkjs = path.join(snarkjsBuildDir, "browser.esm.js");
    }
    return config;
  }
};

module.exports = nextConfig;
