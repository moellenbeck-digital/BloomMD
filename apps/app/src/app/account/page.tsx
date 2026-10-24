import Link from "next/link";
import { redirect } from "next/navigation";
import { CreditCard, Download, LogOut, MailCheck, MoveLeft, ShieldCheck, Trash2 } from "lucide-react";
import { getSession } from "../../lib/auth";
import { getBuildInfo } from "../../lib/build-info";
import { getBillingPlan } from "../../lib/billing";
import { getMarketAccountByEmail, isDatabaseConfigured, listAccessTokens, listWorkspacesForUser, normalizeUuid } from "../../lib/db";
import { AccessTokens } from "./access-tokens";
import { getAppLocale, otherAppLocale, withAppLocale } from "../../lib/locale";

const billingMessages: Record<string, string> = {
  "database-not-configured": "Die Datenbank ist noch nicht konfiguriert.",
  "not-configured": "Stripe ist noch nicht vollständig konfiguriert.",
  "no-stripe-customer": "Für diesen Account gibt es noch keinen Stripe-Kunden. Starte zuerst einen Checkout.",
  "portal-error": "Das Stripe-Kundenportal konnte nicht geöffnet werden.",
  "portal-missing-url": "Stripe hat keine Portal-URL zurückgegeben.",
};

function formatDate(value: string | null, locale: "de" | "en") {
  if (!value) return locale === "de" ? "ohne Ablaufdatum" : "no expiration date";
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-US", { dateStyle: "medium" }).format(new Date(value));
}

function planLabel(tier: string) {
  return getBillingPlan(tier)?.name ?? tier;
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string; accountError?: string; lang?: string }>;
}) {
  const params = await searchParams;
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent("/account")}&lang=${getAppLocale(params.lang)}`);

  const locale = getAppLocale(params.lang);
  const copy = locale === "de"
    ? { back: "Zurück zur App", logout: "Abmelden", plan: "Plan und Abrechnung", signedIn: "Angemeldet als", status: "Aktueller Status", paid: "Kostenpflichtig aktiv", free: "Free / kein aktiver Kauf", verified: "E-Mail-Adresse bestätigt", unverified: "E-Mail-Adresse noch nicht bestätigt", features: "Freigeschaltete Funktionen", localFree: "Du nutzt aktuell den kostenlosen lokalen Einstieg.", activeUntil: "Aktiv bis", billing: "Abrechnung", latest: "Letzter Plan", cancellation: "Kündigung zum Periodenende vorgemerkt", noCancellation: "Keine geplante Kündigung hinterlegt", noStripe: "Noch keine Stripe-Buchung für diesen Account gespeichert.", manage: "Rechnungen und Abo verwalten", about: "Über BloomMD", deployment: "Deployment", data: "Deine Daten", exportText: "Der Export enthält Accountdaten, Berechtigungen, Workspace-Mitgliedschaften, Markdown-Dokumente und gespeicherte Cloud-Views.", export: "Accountdaten exportieren", deleteTitle: "Account dauerhaft löschen", deleteText: "Persönliche Workspaces, Cloud-Dokumente, Views, Sessions und Berechtigungen werden unwiderruflich gelöscht. Laufende Stripe-Abos werden vorher beendet.", prepare: "Löschung vorbereiten", confirmEmail: "Zur Bestätigung deine E-Mail eingeben", password: "Passwort", delete: "Account und Cloud-Daten löschen", language: "EN" }
    : { back: "Back to the app", logout: "Sign out", plan: "Plan and billing", signedIn: "Signed in as", status: "Current status", paid: "Paid plan active", free: "Free / no active purchase", verified: "Email address confirmed", unverified: "Email address not confirmed yet", features: "Enabled features", localFree: "You are currently using the free local entry point.", activeUntil: "Active until", billing: "Billing", latest: "Latest plan", cancellation: "Cancellation scheduled for the end of the period", noCancellation: "No cancellation scheduled", noStripe: "No Stripe purchase is stored for this account yet.", manage: "Manage invoices and subscription", about: "About BloomMD", deployment: "Deployment", data: "Your data", exportText: "The export contains account data, permissions, workspace memberships, Markdown documents, and stored cloud views.", export: "Export account data", deleteTitle: "Delete account permanently", deleteText: "Personal workspaces, cloud documents, views, sessions, and permissions will be deleted permanently. Active Stripe subscriptions are cancelled first.", prepare: "Prepare deletion", confirmEmail: "Enter your email to confirm", password: "Password", delete: "Delete account and cloud data", language: "DE" };
  const account = isDatabaseConfigured() ? await getMarketAccountByEmail(session.email) : null;
  const activeEntitlements = account?.entitlements.filter((item) => item.active) ?? [];
  const latestSubscription = account?.subscriptions[0];
  const userId = normalizeUuid(session.userId);
  const accessTokens = userId ? await listAccessTokens(userId) : [];
  const workspaces = userId && isDatabaseConfigured() ? (await listWorkspacesForUser(userId).catch(() => [])).map(({ id, name, kind }) => ({ id, name, kind })) : [];
  const buildInfo = getBuildInfo("app");
  const localizedBillingMessages: Record<string, string> = locale === "de" ? billingMessages : {
    "database-not-configured": "The database is not configured yet.",
    "not-configured": "Stripe is not fully configured yet.",
    "no-stripe-customer": "This account does not have a Stripe customer yet. Start a checkout first.",
    "portal-error": "The Stripe customer portal could not be opened.",
    "portal-missing-url": "Stripe did not return a portal URL.",
  };

  return (
    <main className="min-h-screen bg-[#FAFAFA] text-[#1A1A1A]">
      <div className="mx-auto max-w-4xl px-5 py-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href={withAppLocale("/app", locale)} className="inline-flex items-center gap-2 text-sm font-semibold text-[#666666] hover:text-[#1A1A1A]">
            <MoveLeft size={16} aria-hidden="true" />
            {copy.back}
          </Link>
          <div className="flex items-center gap-3">
            <Link href={withAppLocale("/account", otherAppLocale(locale))} className="text-xs font-semibold text-[#666666]">{copy.language}</Link>
            <form action="/api/auth/logout" method="post">
              <button className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-[#D4CFC8] bg-white px-4 text-sm font-semibold hover:bg-[#F2F0ED]"><LogOut size={16} aria-hidden="true" />{copy.logout}</button>
            </form>
          </div>
        </div>

        <section className="rounded-xl border border-[#E8E4DF] bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-[#B64A1F]">Account</p>
              <h1 className="mt-2 text-3xl font-semibold">{copy.plan}</h1>
              <p className="mt-3 text-sm leading-6 text-[#666666]">
                {copy.signedIn} <span className="font-semibold text-[#1A1A1A]">{session.email}</span>
              </p>
            </div>
            <div className="rounded-lg border border-[#E8E4DF] bg-[#FCFBFA] px-4 py-3 text-sm">
              <div className="text-[#666666]">{copy.status}</div>
              <div className="mt-1 font-semibold">{activeEntitlements.length > 0 ? copy.paid : copy.free}</div>
            </div>
          </div>

          {params.billing && billingMessages[params.billing] && (
            <div className="mt-5 rounded-md border border-[#FFD4BF] bg-[#FFF4EE] px-4 py-3 text-sm text-[#8A3518]">
              {localizedBillingMessages[params.billing]}
            </div>
          )}
          {params.accountError && (
            <div className="mt-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {locale === "en" && decodeURIComponent(params.accountError) === "E-Mail-Bestätigung oder Passwort ist nicht korrekt." ? "Email confirmation or password is incorrect." : decodeURIComponent(params.accountError)}
            </div>
          )}

          <div className="mt-5 flex items-center gap-2 rounded-md border border-[#E8E4DF] bg-[#FCFBFA] px-4 py-3 text-sm">
            <MailCheck size={18} className={account?.user.emailVerifiedAt ? "text-emerald-600" : "text-amber-600"} aria-hidden="true" />
            <span>{account?.user.emailVerifiedAt ? copy.verified : copy.unverified}</span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <article className="rounded-lg border border-[#E8E4DF] bg-[#FCFBFA] p-4">
              <div className="flex items-center gap-2 font-semibold">
                <ShieldCheck size={18} className="text-[#FF6B35]" aria-hidden="true" />
                {copy.features}
              </div>
              <div className="mt-4 grid gap-2 text-sm">
                {activeEntitlements.length > 0 ? (
                  activeEntitlements.map((item) => (
                    <div key={`${item.feature}-${item.expiresAt}`} className="rounded-md border border-[#E8E4DF] bg-white px-3 py-2">
                      <div className="font-semibold">{planLabel(item.feature)}</div>
                      <div className="mt-1 text-[#666666]">{copy.activeUntil} {formatDate(item.expiresAt, locale)}</div>
                    </div>
                  ))
                ) : (
                  <p className="leading-6 text-[#666666]">{copy.localFree}</p>
                )}
              </div>
            </article>

            <article className="rounded-lg border border-[#E8E4DF] bg-[#FCFBFA] p-4">
              <div className="flex items-center gap-2 font-semibold">
                <CreditCard size={18} className="text-[#FF6B35]" aria-hidden="true" />
                {copy.billing}
              </div>
              <div className="mt-4 text-sm leading-6 text-[#666666]">
                {latestSubscription ? (
                  <>
                    <div>
                      {copy.latest}: <span className="font-semibold text-[#1A1A1A]">{planLabel(latestSubscription.tier)}</span>
                    </div>
                    <div>{locale === "en" ? "Status" : "Status"}: {latestSubscription.status}</div>
                    <div>{latestSubscription.cancelAtPeriodEnd ? copy.cancellation : copy.noCancellation}</div>
                  </>
                ) : (
                  copy.noStripe
                )}
              </div>
              <form action="/api/billing/portal" method="post" className="mt-5">
                <input type="hidden" name="lang" value={locale} />
                <button
                  type="submit"
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#1A1A1A] px-4 text-sm font-semibold text-white hover:bg-[#333333]"
                >
                  <CreditCard size={16} aria-hidden="true" />
                  {copy.manage}
                </button>
              </form>
            </article>
          </div>
        </section>

        <AccessTokens initialTokens={accessTokens} workspaces={workspaces} locale={locale} />

        <section className="mt-6 rounded-xl border border-[#E8E4DF] bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">{copy.about}</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-lg border border-[#E8E4DF] bg-[#FCFBFA] px-4 py-3">
              <dt className="text-[#666666]">Version</dt>
              <dd className="mt-1 font-mono font-semibold" data-testid="account-build-version">{buildInfo.displayVersion}</dd>
            </div>
            <div className="rounded-lg border border-[#E8E4DF] bg-[#FCFBFA] px-4 py-3">
              <dt className="text-[#666666]">{copy.deployment}</dt>
              <dd className="mt-1 font-mono font-semibold">{buildInfo.deployment}</dd>
            </div>
          </dl>
        </section>

        <section className="mt-6 rounded-xl border border-[#E8E4DF] bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">{copy.data}</h2>
          <p className="mt-2 text-sm leading-6 text-[#666666]">{copy.exportText}</p>
          <a
            href={`/api/account/export?lang=${locale}`}
            className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[#D4CFC8] bg-white px-4 text-sm font-semibold hover:bg-[#F2F0ED]"
          >
            <Download size={16} aria-hidden="true" />
            {copy.export}
          </a>
        </section>

        <section className="mt-6 rounded-xl border border-red-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-red-700">
            <Trash2 size={18} aria-hidden="true" />
            <h2 className="text-xl font-semibold">{copy.deleteTitle}</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-[#666666]">
            {copy.deleteText}
          </p>
          <details className="mt-4 rounded-md border border-red-200 bg-red-50 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-red-700">{copy.prepare}</summary>
            <form action="/api/account/delete" method="post" className="mt-4 grid gap-3">
              <input type="hidden" name="lang" value={locale} />
              <label className="grid gap-1 text-sm font-medium">
                {copy.confirmEmail}
                <input name="confirmation" type="email" required autoComplete="email" className="h-11 rounded-md border border-red-200 bg-white px-3 text-sm outline-none focus:border-red-500" />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                {copy.password}
                <input name="password" type="password" required autoComplete="current-password" className="h-11 rounded-md border border-red-200 bg-white px-3 text-sm outline-none focus:border-red-500" />
              </label>
              <button type="submit" className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800">
                <Trash2 size={16} aria-hidden="true" />
                {copy.delete}
              </button>
            </form>
          </details>
        </section>
      </div>
    </main>
  );
}
