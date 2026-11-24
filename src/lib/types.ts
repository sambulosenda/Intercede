export type Role = "intercessor" | "coordinator" | "pastor";
export type Privacy = "team" | "leaders" | "pastors";
export type Status = "new" | "assigned" | "prayed" | "followed_up" | "closed";
export type Urgency = "normal" | "urgent" | "pastoral";

export const PRIVACY_LABEL: Record<Privacy, string> = {
  team: "Prayer team",
  leaders: "Coordinator and pastors",
  pastors: "Pastors only",
};

export const PRIVACY_HELP: Record<Privacy, string> = {
  team: "The church prayer team can read it.",
  leaders: "Only the prayer coordinator and pastors can read it.",
  pastors: "Only the pastors can read it. It is not sent to the AI.",
};

export const STATUS_LABEL: Record<Status, string> = {
  new: "New",
  assigned: "Assigned",
  prayed: "Prayed",
  followed_up: "Followed up",
  closed: "Closed",
};

export const STATUS_ORDER: Status[] = ["new", "assigned", "prayed", "followed_up", "closed"];

export function laterStatus(a: Status, b: Status): Status {
  return STATUS_ORDER.indexOf(a) >= STATUS_ORDER.indexOf(b) ? a : b;
}

export const THEMES = [
  "Health",
  "Family",
  "Grief",
  "Work and money",
  "Faith",
  "Relationships",
  "Mental health",
  "Housing",
  "Immigration",
  "Thanksgiving",
  "Other",
] as const;
export type Theme = (typeof THEMES)[number];

export type Member = {
  id: string;
  church_id: string;
  display_name: string;
  email: string;
  role: Role;
};

export type Scripture = { reference: string; text: string; version: string };
