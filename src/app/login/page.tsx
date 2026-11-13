import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  // ?error=link: an email link (password reset, confirmation) expired, was used, or opened elsewhere.
  const { error } = await searchParams;
  return <LoginForm linkError={error === "link"} />;
}
