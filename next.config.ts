import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Zelf hosten (Docker of als Node-dienst): BUILD_STANDALONE=1 npm run build
  // maakt een zelfstandige server in .next/standalone. Vercel gebruikt dit niet.
  output: process.env.BUILD_STANDALONE ? "standalone" : undefined,
};

export default nextConfig;
