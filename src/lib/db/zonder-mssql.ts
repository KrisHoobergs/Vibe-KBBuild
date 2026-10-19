// Vervangt tedious en tarn in een Vercel-build (zie next.config.ts). SQL Server
// wordt op Vercel geweigerd (src/lib/config.ts), dus deze module wordt daar
// nooit echt geladen. Zo komt de SQL Server-driver met zijn Azure-
// afhankelijkheden (± 3,5 MB) niet in elke Vercel-functie terecht.
export {};

throw new Error("SQL Server wordt op Vercel niet ondersteund; host de kennisbank zelf (Docker of Windows-dienst)");
