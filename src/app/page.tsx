import Link from "next/link";
import { Logo } from "@/components/Logo";

const DEMO_SLUG = process.env.NEXT_PUBLIC_DEMO_CHURCH_SLUG || "icc-luton";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-6 sm:px-6">
      <header className="flex items-center justify-between">
        <Logo />
        <Link href="/login" className="text-sm font-semibold text-brand hover:underline">
          Prayer team sign in
        </Link>
      </header>

      <section className="flex flex-1 flex-col justify-center py-16">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand">For church prayer teams</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold leading-tight sm:text-5xl">No prayer request forgotten.</h1>
        <p className="mt-5 max-w-xl text-lg text-muted">
          People ask for prayer by form or QR code. Your team receives, shares out, prays through and follows up every
          request. AI does the sorting and drafting. People make every decision.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href={`/c/${DEMO_SLUG}`} className="btn-primary px-6 py-3 text-base">
            Ask for prayer
          </Link>
          <Link href="/login" className="btn-secondary px-6 py-3 text-base">
            Open the prayer team inbox
          </Link>
        </div>
      </section>

      <section className="grid gap-4 pb-10 sm:grid-cols-3">
        {[
          ["Received", "One list for every request, with how long each has waited."],
          ["Prayed for", "Each request shared out to a named intercessor with a short prayer brief."],
          ["Followed up", "A check-in drafted for the team to approve, and answered prayers kept."],
        ].map(([title, text]) => (
          <div key={title} className="card p-5">
            <h2 className="font-serif text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted">{text}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
