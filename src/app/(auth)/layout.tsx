import { connection } from "next/server";
import { Logo } from "@/components/layout/logo";
import { leesInstallatieWeergave } from "@/lib/installatie";

// Ook hier het logo of de naam van deze installatie, zodat je je niet bij de
// verkeerde kennisbank aanmeldt. connection(): env bij het opvragen lezen.
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex justify-center">
          <Logo installatie={leesInstallatieWeergave()} variant="groot" />
        </div>
        {children}
      </div>
    </div>
  );
}
