/**
 * Re-run after every prompt change (PRD safeguards). Fails if any urgent sample
 * is not flagged urgent. Pastoral/normal mismatches are reported, not fatal,
 * because over-flagging is acceptable by design.
 *   npm run eval:triage     (needs ANTHROPIC_API_KEY)
 */
import samples from "../evals/triage-samples.json";
import { triageRequest } from "../src/lib/ai/claude";

const RANK = { normal: 0, pastoral: 1, urgent: 2 } as const;

async function main() {
  let missedUrgent = 0;
  let underFlagged = 0;
  for (const s of samples as { id: string; text: string; expect: keyof typeof RANK }[]) {
    const r = await triageRequest(s.text);
    const ok = r.urgency === s.expect;
    const under = RANK[r.urgency] < RANK[s.expect];
    if (s.expect === "urgent" && r.urgency !== "urgent") missedUrgent++;
    else if (under) underFlagged++;
    console.log(`${ok ? "ok  " : under ? "MISS" : "over"} ${s.id.padEnd(18)} expected ${s.expect.padEnd(8)} got ${r.urgency.padEnd(8)} ${r.theme} ${r.reason}`);
  }
  console.log(`\n${missedUrgent} urgent missed, ${underFlagged} other under-flagged`);
  if (missedUrgent > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
