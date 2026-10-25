import Link from "next/link";
import { withMarketingLocale, type MarketingLocale } from "@/lib/locale";

const OBSIDIAN_RELEASE_URL = "https://github.com/moellenbeck-digital/bloommd-obsidian/releases/latest";

export function AvailabilityOverview({ locale, embedded = false }: { locale: MarketingLocale; embedded?: boolean }) {
  const en = locale === "en";
  const betaHref = en ? "/en#beta" : "/#beta";

  return (
    <section id="availability" aria-labelledby="availability-heading" className={embedded ? "rounded-xl border border-[#E8E4DF] bg-[#FFF8F3]" : "border-y border-[#E8E4DF] bg-[#FFF8F3]"}>
      <div className={embedded ? "px-5 py-8 sm:px-7" : "mx-auto max-w-7xl px-5 py-14 sm:px-8"}>
        <p className="text-sm font-semibold uppercase tracking-wide text-[#B64A1F]">
          {en ? "Availability" : "Verfügbarkeit"}
        </p>
        <h2 id="availability-heading" className="mt-2 text-3xl font-semibold text-[#1A1A1A] sm:text-4xl">
          {en ? "What can you use today?" : "Was kannst du heute nutzen?"}
        </h2>
        <p className="mt-4 max-w-3xl text-base leading-7 text-[#514C46]">
          {en
            ? "Closed beta means that BloomMD Web, cloud workspaces, sync and collaboration require an invitation. The browser demo, local desktop builds and Obsidian plugin are available without a BloomMD account."
            : "Geschlossene Beta bedeutet: Für BloomMD Web, Cloud-Workspaces, Sync und Zusammenarbeit brauchst du eine Einladung. Browser-Demo, lokale Desktop-Builds und Obsidian-Plugin kannst du ohne BloomMD-Konto nutzen."}
        </p>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-[#E8E4DF] bg-white p-6">
            <h3 className="text-lg font-semibold text-[#1A1A1A]">{en ? "Available now, no invitation" : "Jetzt verfügbar, ohne Einladung"}</h3>
            <ul className="mt-4 grid gap-4 text-sm leading-6 text-[#514C46]">
              <li>
                <Link className="font-semibold text-[#B94316] underline" href={withMarketingLocale("/demo", locale)}>{en ? "Browser demo" : "Browser-Demo"}</Link>
                {en ? " and Markdown templates in your browser." : " und Markdown-Vorlagen im Browser."}
              </li>
              <li>
                <Link className="font-semibold text-[#B94316] underline" href={withMarketingLocale("/download", locale)}>{en ? "Desktop beta" : "Desktop-Beta"}</Link>
                {en ? " for macOS on Apple Silicon and Omarchy/Arch Linux on x86_64 or ARM64. Download directly; local use needs no account." : " für macOS mit Apple Silicon und Omarchy/Arch Linux auf x86_64 oder ARM64. Direkt herunterladen; lokale Nutzung braucht kein Konto."}
              </li>
              <li>
                <Link className="font-semibold text-[#B94316] underline" href={withMarketingLocale("/obsidian", locale)}>{en ? "Obsidian plugin" : "Obsidian-Plugin"}</Link>
                {en ? " for desktop, iPad, iPhone and Android. Install via BRAT or the " : " für Desktop, iPad, iPhone und Android. Installation über BRAT oder die "}
                <a className="font-semibold text-[#B94316] underline" href={OBSIDIAN_RELEASE_URL}>{en ? "latest release" : "aktuellen Release"}</a>.
              </li>
            </ul>
          </div>

          <div className="rounded-xl border border-[#E8E4DF] bg-white p-6">
            <h3 className="text-lg font-semibold text-[#1A1A1A]">{en ? "Invitation required" : "Einladung erforderlich"}</h3>
            <p className="mt-4 text-sm leading-6 text-[#514C46]">
              {en
                ? "BloomMD Web at bloommd.app, cloud workspaces, sync and collaboration are limited to invited testers. Joining the waitlist does not create an account; a personal invitation enables sign-up."
                : "BloomMD Web auf bloommd.app, Cloud-Workspaces, Sync und Zusammenarbeit sind für eingeladene Tester freigeschaltet. Die Warteliste erstellt noch kein Konto; erst eine persönliche Einladung ermöglicht die Registrierung."}
            </p>
            <Link className="mt-4 inline-flex min-h-11 items-center font-semibold text-[#B94316] underline" href={betaHref}>
              {en ? "Join the beta waitlist" : "Für die Beta-Warteliste anmelden"}
            </Link>
          </div>

          <div className="rounded-xl border border-[#E8E4DF] bg-white p-6">
            <h3 className="text-lg font-semibold text-[#1A1A1A]">{en ? "No public download yet" : "Noch kein öffentlicher Download"}</h3>
            <p className="mt-4 text-sm leading-6 text-[#514C46]">
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
