import type { NextConfig } from "next";

// SQL Server wordt op Vercel geweigerd (src/lib/config.ts). In een Vercel-build
// gaan tedious en tarn daarom naar een lege module die alleen een fout gooit:
// anders komen tedious en zijn Azure-afhankelijkheden (± 3,5 MB) in elke
// functie, ook via instrumentation.ts (die geldt voor alle functies, en daar
// werkt outputFileTracingExcludes niet). Zelf hosten (standalone) neemt ze wel mee.
const opVercel = !!process.env.VERCEL;

const nextConfig: NextConfig = {
  // Zelf hosten (Docker of als Node-dienst): BUILD_STANDALONE=1 npm run build
  // maakt een zelfstandige server in .next/standalone. Vercel gebruikt dit niet.
  output: process.env.BUILD_STANDALONE ? "standalone" : undefined,
  // De SQL Server-driver (tedious) niet bundelen: Turbopack struikelt over zijn
  // afhankelijkheden (@azure/identity → open → powershell-utils). Hij wordt pas
  // bij de eerste query op SQL Server geladen (src/lib/db/mssql-dialect.ts).
  serverExternalPackages: opVercel ? [] : ["tedious"],
  turbopack: opVercel
    ? { resolveAlias: { tedious: "./src/lib/db/zonder-mssql.ts", tarn: "./src/lib/db/zonder-mssql.ts" } }
    : undefined,
  // Extra zekerheid voor de pagina's en routes in een Vercel-build.
  outputFileTracingExcludes: opVercel
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
