import Link from "next/link";
import type { Metadata } from "next";
import { getMarketingLocale, withMarketingLocale } from "../../../lib/locale";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  return { title: `${getMarketingLocale((await searchParams).lang) === "en" ? "Invalid link" : "Link ungültig"} · BloomMD`, robots: { index: false } };
}

export default async function WaitlistInvalid({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const locale = getMarketingLocale((await searchParams).lang);
  const copy = locale === "de"
    ? { title: "Dieser Link wirkt nicht mehr", text: "Wahrscheinlich wurde er schon einmal benutzt — Bestätigungs- und Abmeldelinks funktionieren nur einmal. Wenn du dir unsicher bist, trag dich einfach erneut ein.", home: "Zur Startseite", language: "EN" }
    : { title: "This link is no longer valid", text: "It was probably already used — confirmation and unsubscribe links work only once. If you are unsure, simply join the waitlist again.", home: "Back to the homepage", language: "DE" };
  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#C94D20]">BloomMD</p>
      <h1 className="mt-2 text-3xl font-semibold">{copy.title}</h1>
      <p className="mt-4 text-neutral-600">{copy.text}</p>
      <p className="mt-6 text-sm">
        <Link href={locale === "de" ? "/" : "/en"} className="font-semibold text-[#C94D20] hover:underline">{copy.home}</Link>
      </p>
      <Link href={withMarketingLocale("/waitlist/ungueltig", locale === "de" ? "en" : "de")} className="mt-4 inline-block text-sm font-semibold text-[#C94D20]">{copy.language}</Link>
    </main>
  );
}
