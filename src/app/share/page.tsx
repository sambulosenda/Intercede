import { headers } from "next/headers";
import QRCode from "qrcode";
import { TeamHeader } from "@/components/TeamHeader";
import { requireMember } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function SharePage() {
  const { supabase, member } = await requireMember();
  const { data: church } = await supabase.from("churches").select("name, slug").single();
  const h = await headers();
  const base = process.env.NEXT_PUBLIC_SITE_URL || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const url = `${base}/c/${church?.slug}`;
  const svg = await QRCode.toString(url, { type: "svg", margin: 1, width: 280, color: { dark: "#1f2430", light: "#ffffff" } });

  return (
    <>
      <TeamHeader member={member} churchName={church?.name ?? ""} />
      <main className="mx-auto max-w-md px-4 py-10 text-center">
        <h1 className="font-serif text-2xl font-semibold">Ask for prayer</h1>
        <p className="mt-1 text-muted">Print this or show it on screen. It opens the {church?.name} prayer request form.</p>
        <div className="card mx-auto mt-6 w-fit p-4" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="mt-4 break-all font-mono text-sm">{url}</p>
      </main>
    </>
  );
}
