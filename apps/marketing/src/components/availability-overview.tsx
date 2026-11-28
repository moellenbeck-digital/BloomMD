import Link from "next/link";
import { publicAppUrl } from "@/lib/deployment";
import { withMarketingLocale, type MarketingLocale } from "@/lib/locale";

const OBSIDIAN_RELEASE_URL = "https://github.com/moellenbeck-digital/bloommd-obsidian/releases/latest";

/* Default look (download page, embedded). The landing pages pass the v2 skin, see v2/availability-trieb.tsx. */
export function availabilityClasses(embedded: boolean) {
  const card = "rounded-xl border border-[#E8E4DF] bg-white p-6";
  return {
    section: embedded ? "rounded-xl border border-[#E8E4DF] bg-[#FFF8F3]" : "border-y border-[#E8E4DF] bg-[#FFF8F3]",
    wrap: embedded ? "px-5 py-8 sm:px-7" : "mx-auto max-w-7xl px-5 py-14 sm:px-8",
    kicker: "text-sm font-semibold uppercase tracking-wide text-[#B64A1F]",
    title: "mt-2 text-3xl font-semibold text-[#1A1A1A] sm:text-4xl",
    intro: "mt-4 max-w-3xl text-base leading-7 text-[#514C46]",
    grid: "mt-8 grid gap-4 lg:grid-cols-3",
    now: card,
    trial: card,
    later: card,
    heading: "text-lg font-semibold text-[#1A1A1A]",
    list: "mt-4 grid gap-4 text-sm leading-6 text-[#514C46]",
    text: "mt-4 text-sm leading-6 text-[#514C46]",
    link: "font-semibold text-[#B94316] underline",
    action: "mt-4 inline-flex min-h-11 items-center font-semibold text-[#B94316] underline",
  };
}

export function AvailabilityOverview({ locale, embedded = false, skin }: { locale: MarketingLocale; embedded?: boolean; skin?: ReturnType<typeof availabilityClasses> }) {
  const c = skin ?? availabilityClasses(embedded);
  const en = locale === "en";
  const signupHref = `${publicAppUrl()}/signup${en ? "?lang=en" : ""}`;

  return (
    <section id="availability" aria-labelledby="availability-heading" className={c.section}>
      <div className={c.wrap}>
        <p className={c.kicker}>
          {en ? "Availability" : "Verfügbarkeit"}
        </p>
        <h2 id="availability-heading" className={c.title}>
          {en ? "What can you use today?" : "Was kannst du heute nutzen?"}
        </h2>
        <p className={c.intro}>
          {en
            ? "BloomMD Web, cloud workspaces, sync and collaboration are available with a free trial account: 30 days from email confirmation, no invitation and no waitlist. The browser demo, local desktop builds and Obsidian plugin are available without an account."
            : "Für BloomMD Web, Cloud-Workspaces, Sync und Zusammenarbeit gibt es den kostenlosen Testaccount: 30 Tage ab E-Mail-Bestätigung, ohne Einladung und ohne Warteliste. Browser-Demo, lokale Desktop-Builds und Obsidian-Plugin kannst du ohne Konto nutzen."}
        </p>

        <div className={c.grid}>
          <div className={c.now}>
            <h3 className={c.heading}>{en ? "Available now, no account" : "Jetzt verfügbar, ohne Konto"}</h3>
            <ul className={c.list}>
              <li>
                <Link className={c.link} href={withMarketingLocale("/demo", locale)}>{en ? "Browser demo" : "Browser-Demo"}</Link>
                {en ? " and Markdown templates in your browser." : " und Markdown-Vorlagen im Browser."}
              </li>
              <li>
                <Link className={c.link} href={withMarketingLocale("/download", locale)}>{en ? "Desktop beta" : "Desktop-Beta"}</Link>
                {en ? " for macOS on Apple Silicon and Omarchy/Arch Linux on x86_64 or ARM64. Download directly; local use needs no account." : " für macOS mit Apple Silicon und Omarchy/Arch Linux auf x86_64 oder ARM64. Direkt herunterladen; lokale Nutzung braucht kein Konto."}
              </li>
              <li>
                <Link className={c.link} href={withMarketingLocale("/obsidian", locale)}>{en ? "Obsidian plugin" : "Obsidian-Plugin"}</Link>
                {en ? " for desktop, iPad, iPhone and Android. Install via BRAT or the " : " für Desktop, iPad, iPhone und Android. Installation über BRAT oder die "}
                <a className={c.link} href={OBSIDIAN_RELEASE_URL}>{en ? "latest release" : "aktuellen Release"}</a>.
              </li>
            </ul>
          </div>

          <div className={c.trial}>
            <h3 className={c.heading}>{en ? "Free trial account" : "Kostenloser Testaccount"}</h3>
            <p className={c.text}>
              {en
                ? "BloomMD Web at bloommd.app, cloud workspaces, sync and collaboration need a free trial account. It is valid for 30 days from email confirmation; afterwards your account is read-only, export remains possible and nothing is lost. There is no invitation and no waitlist; you can register right away."
                : "BloomMD Web auf bloommd.app, Cloud-Workspaces, Sync und Zusammenarbeit brauchen einen kostenlosen Testaccount. Er gilt 30 Tage ab E-Mail-Bestätigung; danach ist dein Konto nur noch lesbar, der Export bleibt möglich und nichts geht verloren. Es gibt keine Einladung und keine Warteliste; du kannst dich direkt registrieren."}
            </p>
            <a className={c.action} href={signupHref} data-testid="signup-cta">
              {en ? "Register now" : "Jetzt registrieren"}
            </a>
          </div>

          <div className={c.later}>
            <h3 className={c.heading}>{en ? "No public download yet" : "Noch kein öffentlicher Download"}</h3>
            <p className={c.text}>
              {en
                ? "The standalone BloomMD app for iPad, iPhone and Android is separate from the Obsidian plugin and is not in the public app stores yet. A Windows desktop build is also not available."
                : "Die eigenständige BloomMD-App für iPad, iPhone und Android ist etwas anderes als das Obsidian-Plugin und steht noch nicht in den öffentlichen App-Stores bereit. Einen Windows-Desktop-Build gibt es ebenfalls noch nicht."}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
