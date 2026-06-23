import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Front-end mock — all data is client-side seeded, so the whole app exports to
  // static HTML (out/). Drop `out/` onto any static host (Cloudflare Pages, etc.).
  output: "export",
  reactStrictMode: true,
  // Static hosts serve folder/index.html most reliably.
  trailingSlash: true,
  // No image optimizer on a static host.
  images: { unoptimized: true },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
