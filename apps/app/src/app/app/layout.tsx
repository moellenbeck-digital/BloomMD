import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession, isAuthRequired } from "../../lib/auth";
import { Providers } from "../providers";
import { TrialReadonlyNotice } from "../trial-notice";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let userId: string | undefined;
  if (isAuthRequired()) {
    const session = await getSession();
    if (!session) redirect("/login?next=/app");
    userId = session.userId;
  }

  const requestHeaders = await headers();
  const initialLocale = requestHeaders.get("x-bloommd-locale") === "en" ? "en" : "de";
  return (
    <Providers initialLocale={initialLocale}>
      {children}
      <TrialReadonlyNotice userId={userId} locale={initialLocale} floating />
    </Providers>
  );
}
