"use client";

import { useActionState, useState } from "react";
import { submitRequest, type IntakeState } from "@/lib/actions/intake";
import { PRIVACY_HELP, PRIVACY_LABEL, type Privacy } from "@/lib/types";

const LEVELS: Privacy[] = ["team", "leaders", "pastors"];

export function RequestForm({ slug, churchName, aiEnabled }: { slug: string; churchName: string; aiEnabled: boolean }) {
  const [state, action, pending] = useActionState<IntakeState, FormData>(submitRequest, {});
  const [privacy, setPrivacy] = useState<Privacy>("team");

  const whoSees =
    privacy === "team"
      ? `the ${churchName} prayer team`
      : privacy === "leaders"
        ? `the ${churchName} prayer coordinator and pastors`
        : `the ${churchName} pastors only`;
  const aiNote = aiEnabled && privacy !== "pastors" ? " A computer assistant (AI) helps sort requests so the team can respond faster; it never replies to you." : "";

  return (
    <form action={action} className="mt-6 space-y-5">
      <input type="hidden" name="slug" value={slug} />

      <div>
        <label htmlFor="body" className="label">
          Your prayer request
        </label>
        <textarea
          id="body"
          name="body"
          required
          rows={6}
          maxLength={4000}
          className="field"
          aria-describedby="body-help"
          placeholder="Tell us what you would like us to pray for."
        />
        <p id="body-help" className="mt-1.5 text-sm text-muted">
          If you are asking for someone else, please leave out their surname and anything that could identify them.
        </p>
      </div>

      <fieldset>
        <legend className="label">Who can read it?</legend>
        <div className="space-y-2">
          {LEVELS.map((level) => (
            <label
              key={level}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${privacy === level ? "border-brand bg-brand-soft" : "border-line bg-card"}`}
            >
              <input
                type="radio"
                name="privacy"
                value={level}
                checked={privacy === level}
                onChange={() => setPrivacy(level)}
                className="mt-1 size-4 accent-[var(--color-brand)]"
              />
              <span>
                <span className="block font-semibold">{PRIVACY_LABEL[level]}</span>
                <span className="block text-sm text-muted">{PRIVACY_HELP[level]}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="label">
            First name <span className="font-normal text-muted">(optional)</span>
          </label>
          <input id="name" name="name" autoComplete="given-name" maxLength={80} className="field" />
        </div>
        <div>
          <label htmlFor="contact" className="label">
            Email or phone <span className="font-normal text-muted">(optional)</span>
          </label>
          <input id="contact" name="contact" autoComplete="email" maxLength={120} className="field" aria-describedby="contact-help" />
        </div>
      </div>
      <p id="contact-help" className="-mt-2 text-sm text-muted">
        Leave a contact if you would like someone to check in with you. Without one, we will still pray.
      </p>

      <div className="space-y-3 rounded-lg border border-line bg-card p-4">
        <label className="flex items-start gap-3">
          <input type="checkbox" name="consent" required className="mt-1 size-4 shrink-0 accent-[var(--color-brand)]" />
          <span className="text-sm">
            I agree that {churchName} may keep this request so {whoSees} can pray for it. It may include details of
            my faith or health.{aiNote} I can ask for it to be deleted at any time.
          </span>
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="testimony_consent" className="mt-1 size-4 shrink-0 accent-[var(--color-brand)]" />
          <span className="text-sm text-muted">
            If this prayer is answered, the church may share an anonymous story about it, with no names or details.
            A pastor approves it first. (Optional)
          </span>
        </label>
      </div>

      {state.error && (
        <p role="alert" className="rounded-lg bg-urgent-soft px-3 py-2 text-sm font-semibold text-urgent">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary w-full py-3 text-base">
        {pending ? "Sending..." : "Send my prayer request"}
      </button>
      <p className="text-center text-xs text-muted">This form is for adults (18 and over).</p>
    </form>
  );
}
