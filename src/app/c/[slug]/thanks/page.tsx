import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { PRIVACY_LABEL, type Privacy } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ThanksPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ p?: string; c?: string }>;
}) {
  const { slug } = await params;
  const { p, c } = await searchParams;
  const db = createServiceClient();
  const { data: church } = await db.from("churches").select("name, contact_phone").eq("slug", slug).single();
  if (!church) notFound();
  const privacy = (["team", "leaders", "pastors"].includes(p ?? "") ? p : "team") as Privacy;

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-ok-soft text-ok" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M5 12l5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h1 className="mt-5 text-center font-serif text-3xl font-semibold">Thank you. We have your request.</h1>
      <p className="mt-2 text-center text-muted">{church.name} will be praying for you.</p>

      <div className="card mt-8 p-5">
        <h2 className="font-semibold">What happens next</h2>
        <ol className="mt-3 space-y-3 text-sm">
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">1</span>
            <span>
              Your request is visible to: <strong>{PRIVACY_LABEL[privacy]}</strong>. No one else can read it.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">2</span>
            <span>A named member of the prayer team is given your request to pray for.</span>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">3</span>
            <span>
              {c
                ? "In about a week, someone from the team will check in with you."
                : "You did not leave a contact, so we will not get in touch, but we will still pray."}
            </span>
          </li>
        </ol>
      </div>

      <div className="mt-4 rounded-xl border border-urgent/30 bg-urgent-soft p-5">
        <h2 className="font-semibold text-urgent">Need help now?</h2>
        <p className="mt-1 text-sm">
          {church.contact_phone ? (
            <>
              Call the church on{" "}
              <a className="font-semibold underline" href={`tel:${church.contact_phone.replace(/\s/g, "")}`}>
                {church.contact_phone}
              </a>
              .{" "}
            </>
          ) : null}
          If you or someone else is in danger, call <a className="font-semibold underline" href="tel:999">999</a>. You
          can talk to Samaritans any time, free, on{" "}
          <a className="font-semibold underline" href="tel:116123">116 123</a>.
        </p>
      </div>

      <p className="mt-8 text-center">
        <Link href={`/c/${slug}`} className="text-sm font-semibold text-brand hover:underline">
          Send another request
        </Link>
      </p>
    </main>
  );
}
