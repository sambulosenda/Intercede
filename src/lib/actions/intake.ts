"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createServiceClient } from "../supabase/server";
import { triageSavedRequest } from "../triage";

const FormSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().trim().max(80).optional().transform((v) => v || null),
  contact: z.string().trim().max(120).optional().transform((v) => v || null),
  body: z.string().trim().min(3, "Please tell us what to pray for.").max(4000),
  privacy: z.enum(["team", "leaders", "pastors"]),
  consent: z.literal("on", { message: "Please tick the consent box so we can keep your request." }),
  testimony_consent: z.literal("on").optional(),
});

export type IntakeState = { error?: string };

export async function submitRequest(_prev: IntakeState, formData: FormData): Promise<IntakeState> {
  const parsed = FormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  const f = parsed.data;

  const db = createServiceClient();
  const { data: church } = await db
    .from("churches")
    .select("id, follow_up_days")
    .eq("slug", f.slug)
    .single();
  if (!church) return { error: "We could not find this church." };

  const now = new Date();
  const pastorsOnly = f.privacy === "pastors";
  const { data: req, error } = await db
    .from("requests")
    .insert({
      church_id: church.id,
      privacy: f.privacy,
      has_contact: Boolean(f.contact),
      follow_up_due_at: f.contact
        ? new Date(now.getTime() + church.follow_up_days * 86_400_000).toISOString()
        : null,
      // Pastors-only requests are never sent to the AI; they go straight to a pastor.
      urgency: pastorsOnly ? "pastoral" : "normal",
      triaged_at: pastorsOnly ? now.toISOString() : null,
    })
    .select("id")
    .single();
  if (error || !req) return { error: "Something went wrong saving your request. Please try again." };

  const { error: detailsError } = await db.from("request_details").insert({
    request_id: req.id,
    body: f.body,
    requester_name: f.name,
    requester_contact: f.contact,
    consent_at: now.toISOString(),
    testimony_consent: f.testimony_consent === "on",
    urgency_reason: pastorsOnly ? "Sent to pastors only." : null,
  });
  if (detailsError) {
    await db.from("requests").delete().eq("id", req.id);
    return { error: "Something went wrong saving your request. Please try again." };
  }

  if (!pastorsOnly) after(() => triageSavedRequest(req.id));

  redirect(`/c/${f.slug}/thanks?p=${f.privacy}${f.contact ? "&c=1" : ""}`);
}
