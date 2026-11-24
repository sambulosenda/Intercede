import Link from "next/link";
import { LockIcon, PrivacyBadge, StatusBadge, UrgencyBadge } from "@/components/Badges";
import { TeamHeader } from "@/components/TeamHeader";
import { waitTime } from "@/lib/format";
import { requireMember } from "@/lib/session";
import type { Privacy, Status, Urgency } from "@/lib/types";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  privacy: Privacy;
  status: Status;
  urgency: Urgency;
  triaged_at: string | null;
  answered: boolean;
  pastor_ack_at: string | null;
  follow_up_due_at: string | null;
  created_at: string;
  assignee: { display_name: string } | null;
  details: { body: string; theme: string | null } | null;
};

const VIEWS = [
  { key: "open", label: "Open" },
  { key: "mine", label: "Mine" },
  { key: "unassigned", label: "Unassigned" },
  { key: "closed", label: "Closed" },
] as const;

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { supabase, member } = await requireMember();
  const { view: rawView } = await searchParams;
  const view = VIEWS.some((v) => v.key === rawView) ? rawView! : member.role === "intercessor" ? "mine" : "open";

  const { data: church } = await supabase.from("churches").select("name").single();

  let query = supabase
    .from("requests")
    .select(
      "id, privacy, status, urgency, triaged_at, answered, pastor_ack_at, follow_up_due_at, created_at, assignee:members!requests_assigned_to_fkey(display_name), details:request_details(body, theme)",
    )
    .order("created_at", { ascending: true })
    .limit(200);
  if (view === "closed") query = query.eq("status", "closed");
  else query = query.neq("status", "closed");
  if (view === "mine") query = query.eq("assigned_to", member.id);
  if (view === "unassigned") query = query.is("assigned_to", null);

  const { data, error } = await query.returns<Row[]>();
  const rows = data ?? [];

  const pinned = rows.filter((r) => r.urgency !== "normal" && !r.pastor_ack_at && r.status !== "closed");
  const rest = rows.filter((r) => !pinned.includes(r));
  const now = new Date();
  const unassignedCount = rows.filter((r) => r.status === "new").length;
  const dueCount = rows.filter((r) => r.follow_up_due_at && new Date(r.follow_up_due_at) <= now && r.status !== "followed_up").length;

  return (
    <>
      <TeamHeader member={member} churchName={church?.name ?? ""} />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl font-semibold">Prayer requests</h1>
            <p className="mt-1 text-sm text-muted">
              {view === "open" && `${unassignedCount} waiting for someone to pray · ${dueCount} follow-ups due`}
              {view === "mine" && "Requests given to you to pray for."}
              {view === "unassigned" && "Requests nobody has been given yet. Oldest first."}
              {view === "closed" && "Closed requests."}
            </p>
          </div>
          <nav className="flex gap-1 rounded-lg bg-card p-1 ring-1 ring-line" aria-label="Inbox views">
            {VIEWS.map((v) => (
              <Link
                key={v.key}
                href={`/inbox?view=${v.key}`}
                aria-current={view === v.key ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold ${view === v.key ? "bg-brand text-white" : "text-muted hover:text-ink"}`}
              >
                {v.label}
              </Link>
            ))}
          </nav>
        </div>

        {error && <p className="mt-6 text-urgent">Could not load requests: {error.message}</p>}

        {pinned.length > 0 && (
          <section className="mt-6" aria-labelledby="pinned-heading">
            <h2 id="pinned-heading" className="mb-2 text-sm font-bold uppercase tracking-wide text-urgent">
              Needs a pastor
            </h2>
            <ul className="space-y-2">
              {pinned.map((r) => (
                <RequestRow key={r.id} r={r} now={now} highlight />
              ))}
            </ul>
          </section>
        )}

        <section className="mt-6">
          {rest.length === 0 && pinned.length === 0 ? (
            <p className="card p-8 text-center text-muted">Nothing here. Every request in this view has been looked after.</p>
          ) : (
            <ul className="space-y-2">
              {rest.map((r) => (
                <RequestRow key={r.id} r={r} now={now} />
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

function RequestRow({ r, now, highlight }: { r: Row; now: Date; highlight?: boolean }) {
  const locked = !r.details;
  const due = r.follow_up_due_at && new Date(r.follow_up_due_at) <= now && !["followed_up", "closed"].includes(r.status);
  const content = (
    <div className={`card flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-4 ${highlight ? "border-urgent/40" : ""} ${locked ? "bg-paper" : "hover:border-brand/50"}`}>
      <div className="w-14 shrink-0 text-sm font-semibold tabular-nums text-muted" title="Time waiting">
        {waitTime(r.created_at, now)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <UrgencyBadge urgency={r.urgency} />
          {locked ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted">
              <LockIcon /> Private request
            </span>
          ) : (
            <span className="text-sm font-semibold">{r.details?.theme ?? (r.triaged_at ? "Other" : "Unsorted")}</span>
          )}
          <PrivacyBadge privacy={r.privacy} />
        </div>
        <p className={`mt-1 truncate text-sm ${locked ? "italic text-muted" : "text-ink"}`}>
          {locked ? "Only people this request was shared with can read it." : r.details?.body}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        {due && <span className="rounded-full bg-pastoral-soft px-2 py-0.5 text-xs font-bold text-pastoral">Follow-up due</span>}
        <StatusBadge status={r.status} answered={r.answered} />
        <span className="text-xs text-muted">{r.assignee?.display_name ?? "Unassigned"}</span>
      </div>
    </div>
  );
  return <li>{locked ? <div aria-disabled="true">{content}</div> : <Link href={`/requests/${r.id}`}>{content}</Link>}</li>;
}
