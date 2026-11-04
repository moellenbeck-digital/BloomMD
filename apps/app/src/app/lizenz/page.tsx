import type { Metadata } from "next";
import { LegalPage, LegalSection } from "../legal-page";
import { LEGAL_STATUS } from "../../lib/legal";
import { getAppLocale, type AppLocale } from "../../lib/locale";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  return { title: `${getAppLocale((await searchParams).lang) === "en" ? "License terms" : "Lizenzbedingungen"} | BloomMD`, robots: { index: true, follow: true } };
}

export default async function LizenzPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const locale: AppLocale = getAppLocale((await searchParams).lang);
  const en = locale === "en";
  return (
    <LegalPage title={en ? "License terms" : "Lizenzbedingungen"} eyebrow={en ? "License" : "Lizenz"} locale={locale}>
      <LegalSection title={en ? "Source code license" : "Quellcode-Lizenz"}>
        <p>{en ? "BloomMD source code from Marketing 0.5.1 onward is available under the Elastic License 2.0 (ELv2). Earlier published versions, including Desktop v0.5.14, retain their original MIT license. The Obsidian plugin is and stays licensed under MIT." : "Der BloomMD-Quellcode steht ab Marketing 0.5.1 unter der Elastic License 2.0 (ELv2). Frühere veröffentlichte Versionen, einschließlich Desktop v0.5.14, behalten ihre ursprüngliche MIT-Lizenz. Das Obsidian-Plugin steht weiterhin unter der MIT-Lizenz."}</p>
        <p><a href="https://www.elastic.co/licensing/elastic-license/">{en ? "Read the Elastic License 2.0" : "Elastic License 2.0 lesen"}</a></p>
      </LegalSection>
      <LegalSection title={en ? "Access to BloomMD Web and Cloud" : "Zugang zu BloomMD Web und Cloud"}>
        <p>{en ? <>Access to BloomMD Web and Cloud is provided through a free trial account. It is valid for 30 days from confirmation of your email address. For existing accounts, including former waitlist participants, the trial period ends on December 15, 2026. After that the account is read-only: you can still read and export your content. The <a href={`/agb?lang=${locale}`}>terms and conditions</a> apply. The source code license above governs use of the source code independently of access to the hosted service.</> : <>Der Zugang zu BloomMD Web und Cloud erfolgt über einen kostenlosen Testaccount. Er gilt 30 Tage ab der Bestätigung deiner E-Mail-Adresse. Für bestehende Konten, auch frühere Wartelisten-Teilnehmer, endet der Testzeitraum am 15.12.2026. Danach ist das Konto nur noch lesbar: Du kannst deine Inhalte weiterhin lesen und exportieren. Es gelten die <a href={`/agb?lang=${locale}`}>AGB</a>. Die oben genannte Quellcode-Lizenz regelt die Nutzung des Quellcodes unabhängig vom Zugang zum gehosteten Dienst.</>}</p>
      </LegalSection>
      <LegalSection title={en ? "Local use" : "Lokale Nutzung"}>
        <p>{en ? "The desktop app, Obsidian compatibility and CLI are intended for local Markdown files. Files remain portable and can be used independently of BloomMD in other Markdown tools." : "Desktop-App, Obsidian-Kompatibilität und CLI sind für lokale Markdown-Dateien gedacht. Dateien bleiben portabel und können unabhängig von BloomMD in anderen Markdown-Werkzeugen genutzt werden."}</p>
      </LegalSection>
      <LegalSection title={en ? "Open-format principle" : "Open-Format-Prinzip"}>
        <p>{en ? "Content remains exportable as Markdown files and can continue to be used independently of BloomMD." : "Inhalte bleiben als Markdown-Dateien exportierbar und können unabhängig von BloomMD weiter genutzt werden."}</p>
      </LegalSection>
      <LegalSection title={en ? "As of" : "Stand"}>
        <p>{LEGAL_STATUS}</p>
      </LegalSection>
    </LegalPage>
  );
}
