import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession, isAuthRequired } from "../../lib/auth";
import { Providers } from "../providers";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (isAuthRequired()) {
    const session = await getSession();
    if (!session) redirect("/login?next=/app");
  }

  const requestHeaders = await headers();
  const initialLocale = requestHeaders.get("x-bloommd-locale") === "en" ? "en" : "de";
  return <Providers initialLocale={initialLocale}>{children}</Providers>;
}
