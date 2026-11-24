import Link from "next/link";
import { signOut } from "@/lib/actions/auth";
import type { Member } from "@/lib/types";
import { Logo } from "./Logo";

export function TeamHeader({ member, churchName }: { member: Member; churchName: string }) {
  return (
    <header className="border-b border-line bg-card">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3">
          <Logo href="/inbox" />
          <span className="hidden text-sm text-muted sm:inline">{churchName}</span>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/inbox" className="font-semibold text-ink hover:text-brand">Inbox</Link>
          {member.role !== "intercessor" && (
            <Link href="/share" className="font-semibold text-ink hover:text-brand">QR code</Link>
          )}
          <span className="hidden text-muted md:inline">
            {member.display_name} · <span className="capitalize">{member.role}</span>
          </span>
          <form action={signOut}>
            <button className="text-muted hover:text-ink">Sign out</button>
          </form>
        </nav>
      </div>
    </header>
  );
}
