import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // multiple agents/sessions build in this repo concurrently; give each its
  // own dist dir via NEXT_DIST_DIR to stop them clobbering a shared .next
  distDir: process.env.NEXT_DIST_DIR || ".next",
  turbopack: {
    root: __dirname,
  },
  experimental: {
    // dev disk cache corrupts on this machine (SST write failures ->
    // missing build manifests -> 500s); trade slower cold starts for stability
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
