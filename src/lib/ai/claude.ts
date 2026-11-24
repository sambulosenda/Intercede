import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { THEMES } from "../types";
import { BRIEF_SYSTEM, FOLLOW_UP_SYSTEM, TESTIMONY_SYSTEM, TRIAGE_SYSTEM } from "./prompts";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

let client: Anthropic | null = null;
function anthropic() {
  if (!client) client = new Anthropic();
  return client;
}

export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export class AiRefusal extends Error {}

async function structured<T extends z.ZodType>(
  schema: T,
  system: string,
  user: string,
  effort: "low" | "medium" = "low",
): Promise<z.infer<T>> {
  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: user }],
    output_config: { effort, format: zodOutputFormat(schema) },
  });
  if (response.stop_reason === "refusal") throw new AiRefusal("The model declined this request.");
  if (!response.parsed_output) throw new Error("The model returned output that did not match the schema.");
  return response.parsed_output;
}

// ---------------------------------------------------------------- triage

const TriageSchema = z.object({
  theme: z.enum(THEMES),
  urgency: z.enum(["normal", "urgent", "pastoral"]),
  reason: z.string(),
  safeguarding: z.boolean(),
});
export type Triage = z.infer<typeof TriageSchema>;

/** Text must already be redacted. On a refusal, over-flag rather than drop. */
export async function triageRequest(redactedText: string): Promise<Triage> {
  try {
    return await structured(TriageSchema, TRIAGE_SYSTEM, `<request>\n${redactedText}\n</request>`);
  } catch (err) {
    if (err instanceof AiRefusal) {
      return {
        theme: "Other",
        urgency: "urgent",
        reason: "The AI could not assess this request. A pastor should read it now.",
        safeguarding: false,
      };
    }
    throw err;
  }
}

// ---------------------------------------------------------------- brief

const BriefSchema = z.object({
  prayer_points: z.array(z.string()),
  scripture_references: z.array(z.string()),
});

export async function draftBrief(redactedText: string, theme: string | null) {
  const out = await structured(
    BriefSchema,
    BRIEF_SYSTEM,
    `Theme: ${theme ?? "unknown"}\n<request>\n${redactedText}\n</request>`,
  );
  return {
    prayer_points: out.prayer_points.slice(0, 5),
    scripture_references: out.scripture_references.slice(0, 3),
  };
}

// ---------------------------------------------------------------- follow-up and testimony

const MessageSchema = z.object({ message: z.string() });

export async function draftFollowUp(redactedText: string, firstName: string | null) {
  const out = await structured(
    MessageSchema,
    FOLLOW_UP_SYSTEM,
    `First name: ${firstName || "(none)"}\n<request>\n${redactedText}\n</request>`,
  );
  return out.message.trim();
}

export async function draftTestimony(redactedText: string, notes: string) {
  const out = await structured(
    MessageSchema,
    TESTIMONY_SYSTEM,
    `<request>\n${redactedText}\n</request>\n<answered_notes>\n${notes || "(none)"}\n</answered_notes>`,
  );
  return out.message.trim();
}
