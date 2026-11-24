import { Logo } from "@/components/Logo";
import { DEMO_USERS } from "@/lib/demo";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const demo = process.env.DEMO_MODE === "true";
  return (
    <main className="mx-auto max-w-sm px-4 py-10">
      <Logo />
      <h1 className="mt-8 font-serif text-2xl font-semibold">Prayer team sign in</h1>
      {error === "not-a-member" && (
        <p role="alert" className="mt-3 rounded-lg bg-urgent-soft px-3 py-2 text-sm text-urgent">
          This account is not a member of a church prayer team yet.
        </p>
      )}
      <LoginForm demoUsers={demo ? DEMO_USERS.map((u) => ({ ...u })) : []} />
    </main>
  );
}
