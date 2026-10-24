import { redirect } from "next/navigation";

export default async function DesktopPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const lang = (await searchParams).lang === "en" ? "en" : "de";
  redirect(`/download${lang === "en" ? "?lang=en" : ""}`);
}
