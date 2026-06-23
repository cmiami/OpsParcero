import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Front-end mock — no server data layer. Keep the build deterministic.
  reactStrictMode: true,
  typescript: {
    // Type errors are caught by `npm run typecheck` in CI; don't double-fail the build.
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
