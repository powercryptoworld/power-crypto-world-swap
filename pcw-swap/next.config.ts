// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
      // let production builds finish even if ESLint has errors
          ignoreDuringBuilds: true,
  },
  typescript: {
    // let production builds finish even if there are type errors
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
