import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { AppLocale } from "../lib/locale";
import { otherAppLocale, withAppLocale } from "../lib/locale";

export function LegalPage({
  title,
  eyebrow,
  locale = "de",
  children,
}: {
  title: string;
  eyebrow: string;
  locale?: AppLocale;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#F8F5F0] text-[#1A1A1A]">
      <div className="mx-auto max-w-3xl px-5 py-10">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <Link href={withAppLocale("/", locale)} className="inline-flex items-center gap-2 text-sm font-semibold text-[#666666] hover:text-[#1A1A1A]">
          <ArrowLeft size={16} aria-hidden="true" />
          {locale === "en" ? "Back to home" : "Zurück zur Startseite"}
        </Link>
        <Link href={withAppLocale("/", otherAppLocale(locale))} className="text-sm font-semibold text-[#B64A1F] hover:underline">
          {locale === "en" ? "DE" : "EN"}
        </Link>
        </div>
        <article className="rounded-xl border border-[#E8E4DF] bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-[#B64A1F]">{eyebrow}</p>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">{title}</h1>
          <div className="mt-8 space-y-7 text-sm leading-7 text-[#555555]">{children}</div>
        </article>
      </div>
    </main>
  );
}

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-[#1A1A1A]">{title}</h2>
      <div className="mt-2 space-y-2">{children}</div>
    </section>
  );
}
