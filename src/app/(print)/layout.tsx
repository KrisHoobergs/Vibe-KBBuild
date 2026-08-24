// Minimale layout voor printweergaven: geen sidebar/topbar en geen
// h-screen/overflow-container, zodat het hele document over meerdere
// pagina's afdrukt. .print-light forceert het lichte kleurenschema,
// ook wanneer de gebruiker het donkere thema aan heeft.
export default function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="print-light min-h-screen bg-background text-foreground">
      {children}
    </div>
  );
}
