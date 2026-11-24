import { PRIVACY_LABEL, STATUS_LABEL, type Privacy, type Status, type Urgency } from "@/lib/types";

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  if (urgency === "normal") return null;
  const cls = urgency === "urgent" ? "bg-urgent-soft text-urgent" : "bg-pastoral-soft text-pastoral";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${cls}`}>{urgency === "urgent" ? "Urgent" : "Pastoral"}</span>;
}

export function StatusBadge({ status, answered }: { status: Status; answered?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-semibold text-muted ring-1 ring-line">{STATUS_LABEL[status]}</span>
      {answered && <span className="rounded-full bg-ok-soft px-2 py-0.5 text-xs font-bold text-ok">Answered</span>}
    </span>
  );
}

export function PrivacyBadge({ privacy }: { privacy: Privacy }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      {privacy !== "team" && <LockIcon />}
      {PRIVACY_LABEL[privacy]}
    </span>
  );
}

export function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  );
}
