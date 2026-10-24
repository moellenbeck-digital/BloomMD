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
      <LegalSection title={en ? "Hosted beta access" : "Zugang zur gehosteten Beta"}>
        <p>{en ? "Access to the hosted BloomMD beta is available to invited testers within the scope of their enabled account. The source code license above governs use of the source code independently of hosted beta access." : "Der Zugang zur gehosteten BloomMD-Beta steht eingeladenen Testern im Rahmen ihres freigeschalteten Kontos zur Verfügung. Die oben genannte Quellcode-Lizenz regelt die Nutzung des Quellcodes unabhängig vom Zugang zur gehosteten Beta."}</p>
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
