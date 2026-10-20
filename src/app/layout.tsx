import type { Metadata } from "next";
import { connection } from "next/server";
import { Montserrat, Roboto_Slab } from "next/font/google";
import { leesInstallatieWeergave, paginaTitel } from "@/lib/installatie";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-sans",
  subsets: ["latin"],
});

const robotoSlab = Roboto_Slab({
  variable: "--font-heading",
  subsets: ["latin"],
});

// Titel en tabblad-icoon per installatie (INSTALLATIE_* , zie installatie.ts).
// connection(): de env pas bij het opvragen lezen, niet bij het bouwen. Een
// Docker-image wordt één keer gebouwd en krijgt de instellingen pas bij het
// starten. Daardoor zijn ook "/" en de 404-pagina dynamisch (de rest was dat al).
// De titel is een gewone tekst, geen template: de printpagina zet haar eigen
// titel (de bestandsnaam bij "Opslaan als PDF").
export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const installatie = leesInstallatieWeergave();
  return {
    title: paginaTitel(installatie),
    description: "Kennisbank voor het team",
    icons: {
      icon: [
        installatie?.icoon ??
          (installatie
            ? { url: `/api/icoon?v=${installatie.versie}`, type: "image/svg+xml" }
            : { url: "/favicon.ico", type: "image/x-icon" }),
      ],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nl" suppressHydrationWarning>
      <body
        className={`${montserrat.variable} ${robotoSlab.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
