# Intercede

**No prayer request forgotten.** Prayer request management for church prayer teams.

People submit requests by form or QR code. The prayer team receives, shares out, prays through and follows up each one. AI does the sorting and drafting, and people make every decision.

Built for the AI for Church Hackathon. Piloting at ICC Luton.

## The loop

1. **Ask** – `/c/<church>`: a phone-friendly form with three privacy levels (prayer team, coordinator and pastors, pastors only) and explicit consent.
2. **Confirm** – what happens next, who can read it, and where to get help now.
3. **Sort** – AI labels theme and urgency. Urgent and pastoral requests are pinned for a pastor, with the reason shown, until a pastor acknowledges them.
4. **Share out** – the coordinator assigns each request to a named intercessor. Inbox shows wait times; private rows are locked.
5. **Pray** – a prayer brief with 3–5 prayer points and Scripture. The AI picks references only; verse text is fetched from a Bible source.
6. **Follow up** – an AI draft check-in after 7 days. Nothing is sent until a person edits and approves it.
7. **Answered** – with consent, an anonymised testimony draft for a pastor to approve.

## What the AI may and may not do

| May | May not |
| --- | --- |
| Label theme and urgency, with a reason | Reply to, message or chat with a requester |
| Suggest prayer points from the request | Send anything without a named person approving it |
| Choose Scripture references | Generate or paraphrase verse text |
| Draft a follow-up or anonymised testimony | Change who can see a request |

Names, emails and phone numbers are removed before text is sent to the model. **Pastors-only requests are never sent to the AI.** If the AI fails or declines, the request is still saved and appears as "Unsorted" (a refusal on triage is treated as urgent). Every AI output is labelled as an AI draft.

## Privacy is in the database

Row-level security in [`supabase/migrations`](supabase/migrations) carries the privacy levels:

- `requests` holds metadata only, so every team member can see that a request exists (a locked row).
- `request_details` holds the words. It is readable only when `can_view_request()` allows it: by privacy level and role, or because a pastor assigned the request to you.
- Briefs, follow-ups and testimonies use the same rule. Only pastors can approve testimonies. Privacy level cannot be changed after submission, and status only moves forward.

`npm run test:rls` runs the migration on a throwaway Postgres database and checks it with one login per role (pastor, coordinator, two intercessors, another church, signed out).

## Stack

Next.js (App Router) on Vercel · Supabase (Postgres, auth, RLS) · Claude API (`@anthropic-ai/sdk`, structured outputs) · YouVersion Platform API for Bible text, with the public-domain World English Bible as a fallback.

## Run it

```bash
npm install
cp .env.example .env.local        # fill in Supabase and Anthropic keys
```

1. Create a Supabase project in a UK or EU region.
2. Apply the schema: paste `supabase/migrations/20261124000000_init.sql` into the SQL editor, or `supabase db push` with the Supabase CLI.
3. `npm run seed` creates the demo church (`/c/icc-luton`), four demo logins and sample requests.
4. `npm run dev` and open http://localhost:3000. With `DEMO_MODE=true`, `/login` has one-tap demo logins.

| Script | What it does |
| --- | --- |
| `npm run test:rls` | Privacy tests against local Postgres (needs `psql`; set `PGURL` if not using the local socket) |
| `npm run eval:triage` | Runs the fixed sample set in `evals/` through triage. Fails if any urgent sample is not flagged. Re-run after every prompt change. |
| `npm run seed` | Resets the demo church and sample data |
| `npm run typecheck` / `npm run lint` / `npm run build` | The usual |

Prompts live in [`src/lib/ai/prompts.ts`](src/lib/ai/prompts.ts).

## Before real requests

This build uses sample data only. Before the pilot: turn off `DEMO_MODE`, get the consent wording, privacy notice and data protection impact assessment reviewed, confirm the AI provider's data terms in writing, and confirm the YouVersion endpoint, licensed Bible IDs and display terms (`src/lib/bible.ts`).

## Not in the hackathon build (v1)

Email notifications, invites and real sign-up, leadership report, retention and deletion tooling, AI on/off setting in the UI, rota suggestions.
