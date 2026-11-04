import Link from "next/link";
import { Download, Globe, Smartphone } from "lucide-react";
import { LegalPage } from "../legal-page";
import type { MarketingLocale } from "../../lib/locale";
import { withMarketingLocale } from "../../lib/locale";

/**
 * Shown when an /open link reaches the website, i.e. the app is not installed (or the link was
 * opened somewhere that does not hand it to the app). It shows nothing from the link: `appUrl`
 * is a freshly built, validated `bloommd://` link or null.
 */
export function OpenFallback({ locale, appUrl }: { locale: MarketingLocale; appUrl: string | null }) {
  const en = locale === "en";
  const button = "inline-flex min-h-11 items-center gap-2 rounded-md px-4 text-sm font-semibold";
  return (
    <LegalPage title={en ? "BloomMD app not installed" : "BloomMD-App nicht installiert"} eyebrow={en ? "Open in BloomMD" : "In BloomMD öffnen"} locale={locale} path="/open">
      <p>{en ? "This link is meant to open a mind map in the BloomMD app, but the app did not open." : "Dieser Link soll eine Mindmap in der BloomMD-App öffnen, die App hat sich aber nicht geöffnet."}</p>
      <div className="flex flex-wrap gap-3">
        <Link href={withMarketingLocale("/download", locale)} className={`${button} bg-[#B94316] text-white hover:bg-[#B64A1F]`}>
          <Download size={16} aria-hidden="true" />
          {en ? "Download BloomMD" : "BloomMD herunterladen"}
        </Link>
        <Link href={withMarketingLocale("/demo", locale)} className={`${button} border border-[#E8E4DF] hover:bg-[#F8F5F0]`}>
          <Globe size={16} aria-hidden="true" />
          {en ? "Use the web app" : "Web-App nutzen"}
        </Link>
      </div>
      {appUrl ? (
        <p>
          <a href={appUrl} className="inline-flex items-center gap-2 font-semibold text-[#B64A1F] hover:underline">
            <Smartphone size={16} aria-hidden="true" />
            {en ? "App already installed? Open in the app" : "App schon installiert? In der App öffnen"}
          </a>
        </p>
      ) : null}
    </LegalPage>
  );
}
