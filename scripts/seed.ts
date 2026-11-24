/**
 * Seeds the demo church, four demo logins and sample requests (no real data).
 *   npm run seed
 * Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DEMO_PASSWORD in .env.local.
 * Safe to re-run: it deletes and recreates the demo church.
 */
import { createClient } from "@supabase/supabase-js";
import { DEMO_USERS } from "../src/lib/demo";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEMO_PASSWORD;
const slug = process.env.NEXT_PUBLIC_DEMO_CHURCH_SLUG || "icc-luton";
if (!url || !key || !password) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DEMO_PASSWORD first.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

async function ensureUser(email: string) {
  const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 });
  const existing = list?.users.find((u) => u.email === email);
  if (existing) {
    await db.auth.admin.updateUserById(existing.id, { password });
    return existing.id;
  }
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error(`could not create ${email}`);
  return data.user.id;
}

type Sample = {
  hours: number;
  privacy: "team" | "leaders" | "pastors";
  body: string;
  name?: string;
  contact?: string;
  theme?: string;
  urgency?: "normal" | "urgent" | "pastoral";
  reason?: string;
  safeguarding?: boolean;
  unsorted?: boolean;
  testimonyConsent?: boolean;
  assign?: string; // demo email
  prayed?: boolean;
  note?: string;
  followedUp?: boolean;
};

const SAMPLES: Sample[] = [
  {
    hours: 3,
    privacy: "team",
    body: "I have been feeling like I can't go on any more and I don't know who to talk to. Please pray for me.",
    contact: "07700 900123",
    theme: "Mental health",
    urgency: "urgent",
    reason: "Says they feel they \"can't go on any more\" and have no one to talk to.",
    safeguarding: true,
  },
  {
    hours: 20,
    privacy: "pastors",
    body: "I need to speak to a pastor about something that happened at home. I don't want anyone else to know.",
    name: "Anonymous",
    urgency: "pastoral",
    reason: "Sent to pastors only.",
  },
  {
    hours: 30,
    privacy: "team",
    body: "Please pray for my mum. She has a hospital scan on Thursday and she is very anxious about the results.",
    name: "Abena",
    contact: "abena@example.com",
    theme: "Health",
    assign: "ruth@demo.intercede.app",
    prayed: true,
    note: "Prayed with my small group too.",
  },
  {
    hours: 52,
    privacy: "team",
    body: "I have a job interview next week after eight months out of work. Pray for confidence and for God's provision for our family.",
    name: "Tunde",
    contact: "tunde@example.com",
    theme: "Work and money",
  },
  {
    hours: 70,
    privacy: "leaders",
    body: "My husband and I keep arguing and I am worried about our marriage. We have two young children.",
    name: "Esther",
    contact: "esther@example.com",
    theme: "Family",
    urgency: "pastoral",
    reason: "Describes a marriage under strain with young children at home.",
  },
  {
    hours: 6,
    privacy: "team",
    body: "Please pray for our youth weekend away this Friday, for safe travel and that the young people meet God.",
    unsorted: true,
  },
  {
    hours: 100,
    privacy: "team",
    body: "My grandfather passed away last week in Ghana and I cannot travel for the funeral. Please pray for my family.",
    name: "Kwame",
    theme: "Grief",
    urgency: "pastoral",
    reason: "Recent death in the family.",
    assign: "daniel@demo.intercede.app",
  },
  {
    hours: 8 * 24,
    privacy: "team",
    body: "Please pray for my friend's visa appeal hearing. She has been waiting two years and is exhausted.",
    name: "Grace",
    contact: "grace@example.com",
    theme: "Immigration",
    assign: "ruth@demo.intercede.app",
    prayed: true,
    note: "Praying every morning this week.",
    testimonyConsent: true,
  },
  {
    hours: 9 * 24,
    privacy: "team",
    body: "Thank God with me, I passed my nursing exams! Please pray for the next step of finding a placement.",
    name: "Precious",
    contact: "precious@example.com",
    theme: "Thanksgiving",
    assign: "daniel@demo.intercede.app",
    prayed: true,
    followedUp: true,
    testimonyConsent: true,
  },
];

async function main() {
  await db.from("churches").delete().eq("slug", slug);
  const { data: church, error } = await db
    .from("churches")
    .insert({
      slug,
      name: "ICC Luton (demo)",
      contact_phone: "01582 000000",
      safeguarding_contact: "the church safeguarding lead",
      follow_up_days: 7,
    })
    .select("id")
    .single();
  if (error || !church) throw error;

  const memberIds: Record<string, string> = {};
  for (const u of DEMO_USERS) {
    const userId = await ensureUser(u.email);
    await db.from("members").delete().eq("user_id", userId);
    const { data: m, error: mErr } = await db
      .from("members")
      .insert({ church_id: church.id, user_id: userId, display_name: u.name, email: u.email, role: u.role })
      .select("id")
      .single();
    if (mErr || !m) throw mErr;
    memberIds[u.email] = m.id;
  }
  const coordinator = memberIds["coordinator@demo.intercede.app"];

  for (const s of SAMPLES) {
    const created = hoursAgo(s.hours);
    const status = s.followedUp ? "followed_up" : s.prayed ? "prayed" : s.assign ? "assigned" : "new";
    const { data: req, error: rErr } = await db
      .from("requests")
      .insert({
        church_id: church.id,
        privacy: s.privacy,
        status,
        urgency: s.urgency ?? "normal",
        triaged_at: s.unsorted ? null : created,
        has_contact: Boolean(s.contact),
        follow_up_due_at: s.contact ? new Date(new Date(created).getTime() + 7 * 86_400_000).toISOString() : null,
        assigned_to: s.assign ? memberIds[s.assign] : null,
        created_at: created,
      })
      .select("id")
      .single();
    if (rErr || !req) throw rErr;
    await db.from("request_details").insert({
      request_id: req.id,
      body: s.body,
      requester_name: s.name ?? null,
      requester_contact: s.contact ?? null,
      theme: s.theme ?? null,
      urgency_reason: s.reason ?? null,
      safeguarding: s.safeguarding ?? false,
      consent_at: created,
      testimony_consent: s.testimonyConsent ?? false,
    });
    if (s.assign) {
      await db.from("assignments").insert({
        request_id: req.id,
        member_id: memberIds[s.assign],
        assigned_by: coordinator,
        assigned_at: hoursAgo(s.hours - 2),
        prayed_at: s.prayed ? hoursAgo(s.hours - 20) : null,
        note: s.note ?? null,
      });
    }
    if (s.followedUp) {
      const text = `Hi ${s.name},\n\nWe have been praying for you this week and we are so glad about your exams. How is the placement search going? If you would like to talk with someone from the church, just reply.\n\nThe prayer team`;
      await db.from("follow_ups").insert({
        request_id: req.id,
        draft: text,
        edited_text: text,
        approved_by: coordinator,
        approved_at: hoursAgo(24),
        sent_at: hoursAgo(24),
      });
    }
  }

  console.log(`Seeded ${SAMPLES.length} requests for /c/${slug}`);
  console.log("Demo logins:", DEMO_USERS.map((u) => `${u.email} (${u.role})`).join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
