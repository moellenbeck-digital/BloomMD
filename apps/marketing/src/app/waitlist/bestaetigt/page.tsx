import Link from "next/link";
import type { Metadata } from "next";
import { getMarketingLocale, withMarketingLocale } from "../../../lib/locale";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  return { title: `${getMarketingLocale((await searchParams).lang) === "en" ? "Waitlist confirmed" : "Warteliste bestätigt"} · BloomMD`, robots: { index: false } };
}

export default async function WaitlistConfirmed({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const locale = getMarketingLocale((await searchParams).lang);
  const copy = locale === "de"
    ? { title: "Du stehst auf der Warteliste", text: "Wir melden uns, sobald ein Platz frei wird. Bis dahin bekommst du nichts von uns — kein Newsletter, keine Erinnerungen.", demo: "die Demo", language: "EN" }
    : { title: "You are on the waitlist", text: "We will contact you when a beta seat opens. Until then, you will not receive anything else — no newsletter and no reminders.", demo: "the demo", language: "DE" };
  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#C94D20]">BloomMD</p>
      <h1 className="mt-2 text-3xl font-semibold">{copy.title}</h1>
      <p className="mt-4 text-neutral-600">{copy.text}</p>
      <p className="mt-6 text-sm text-neutral-600">
        {locale === "de" ? "Bis dahin kannst du " : "In the meantime, try "}<Link href={withMarketingLocale("/demo", locale)} className="font-semibold text-[#C94D20] hover:underline">{copy.demo}</Link>{locale === "de" ? " ausprobieren. Sie braucht kein Konto." : ". It does not require an account."}
      </p>
      <Link href={withMarketingLocale("/waitlist/bestaetigt", locale === "de" ? "en" : "de")} className="mt-6 inline-block text-sm font-semibold text-[#C94D20]">{copy.language}</Link>
    </main>
  );
}
