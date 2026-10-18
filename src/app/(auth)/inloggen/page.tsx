import { LoginForm } from "@/components/auth/login-form";

interface Props {
  searchParams: Promise<{ hersteld?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const { hersteld } = await searchParams;
  return (
    <LoginForm
      melding={hersteld ? "Je nieuwe wachtwoord is ingesteld. Log in om verder te gaan." : undefined}
    />
  );
}
