import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Zelf hosten (Docker of als Node-dienst): BUILD_STANDALONE=1 npm run build
  // maakt een zelfstandige server in .next/standalone. Vercel gebruikt dit niet.
  output: process.env.BUILD_STANDALONE ? "standalone" : undefined,
  // De SQL Server-driver (tedious) niet bundelen: Turbopack struikelt over zijn
  // afhankelijkheden (@azure/identity → open → powershell-utils). Hij wordt pas
  // bij de eerste query op SQL Server geladen (src/lib/db/mssql-dialect.ts).
  serverExternalPackages: ["tedious"],
  // SQL Server wordt op Vercel geweigerd (src/lib/config.ts): tedious en zijn
  // Azure-afhankelijkheden niet mee in elke functie (± 3,5 MB). Zelf hosten
  // (standalone) neemt ze wel mee.
  outputFileTracingExcludes: process.env.VERCEL
    ? {
        "*": [
          "node_modules/tedious/**",
          "node_modules/@azure/**",
          "node_modules/@js-joda/**",
          "node_modules/@typespec/**",
        ],
      }
    : undefined,
};

export default nextConfig;
