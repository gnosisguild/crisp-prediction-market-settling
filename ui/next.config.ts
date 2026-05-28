import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root so Turbopack stops complaining about multiple
    // lockfiles (we have bun.lock at the repo root and there's no need for
    // it to scan above ui/).
    root: resolve(here),
  },
};

export default nextConfig;
