"use client";

import { useActionState } from "react";
import { signIn, type AuthState } from "@/lib/actions/auth";

type DemoUser = { email: string; name: string; role: string };

export function LoginForm({ demoUsers }: { demoUsers: DemoUser[] }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(signIn, {});
  return (
    <>
      {demoUsers.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-muted">Demo: sign in as</h2>
          <div className="mt-2 grid gap-2">
            {demoUsers.map((u) => (
              <form key={u.email} action={action}>
                <input type="hidden" name="demo" value={u.email} />
                <button type="submit" disabled={pending} className="btn-secondary w-full justify-between">
                  <span>{u.name}</span>
                  <span className="text-xs font-normal capitalize text-muted">{u.role}</span>
                </button>
              </form>
            ))}
          </div>
          <div className="my-6 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
        </section>
      )}
      <form action={action} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="field" />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="field" />
        </div>
        {state.error && (
          <p role="alert" className="rounded-lg bg-urgent-soft px-3 py-2 text-sm text-urgent">{state.error}</p>
        )}
        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </>
  );
}
