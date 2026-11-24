import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 font-serif text-xl font-semibold text-ink">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="15" fill="var(--color-brand)" />
        <path d="M16 7v18M10 13h12" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      Intercede
    </Link>
  );
}
