import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Scripture } from "./types";

/**
 * Verse text comes from a Bible source, never from the AI (PRD R9).
 * A reference that cannot be fetched is dropped, not shown.
 *
 * Source order:
 *   1. verse_cache table
 *   2. YouVersion Platform API, when YOUVERSION_APP_KEY is set
 *      (confirm the endpoint shape and licensed Bible IDs against the
 *      YouVersion developer docs before the pilot; see README)
 *   3. bible-api.com, World English Bible (public domain fallback)
 */

const BOOKS: Record<string, string> = {
  genesis: "GEN", exodus: "EXO", leviticus: "LEV", numbers: "NUM", deuteronomy: "DEU",
  joshua: "JOS", judges: "JDG", ruth: "RUT", "1 samuel": "1SA", "2 samuel": "2SA",
  "1 kings": "1KI", "2 kings": "2KI", "1 chronicles": "1CH", "2 chronicles": "2CH",
  ezra: "EZR", nehemiah: "NEH", esther: "EST", job: "JOB", psalm: "PSA", psalms: "PSA",
  proverbs: "PRO", ecclesiastes: "ECC", "song of songs": "SNG", "song of solomon": "SNG",
  isaiah: "ISA", jeremiah: "JER", lamentations: "LAM", ezekiel: "EZK", daniel: "DAN",
  hosea: "HOS", joel: "JOL", amos: "AMO", obadiah: "OBA", jonah: "JON", micah: "MIC",
  nahum: "NAM", habakkuk: "HAB", zephaniah: "ZEP", haggai: "HAG", zechariah: "ZEC",
  malachi: "MAL", matthew: "MAT", mark: "MRK", luke: "LUK", john: "JHN", acts: "ACT",
  romans: "ROM", "1 corinthians": "1CO", "2 corinthians": "2CO", galatians: "GAL",
  ephesians: "EPH", philippians: "PHP", colossians: "COL", "1 thessalonians": "1TH",
  "2 thessalonians": "2TH", "1 timothy": "1TI", "2 timothy": "2TI", titus: "TIT",
  philemon: "PHM", hebrews: "HEB", james: "JAS", "1 peter": "1PE", "2 peter": "2PE",
  "1 john": "1JN", "2 john": "2JN", "3 john": "3JN", jude: "JUD", revelation: "REV",
};

type Parsed = { book: string; usfm: string; chapter: number; start: number; end: number };

/** "Philippians 4:6-7" -> parts. Returns null for anything we cannot read confidently. */
export function parseReference(ref: string): Parsed | null {
  const m = ref.trim().match(/^((?:[1-3]\s)?[A-Za-z ]+?)\s+(\d+):(\d+)(?:\s*[-–]\s*(\d+))?$/);
  if (!m) return null;
  const book = m[1].toLowerCase().replace(/\s+/g, " ");
  const usfm = BOOKS[book];
  if (!usfm) return null;
  const chapter = Number(m[2]);
  const start = Number(m[3]);
  const end = m[4] ? Number(m[4]) : start;
  if (end < start || end - start > 10) return null;
  return { book: m[1].trim(), usfm, chapter, start, end };
}

function normalise(p: Parsed) {
  const name = p.book.replace(/^psalms$/i, "Psalm");
  return `${name} ${p.chapter}:${p.start}${p.end !== p.start ? `-${p.end}` : ""}`;
}

async function fromYouVersion(p: Parsed): Promise<{ text: string; version: string } | null> {
  const key = process.env.YOUVERSION_APP_KEY;
  if (!key) return null;
  const base = process.env.YOUVERSION_API_BASE || "https://api.youversion.com/v1";
  const bibleId = process.env.YOUVERSION_BIBLE_ID || "111"; // set to a translation your licence allows
  const passage = `${p.usfm}.${p.chapter}.${p.start}${p.end !== p.start ? `-${p.usfm}.${p.chapter}.${p.end}` : ""}`;
  try {
    const res = await fetch(`${base}/bibles/${bibleId}/passages/${passage}`, {
      headers: { "X-YVP-App-Key": key, accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { content?: string; text?: string };
    const text = (body.content ?? body.text ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return text ? { text, version: process.env.YOUVERSION_VERSION_LABEL || "YouVersion" } : null;
  } catch {
    return null;
  }
}

async function fromPublicDomain(ref: string): Promise<{ text: string; version: string } | null> {
  try {
    const res = await fetch(`https://bible-api.com/${encodeURIComponent(ref)}?translation=web`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { text?: string };
    const text = (body.text ?? "").replace(/\s+/g, " ").trim();
    return text ? { text, version: "WEB" } : null;
  } catch {
    return null;
  }
}

/** Fetch verse text for each reference; unfetchable references are dropped. */
export async function fetchScriptures(supabase: SupabaseClient, references: string[]): Promise<Scripture[]> {
  const out: Scripture[] = [];
  for (const raw of references) {
    const parsed = parseReference(raw);
    if (!parsed) continue;
    const reference = normalise(parsed);

    const { data: cached } = await supabase
      .from("verse_cache")
      .select("text, version")
      .eq("reference", reference)
      .limit(1)
      .maybeSingle();
    if (cached) {
      out.push({ reference, text: cached.text, version: cached.version });
      continue;
    }

    const found = (await fromYouVersion(parsed)) ?? (await fromPublicDomain(reference));
    if (!found) continue;
    out.push({ reference, ...found });
    await supabase.from("verse_cache").insert({ reference, ...found });
  }
  return out;
}
