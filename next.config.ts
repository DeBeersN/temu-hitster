import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // We serve on the 127.0.0.1 loopback (to match Spotify's required redirect
  // URI). Allow that origin so Next's dev resources / RSC resume aren't blocked
  // as cross-origin, which otherwise leaves client pages stuck on their shell.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  cacheComponents: true,
  partialPrefetching: true,
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
