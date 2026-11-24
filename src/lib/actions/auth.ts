"use server";

import { redirect } from "next/navigation";
import { createClient } from "../supabase/server";
import { DEMO_USERS } from "../demo";

export type AuthState = { error?: string };

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient();
  const demo = formData.get("demo");
  let email = String(formData.get("email") ?? "");
  let password = String(formData.get("password") ?? "");

  if (demo) {
    if (process.env.DEMO_MODE !== "true" || !process.env.DEMO_PASSWORD) {
      return { error: "Demo sign-in is turned off." };
    }
    const user = DEMO_USERS.find((u) => u.email === demo);
    if (!user) return { error: "Unknown demo account." };
    email = user.email;
    password = process.env.DEMO_PASSWORD;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "That email and password did not match." };
  redirect("/inbox");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
