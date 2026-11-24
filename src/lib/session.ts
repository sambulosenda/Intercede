import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Member } from "./types";

/** The signed-in member, or a redirect to /login. */
export async function requireMember() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: member } = await supabase
    .from("members")
    .select("id, church_id, display_name, email, role")
    .eq("user_id", user.id)
    .single<Member>();
  if (!member) redirect("/login?error=not-a-member");
  return { supabase, member };
}

export async function audit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  member: Member,
  action: string,
  requestId?: string,
) {
  await supabase.from("audit_log").insert({
    church_id: member.church_id,
    member_id: member.id,
    request_id: requestId ?? null,
    action,
  });
}
