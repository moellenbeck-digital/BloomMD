import { getMarketingLocale, withMarketingLocale } from "../../../lib/locale";
import type { Metadata } from "next";

type SearchParams = Promise<{ lang?: string; status?: string }>;

/**
 * Landing page of the unsubscribe link in waitlist mails. Stays after the waitlist closed, because
 * those mails are already out there. `?status=ungueltig` is the answer to a link that was used
 * already or never existed.
 */
export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  return { title: `${getMarketingLocale((await searchParams).lang) === "en" ? "Unsubscribed" : "Abgemeldet"} · BloomMD`, robots: { index: false } };
}

export default async function WaitlistUnsubscribed({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const locale = getMarketingLocale(params.lang);
  const invalid = params.status === "ungueltig";
  const path = invalid ? "/waitlist/abgemeldet?status=ungueltig" : "/waitlist/abgemeldet";
  const copy = invalid
    ? locale === "de"
      ? { title: "Dieser Abmeldelink wirkt nicht mehr", text: "Er wurde wahrscheinlich schon benutzt — dann bist du bereits abgemeldet und wir schreiben dir nicht mehr." }
      : { title: "This unsubscribe link no longer works", text: "It was probably used already — in that case you are already unsubscribed and we will not contact you again." }
    : locale === "de"
      ? { title: "Abgemeldet", text: "Deine Adresse wurde von der Warteliste entfernt. Wir schreiben dir nicht mehr." }
      : { title: "Unsubscribed", text: "Your address has been removed from the waitlist. We will not contact you again." };
  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#C94D20]">BloomMD</p>
      <h1 className="mt-2 text-3xl font-semibold">{copy.title}</h1>
      <p className="mt-4 text-neutral-600">{copy.text}</p>
      <a href={withMarketingLocale(path, locale === "de" ? "en" : "de")} className="mt-6 inline-block text-sm font-semibold text-[#C94D20]">{locale === "de" ? "EN" : "DE"}</a>
    </main>
  );
}
