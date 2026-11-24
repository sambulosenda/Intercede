/**
 * Minimum data to the model (PRD safeguards): strip the requester's name and
 * contact, plus anything that looks like an email address or phone number,
 * before request text is sent for triage or drafting.
 */
export function redact(text: string, opts: { name?: string | null; contact?: string | null } = {}) {
  let out = text;
  out = out.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[email]");
  out = out.replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, "[phone]");
  for (const value of [opts.contact, ...(opts.name ? opts.name.split(/\s+/) : [])]) {
    const v = value?.trim();
    if (!v || v.length < 2) continue;
    out = out.replace(new RegExp(`\\b${escapeRegExp(v)}\\b`, "gi"), "[name]");
  }
  return out;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
