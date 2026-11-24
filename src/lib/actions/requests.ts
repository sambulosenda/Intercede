"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { aiConfigured, draftBrief, draftFollowUp, draftTestimony } from "../ai/claude";
import { redact } from "../ai/redact";
import { fetchScriptures } from "../bible";
import { audit, requireMember } from "../session";
import { triageSavedRequest } from "../triage";
import { laterStatus, type Status } from "../types";

function back(id: string, error?: string): never {
  revalidatePath(`/requests/${id}`);
  revalidatePath("/inbox");
  redirect(`/requests/${id}${error ? `?error=${encodeURIComponent(error)}` : ""}`);
}

async function loadRequest(id: string) {
  const ctx = await requireMember();
  const { data: req } = await ctx.supabase
    .from("requests")
    .select(
      "id, privacy, status, church:churches(ai_enabled), details:request_details(body, requester_name, requester_contact, theme, testimony_consent)",
    )
    .eq("id", id)
    .single();
  // RLS returns no details when the member may not read the request.
  const details = (req?.details ?? null) as unknown as {
    body: string;
    requester_name: string | null;
    requester_contact: string | null;
    theme: string | null;
    testimony_consent: boolean;
  } | null;
  if (!req || !details) redirect("/inbox");
  const church = req.church as unknown as { ai_enabled: boolean };
  const aiAllowed = church.ai_enabled && req.privacy !== "pastors" && aiConfigured();
  const redacted = redact(details.body, { name: details.requester_name, contact: details.requester_contact });
  return { ...ctx, req: { ...req, status: req.status as Status }, details, aiAllowed, redacted };
}

function isLeader(role: string) {
  return role === "coordinator" || role === "pastor";
}

// ---------------------------------------------------------------- assign and pray

export async function assignRequest(formData: FormData) {
  const id = String(formData.get("request_id"));
  const memberId = String(formData.get("member_id"));
  const { supabase, member, req } = await loadRequest(id);
  if (!isLeader(member.role)) back(id, "Only a coordinator or pastor can assign requests.");

  const { error } = await supabase
    .from("assignments")
    .insert({ request_id: id, member_id: memberId, assigned_by: member.id });
  if (error) back(id, "Could not assign this request.");
  await supabase
    .from("requests")
    .update({ assigned_to: memberId, status: laterStatus(req.status, "assigned") })
    .eq("id", id);
  await audit(supabase, member, "assigned", id);
  back(id);
}

export async function markPrayed(formData: FormData) {
  const id = String(formData.get("request_id"));
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000) || null;
  const { supabase, member, req } = await loadRequest(id);

  const { data: mine } = await supabase
    .from("assignments")
    .select("id")
    .eq("request_id", id)
    .eq("member_id", member.id)
    .order("assigned_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (mine) {
    await supabase.from("assignments").update({ prayed_at: new Date().toISOString(), note }).eq("id", mine.id);
  } else if (isLeader(member.role)) {
    await supabase
      .from("assignments")
      .insert({ request_id: id, member_id: member.id, assigned_by: member.id, prayed_at: new Date().toISOString(), note });
  } else {
    back(id, "This request is not assigned to you.");
  }
  await supabase.from("requests").update({ status: laterStatus(req.status, "prayed") }).eq("id", id);
  await audit(supabase, member, "marked prayed", id);
  back(id);
}

export async function acknowledgeUrgent(formData: FormData) {
  const id = String(formData.get("request_id"));
  const { supabase, member } = await loadRequest(id);
  if (member.role !== "pastor") back(id, "Only a pastor can acknowledge an urgent request.");
  await supabase.from("requests").update({ pastor_ack_at: new Date().toISOString(), pastor_ack_by: member.id }).eq("id", id);
  await audit(supabase, member, "pastor acknowledged", id);
  back(id);
}

export async function retriage(formData: FormData) {
  const id = String(formData.get("request_id"));
  const { supabase, member, aiAllowed } = await loadRequest(id);
  if (!isLeader(member.role)) back(id, "Only a coordinator or pastor can re-run sorting.");
  if (!aiAllowed) back(id, "AI sorting is not available for this request.");
  await triageSavedRequest(id);
  await audit(supabase, member, "re-ran triage", id);
  back(id);
}

// ---------------------------------------------------------------- prayer brief

export async function generateBrief(formData: FormData) {
  const id = String(formData.get("request_id"));
  const { supabase, member, details, aiAllowed, redacted } = await loadRequest(id);
  if (!aiAllowed) back(id, "The AI is not used for this request. Write prayer points in the notes instead.");
  try {
    const brief = await draftBrief(redacted, details.theme);
    const scriptures = await fetchScriptures(supabase, brief.scripture_references);
    const { error } = await supabase.from("briefs").upsert({
      request_id: id,
      prayer_points: brief.prayer_points,
      scriptures,
      ai_generated: true,
      approved_by: null,
      created_at: new Date().toISOString(),
    });
    if (error) throw error;
    await audit(supabase, member, "generated brief", id);
  } catch (err) {
    console.error(err);
    back(id, "Could not prepare a prayer brief just now. Please try again.");
  }
  back(id);
}

export async function approveBrief(formData: FormData) {
  const id = String(formData.get("request_id"));
  const { supabase, member } = await loadRequest(id);
  await supabase.from("briefs").update({ approved_by: member.id }).eq("request_id", id);
  back(id);
}

// ---------------------------------------------------------------- follow-up

export async function createFollowUp(formData: FormData) {
  const id = String(formData.get("request_id"));
  const { supabase, member, details, aiAllowed, redacted } = await loadRequest(id);
  if (!isLeader(member.role)) back(id, "Only a coordinator or pastor can prepare a follow-up.");
  if (!details.requester_contact) back(id, "The requester left no contact, so there is no one to follow up with.");

  const firstName = details.requester_name?.split(/\s+/)[0] ?? null;
  let draft: string;
  let ai = true;
  if (aiAllowed) {
    try {
      draft = await draftFollowUp(redacted, firstName);
    } catch (err) {
      console.error(err);
      back(id, "Could not draft a follow-up just now. Please try again.");
    }
  } else {
    ai = false;
    draft = `${firstName ? `Hi ${firstName},` : "Hello,"}\n\nWe wanted to let you know we have been praying for you this week. How are things now? If you would like to talk with someone from the church, just reply and we will arrange it.\n\nThe prayer team`;
  }
  await supabase.from("follow_ups").insert({ request_id: id, draft, ai_generated: ai });
  await audit(supabase, member, "drafted follow-up", id);
  back(id);
}

export async function approveFollowUp(formData: FormData) {
  const id = String(formData.get("request_id"));
  const followUpId = String(formData.get("follow_up_id"));
  const text = String(formData.get("text") ?? "").trim();
  const { supabase, member, req } = await loadRequest(id);
  if (!isLeader(member.role)) back(id, "Only a coordinator or pastor can approve a follow-up.");
  if (!text) back(id, "The follow-up message is empty.");
  const now = new Date().toISOString();
  // Hackathon build: approving marks it ready and sent by hand. v1 sends email (R15).
  await supabase
    .from("follow_ups")
    .update({ edited_text: text, approved_by: member.id, approved_at: now, sent_at: now })
    .eq("id", followUpId);
  await supabase.from("requests").update({ status: laterStatus(req.status, "followed_up") }).eq("id", id);
  await audit(supabase, member, "approved and sent follow-up", id);
  back(id);
}

// ---------------------------------------------------------------- answered and testimony

export async function markAnswered(formData: FormData) {
  const id = String(formData.get("request_id"));
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 2000);
  const { supabase, member, details, aiAllowed, redacted } = await loadRequest(id);
  if (!isLeader(member.role)) back(id, "Only a coordinator or pastor can mark a request answered.");

  await supabase.from("requests").update({ answered: true }).eq("id", id);
  await audit(supabase, member, "marked answered", id);

  if (details.testimony_consent && aiAllowed) {
    try {
      const draft = await draftTestimony(redacted, notes);
      await supabase.from("testimonies").upsert({ request_id: id, draft, ai_generated: true }, { onConflict: "request_id" });
      await audit(supabase, member, "drafted testimony", id);
    } catch (err) {
      console.error(err);
      back(id, "Marked answered, but the testimony draft failed. Try again from this page.");
    }
  }
  back(id);
}

export async function approveTestimony(formData: FormData) {
  const id = String(formData.get("request_id"));
  const text = String(formData.get("text") ?? "").trim();
  const { supabase, member } = await loadRequest(id);
  if (member.role !== "pastor") back(id, "Only a pastor can approve a testimony.");
  await supabase
    .from("testimonies")
    .update({ edited_text: text, approved_by: member.id, approved_at: new Date().toISOString() })
    .eq("request_id", id);
  await audit(supabase, member, "approved testimony", id);
  back(id);
}

export async function closeRequest(formData: FormData) {
  const id = String(formData.get("request_id"));
  const { supabase, member } = await loadRequest(id);
  if (!isLeader(member.role)) back(id, "Only a coordinator or pastor can close a request.");
  await supabase.from("requests").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", id);
  await audit(supabase, member, "closed", id);
  back(id);
}
