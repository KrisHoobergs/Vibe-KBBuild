import Image from "next/image";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex justify-center">
          <Image src="/logo.png" alt="Knowledge Build" width={180} height={40} priority />
        </div>
        {children}
      </div>
    </div>
  );
}
