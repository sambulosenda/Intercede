import "server-only";
import { createServiceClient } from "./supabase/server";
import { aiConfigured, triageRequest } from "./ai/claude";
import { redact } from "./ai/redact";

/**
 * Runs AI triage on a saved request. Called after the form response is sent.
 * If the AI is off, not configured or fails, the request stays in the inbox as
 * "unsorted" (triaged_at is null): it is never lost.
 */
export async function triageSavedRequest(requestId: string) {
  const db = createServiceClient();
  const { data: req } = await db
    .from("requests")
    .select("id, privacy, church:churches(ai_enabled), details:request_details(body, requester_name, requester_contact)")
    .eq("id", requestId)
    .single();
  if (!req) return;

  const church = req.church as unknown as { ai_enabled: boolean } | null;
  const details = req.details as unknown as { body: string; requester_name: string | null; requester_contact: string | null } | null;
  if (!details || req.privacy === "pastors" || !church?.ai_enabled || !aiConfigured()) return;

  try {
    const result = await triageRequest(
      redact(details.body, { name: details.requester_name, contact: details.requester_contact }),
    );
    await db
      .from("request_details")
      .update({ theme: result.theme, urgency_reason: result.reason || null, safeguarding: result.safeguarding })
      .eq("request_id", requestId);
    await db
      .from("requests")
      .update({ urgency: result.safeguarding && result.urgency === "normal" ? "urgent" : result.urgency, triaged_at: new Date().toISOString() })
      .eq("id", requestId);
  } catch (err) {
    console.error("Triage failed; request left unsorted", requestId, err);
  }
}
