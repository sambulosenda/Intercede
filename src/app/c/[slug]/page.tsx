import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { RequestForm } from "./RequestForm";

export const dynamic = "force-dynamic";

export default async function RequestPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = createServiceClient();
  const { data: church } = await db.from("churches").select("name, slug, ai_enabled").eq("slug", slug).single();
  if (!church) notFound();

  return (
    <main className="mx-auto max-w-lg px-4 py-6 sm:py-10">
      <p className="text-sm font-semibold text-brand">{church.name}</p>
      <h1 className="mt-1 font-serif text-3xl font-semibold">How can we pray for you?</h1>
      <p className="mt-2 text-muted">
        Our prayer team will pray for you. It takes about a minute. Your name and contact are optional.
      </p>
      <RequestForm slug={church.slug} churchName={church.name} aiEnabled={church.ai_enabled} />
    </main>
  );
}
