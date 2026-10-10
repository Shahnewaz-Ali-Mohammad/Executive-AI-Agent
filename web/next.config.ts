/**
 * Next.js configuration.
 *
 * Environment variables: the whole project shares ONE .env file at the
 * project root (next to docker-compose.yml). The npm scripts load it with
 * dotenv-cli (`dotenv -e ../.env -- next dev`), see package.json.
 */
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server build, only when building the Docker image
  // (web/Dockerfile sets NEXT_OUTPUT=standalone). Normal `npm start` uses the regular build.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,

  // Let `npm run dev` be opened from a phone: through an ngrok tunnel, or on the
  // same Wi-Fi at http://<this Mac's IP>:3100. Without this, the dev server blocks
  // the page's scripts from other hostnames and nothing reacts to taps.
  allowedDevOrigins: [
    "*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.app", "*.ngrok.io", "*.trycloudflare.com",
    "192.168.*.*", "10.*.*.*", "172.*.*.*",
  ],

  // Hide the round "N" dev badge: on a phone it covers the attach button.
  // Errors still show up during development.
  devIndicators: false,

  cacheComponents: true,
  partialPrefetching: true,

  // pdf.js is used on the server by the mock backend; load it from
  // node_modules at runtime instead of bundling it.
  serverExternalPackages: ["pdfjs-dist"],

  experimental: {
    // Uploads pass through the login proxy, which buffers request bodies.
    // Must be at least MAX_UPLOAD_MB (default 50) plus form overhead.
    proxyClientMaxBodySize: "60mb",
  },

  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
