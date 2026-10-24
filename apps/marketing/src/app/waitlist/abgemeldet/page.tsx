import { getMarketingLocale, withMarketingLocale } from "../../../lib/locale";
import type { Metadata } from "next";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  return { title: `${getMarketingLocale((await searchParams).lang) === "en" ? "Unsubscribed" : "Abgemeldet"} · BloomMD`, robots: { index: false } };
}

export default async function WaitlistUnsubscribed({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const locale = getMarketingLocale((await searchParams).lang);
  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#C94D20]">BloomMD</p>
      <h1 className="mt-2 text-3xl font-semibold">{locale === "de" ? "Abgemeldet" : "Unsubscribed"}</h1>
      <p className="mt-4 text-neutral-600">{locale === "de" ? "Deine Adresse wurde von der Warteliste entfernt. Wir schreiben dir nicht mehr." : "Your address has been removed from the waitlist. We will not contact you again."}</p>
      <a href={withMarketingLocale("/waitlist/abgemeldet", locale === "de" ? "en" : "de")} className="mt-6 inline-block text-sm font-semibold text-[#C94D20]">{locale === "de" ? "EN" : "DE"}</a>
    </main>
  );
}
