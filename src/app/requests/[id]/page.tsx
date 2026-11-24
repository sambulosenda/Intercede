import Link from "next/link";
import { notFound } from "next/navigation";
import { LockIcon, PrivacyBadge, StatusBadge, UrgencyBadge } from "@/components/Badges";
import { SubmitButton } from "@/components/SubmitButton";
import { TeamHeader } from "@/components/TeamHeader";
import {
  acknowledgeUrgent,
  approveBrief,
  approveFollowUp,
  approveTestimony,
  assignRequest,
  closeRequest,
  createFollowUp,
  generateBrief,
  markAnswered,
  markPrayed,
  retriage,
} from "@/lib/actions/requests";
import { aiConfigured } from "@/lib/ai/claude";
import { shortDate, waitTime } from "@/lib/format";
import { audit, requireMember } from "@/lib/session";
import type { Member, Privacy, Scripture, Status, Urgency } from "@/lib/types";

export const dynamic = "force-dynamic";

type Detail = {
  id: string;
  privacy: Privacy;
  status: Status;
  urgency: Urgency;
  triaged_at: string | null;
  answered: boolean;
  assigned_to: string | null;
  pastor_ack_at: string | null;
  follow_up_due_at: string | null;
  has_contact: boolean;
  created_at: string;
  church: { name: string; ai_enabled: boolean; safeguarding_contact: string | null };
  details: {
    body: string;
    requester_name: string | null;
    requester_contact: string | null;
    theme: string | null;
    urgency_reason: string | null;
    safeguarding: boolean;
    testimony_consent: boolean;
  } | null;
  assignments: { id: string; member_id: string; assigned_at: string; prayed_at: string | null; note: string | null; member: { display_name: string } | null }[];
  brief: { prayer_points: string[]; scriptures: Scripture[]; ai_generated: boolean; approved_by: string | null } | null;
  follow_ups: { id: string; draft: string; edited_text: string | null; ai_generated: boolean; approved_at: string | null; sent_at: string | null; created_at: string }[];
  testimony: { draft: string; edited_text: string | null; ai_generated: boolean; approved_at: string | null } | null;
};

export default async function RequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const { supabase, member } = await requireMember();

  const { data: r } = await supabase
    .from("requests")
    .select(
      `id, privacy, status, urgency, triaged_at, answered, assigned_to, pastor_ack_at, follow_up_due_at, has_contact, created_at,
       church:churches(name, ai_enabled, safeguarding_contact),
       details:request_details(body, requester_name, requester_contact, theme, urgency_reason, safeguarding, testimony_consent),
       assignments(id, member_id, assigned_at, prayed_at, note, member:members!assignments_member_id_fkey(display_name)),
       brief:briefs(prayer_points, scriptures, ai_generated, approved_by),
       follow_ups(id, draft, edited_text, ai_generated, approved_at, sent_at, created_at),
       testimony:testimonies(draft, edited_text, ai_generated, approved_at)`,
    )
    .eq("id", id)
    .single<Detail>();
  if (!r) notFound();

  const leader = member.role !== "intercessor";

  if (!r.details) {
    return (
      <>
        <TeamHeader member={member} churchName={r.church.name} />
        <main className="mx-auto max-w-2xl px-4 py-16 text-center">
          <LockIcon className="mx-auto size-8 text-muted" />
          <h1 className="mt-4 font-serif text-2xl font-semibold">This request is private</h1>
          <p className="mt-2 text-muted">It was shared with: <PrivacyBadge privacy={r.privacy} />. You cannot read it.</p>
          <Link href="/inbox" className="btn-secondary mt-6">Back to inbox</Link>
        </main>
      </>
    );
  }

  await audit(supabase, member, "viewed", id);
  const d = r.details;
  const { data: team } = await supabase
    .from("members")
    .select("id, display_name, role")
    .order("display_name")
    .returns<Pick<Member, "id" | "display_name" | "role">[]>();
  const aiAllowed = r.church.ai_enabled && r.privacy !== "pastors" && aiConfigured();
  const myAssignment = r.assignments.find((a) => a.member_id === member.id && !a.prayed_at);
  const followUps = [...r.follow_ups].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const pendingFollowUp = followUps.find((f) => !f.approved_at);
  const sentFollowUps = followUps.filter((f) => f.approved_at);
  const followUpDue = r.follow_up_due_at && new Date(r.follow_up_due_at) <= new Date();
  const closed = r.status === "closed";

  return (
    <>
      <TeamHeader member={member} churchName={r.church.name} />
      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <Link href="/inbox" className="text-sm font-semibold text-brand hover:underline">← Inbox</Link>

          {error && (
            <p role="alert" className="rounded-lg bg-urgent-soft px-3 py-2 text-sm font-semibold text-urgent">{error}</p>
          )}

          {r.urgency !== "normal" && !r.pastor_ack_at && (
            <div className={`rounded-xl border p-4 ${r.urgency === "urgent" ? "border-urgent/40 bg-urgent-soft" : "border-pastoral/30 bg-pastoral-soft"}`}>
              <p className={`font-bold ${r.urgency === "urgent" ? "text-urgent" : "text-pastoral"}`}>
                {r.urgency === "urgent" ? "Urgent: a pastor should respond today" : "Pastoral: a pastor should respond personally"}
              </p>
              {d.urgency_reason && <p className="mt-1 text-sm">{d.urgency_reason}</p>}
              {d.safeguarding && (
                <p className="mt-2 text-sm font-semibold">
                  Possible safeguarding concern. Follow the church safeguarding policy
                  {r.church.safeguarding_contact ? ` and tell ${r.church.safeguarding_contact}` : ""}.
                </p>
              )}
              {member.role === "pastor" ? (
                <form action={acknowledgeUrgent} className="mt-3">
                  <input type="hidden" name="request_id" value={r.id} />
                  <SubmitButton pendingText="Saving...">I have seen this and will respond</SubmitButton>
                </form>
              ) : (
                <p className="mt-2 text-xs text-muted">A pastor has been alerted. This stays pinned until a pastor acknowledges it.</p>
              )}
            </div>
          )}

          <article className="card p-5">
            <div className="flex flex-wrap items-center gap-2">
              <UrgencyBadge urgency={r.urgency} />
              <span className="font-semibold">{d.theme ?? (r.triaged_at ? "Other" : "Unsorted")}</span>
              {d.theme && <span className="ai-tag">AI label</span>}
              <PrivacyBadge privacy={r.privacy} />
              <span className="ml-auto"><StatusBadge status={r.status} answered={r.answered} /></span>
            </div>
            <p className="mt-4 whitespace-pre-wrap font-serif text-lg leading-relaxed">{d.body}</p>
            <p className="mt-4 text-sm text-muted">
              Received {shortDate(r.created_at)} · waiting {waitTime(r.created_at)}
              {leader && (
                <>
                  {" "}· From {d.requester_name || "someone who did not give a name"}
                  {d.requester_contact ? ` (${d.requester_contact})` : ", no contact left"}
                </>
              )}
            </p>
            {leader && !r.triaged_at && aiAllowed && (
              <form action={retriage} className="mt-3">
                <input type="hidden" name="request_id" value={r.id} />
                <SubmitButton variant="secondary" pendingText="Sorting...">Sort with AI</SubmitButton>
              </form>
            )}
          </article>

          {/* Prayer brief */}
          <section className="card p-5" aria-labelledby="brief-h">
            <div className="flex items-center justify-between gap-2">
              <h2 id="brief-h" className="font-serif text-xl font-semibold">Prayer brief</h2>
              {r.brief?.ai_generated && !r.brief.approved_by && <span className="ai-tag">AI draft</span>}
            </div>
            {r.brief ? (
              <>
                <ul className="mt-3 list-disc space-y-1.5 pl-5">
                  {r.brief.prayer_points.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
                {r.brief.scriptures.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {r.brief.scriptures.map((s) => (
                      <blockquote key={s.reference} className="border-l-4 border-brand/40 pl-3">
                        <p className="font-serif">{s.text}</p>
                        <footer className="mt-1 text-sm font-semibold text-muted">{s.reference} ({s.version})</footer>
                      </blockquote>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {!r.brief.approved_by && (
                    <form action={approveBrief}>
                      <input type="hidden" name="request_id" value={r.id} />
                      <SubmitButton variant="secondary">Looks right</SubmitButton>
                    </form>
                  )}
                  {aiAllowed && (
                    <form action={generateBrief}>
                      <input type="hidden" name="request_id" value={r.id} />
                      <SubmitButton variant="secondary" pendingText="Preparing...">Prepare again</SubmitButton>
                    </form>
                  )}
                </div>
              </>
            ) : aiAllowed ? (
              <form action={generateBrief} className="mt-3">
                <input type="hidden" name="request_id" value={r.id} />
                <p className="mb-3 text-sm text-muted">Three to five prayer points from the request, with Scripture fetched from the Bible.</p>
                <SubmitButton pendingText="Preparing brief...">Prepare prayer brief</SubmitButton>
              </form>
            ) : (
              <p className="mt-3 text-sm text-muted">
                {r.privacy === "pastors" ? "Pastors-only requests are never sent to the AI." : "AI help is switched off for this church."}
              </p>
            )}
          </section>

          {/* Pray */}
          {!closed && (myAssignment || leader) && (
            <section className="card p-5" aria-labelledby="pray-h">
              <h2 id="pray-h" className="font-serif text-xl font-semibold">I have prayed</h2>
              <form action={markPrayed} className="mt-3 space-y-3">
                <input type="hidden" name="request_id" value={r.id} />
                <label htmlFor="note" className="label">Note for the team <span className="font-normal text-muted">(optional)</span></label>
                <textarea id="note" name="note" rows={2} className="field" placeholder="Anything the team should know" />
                <SubmitButton pendingText="Saving...">Mark as prayed</SubmitButton>
              </form>
            </section>
          )}

          {/* Follow-up */}
          {leader && (
            <section className="card p-5" aria-labelledby="fu-h">
              <div className="flex items-center justify-between gap-2">
                <h2 id="fu-h" className="font-serif text-xl font-semibold">Follow-up</h2>
                {r.follow_up_due_at && !sentFollowUps.length && (
                  <span className={`text-xs font-semibold ${followUpDue ? "text-pastoral" : "text-muted"}`}>
                    {followUpDue ? "Due now" : `Due ${shortDate(r.follow_up_due_at)}`}
                  </span>
                )}
              </div>
              {sentFollowUps.map((f) => (
                <div key={f.id} className="mt-3 rounded-lg bg-ok-soft p-3 text-sm">
                  <p className="whitespace-pre-wrap">{f.edited_text ?? f.draft}</p>
                  <p className="mt-2 text-xs font-semibold text-ok">Approved and sent {f.sent_at && shortDate(f.sent_at)}</p>
                </div>
              ))}
              {!d.requester_contact ? (
                <p className="mt-3 text-sm text-muted">No contact was left, so there is no follow-up to send.</p>
              ) : pendingFollowUp ? (
                <form action={approveFollowUp} className="mt-3 space-y-3">
                  <input type="hidden" name="request_id" value={r.id} />
                  <input type="hidden" name="follow_up_id" value={pendingFollowUp.id} />
                  <div className="flex items-center gap-2">
                    <label htmlFor="fu-text" className="label mb-0">Edit before sending to {d.requester_contact}</label>
                    {pendingFollowUp.ai_generated && <span className="ai-tag">AI draft</span>}
                  </div>
                  <textarea id="fu-text" name="text" rows={7} className="field" defaultValue={pendingFollowUp.draft} />
                  <SubmitButton pendingText="Saving...">Approve and mark sent</SubmitButton>
                  <p className="text-xs text-muted">Nothing is sent until you approve it. In this build, send it yourself and mark it here.</p>
                </form>
              ) : !closed ? (
                <form action={createFollowUp} className="mt-3">
                  <input type="hidden" name="request_id" value={r.id} />
                  <SubmitButton variant={followUpDue ? "primary" : "secondary"} pendingText="Drafting...">
                    {sentFollowUps.length ? "Draft another check-in" : "Draft follow-up"}
                  </SubmitButton>
                </form>
              ) : null}
            </section>
          )}

          {/* Answered and testimony */}
          {leader && (
            <section className="card p-5" aria-labelledby="ans-h">
              <h2 id="ans-h" className="font-serif text-xl font-semibold">Answered prayer</h2>
              {!r.answered ? (
                <form action={markAnswered} className="mt-3 space-y-3">
                  <input type="hidden" name="request_id" value={r.id} />
                  <label htmlFor="notes" className="label">What happened? <span className="font-normal text-muted">(optional)</span></label>
                  <textarea id="notes" name="notes" rows={3} className="field" />
                  <p className="text-xs text-muted">
                    {d.testimony_consent
                      ? aiAllowed
                        ? "The requester agreed to an anonymous testimony. An AI draft will be prepared for a pastor to approve."
                        : "The requester agreed to an anonymous testimony."
                      : "The requester did not agree to a testimony, so none will be drafted."}
                  </p>
                  <SubmitButton variant="secondary" pendingText="Saving...">Mark answered</SubmitButton>
                </form>
              ) : r.testimony ? (
                r.testimony.approved_at ? (
                  <div className="mt-3 rounded-lg bg-ok-soft p-3">
                    <p className="whitespace-pre-wrap font-serif">{r.testimony.edited_text ?? r.testimony.draft}</p>
                    <p className="mt-2 text-xs font-semibold text-ok">Approved by a pastor {shortDate(r.testimony.approved_at)}</p>
                  </div>
                ) : (
                  <form action={approveTestimony} className="mt-3 space-y-3">
                    <input type="hidden" name="request_id" value={r.id} />
                    <div className="flex items-center gap-2">
                      <label htmlFor="t-text" className="label mb-0">Anonymised testimony</label>
                      {r.testimony.ai_generated && <span className="ai-tag">AI draft</span>}
                    </div>
                    <textarea id="t-text" name="text" rows={5} className="field" defaultValue={r.testimony.draft} disabled={member.role !== "pastor"} />
                    {member.role === "pastor" ? (
                      <SubmitButton pendingText="Saving...">Approve testimony</SubmitButton>
                    ) : (
                      <p className="text-xs text-muted">Waiting for a pastor to approve.</p>
                    )}
                  </form>
                )
              ) : (
                <p className="mt-3 text-sm text-ok">Marked answered. Praise God.</p>
              )}
            </section>
          )}
        </div>

        {/* Side panel */}
        <aside className="space-y-4">
          <section className="card p-4">
            <h2 className="font-semibold">Praying for this</h2>
            {r.assignments.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Nobody yet.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {r.assignments.map((a) => (
                  <li key={a.id}>
                    <span className="font-semibold">{a.member?.display_name}</span>{" "}
                    <span className="text-muted">{a.prayed_at ? `prayed ${shortDate(a.prayed_at)}` : `assigned ${shortDate(a.assigned_at)}`}</span>
                    {a.note && <p className="mt-0.5 rounded bg-paper px-2 py-1 text-muted">{a.note}</p>}
                  </li>
                ))}
              </ul>
            )}
            {leader && !closed && (
              <form action={assignRequest} className="mt-4 space-y-2">
                <input type="hidden" name="request_id" value={r.id} />
                <label htmlFor="member_id" className="label">{r.assigned_to ? "Reassign to" : "Assign to"}</label>
                <select id="member_id" name="member_id" className="field" required defaultValue="">
                  <option value="" disabled>Choose someone</option>
                  {(team ?? []).map((m) => (
                    <option key={m.id} value={m.id}>{m.display_name} ({m.role})</option>
                  ))}
                </select>
                <SubmitButton className="w-full" pendingText="Assigning...">Assign</SubmitButton>
                {r.privacy !== "team" && (
                  <p className="text-xs text-muted">Assigning a private request lets that person read it.</p>
                )}
              </form>
            )}
          </section>

          {leader && !closed && (
            <form action={closeRequest} className="card p-4">
              <input type="hidden" name="request_id" value={r.id} />
              <h2 className="font-semibold">Close request</h2>
              <p className="mt-1 text-sm text-muted">When prayer and follow-up are done.</p>
              <SubmitButton variant="secondary" className="mt-3 w-full" pendingText="Closing...">Close</SubmitButton>
            </form>
          )}
        </aside>
      </main>
    </>
  );
}
