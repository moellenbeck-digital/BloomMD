import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "../../../lib/auth";
import { getAuthLocale, languageLabel, otherAuthLocale, roleLabel } from "../../../lib/auth-copy";
import { isDatabaseConfigured, listWorkspacesForUser, normalizeUuid } from "../../../lib/db";
import { appendAuthParams } from "../../../lib/invite-intent";
import { isValidChallenge, isValidState, mobileRedirectUrl, normalizeDeviceName } from "../../../lib/mobile-auth";
import { MobileConsentActions } from "./MobileConsentActions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const copy = {
  de: {
    eyebrow: "App-Anmeldung",
    title: (device: string) => `BloomMD-App auf „${device}“ verbinden?`,
    intro: "Die App erhält Zugriff auf deine Workspaces und Mindmaps, wie im Browser: lesen, bearbeiten, anlegen, live zusammenarbeiten und Workspaces verwalten.",
    account: "Angemeldet als",
    workspaces: "Workspaces, auf die die App zugreifen kann",
    noWorkspaces: "Noch keine Workspaces – dein persönlicher Workspace wird beim ersten Öffnen angelegt.",
    more: (count: number) => `und ${count} weitere`,
    notAllowed: "Konto-Einstellungen, Passwort und Abrechnung bleiben im Browser; die App kann sie nicht ändern.",
    validity: "Die Verbindung gilt ein Jahr. Du kannst sie jederzeit in der App (Abmelden) oder unter Konto › Desktop- und Agenten-Zugriff widerrufen.",
    unexpected: "Nur erlauben, wenn du gerade selbst in der BloomMD-App „Anmelden“ gewählt hast.",
    notYou: "Nicht du?",
    switchAccount: "Mit anderem Konto anmelden",
    invalidTitle: "Dieser Anmeldelink ist ungültig",
    invalidBody: "Starte die Anmeldung erneut in der BloomMD-App.",
    unavailable: "Die App-Anmeldung ist auf dieser BloomMD-Instanz nicht verfügbar (keine Datenbank konfiguriert).",
  },
  en: {
    eyebrow: "App sign-in",
    title: (device: string) => `Connect the BloomMD app on “${device}”?`,
    intro: "The app gets access to your workspaces and mind maps, like the browser: read, edit, create, collaborate live and manage workspaces.",
    account: "Signed in as",
    workspaces: "Workspaces the app can access",
    noWorkspaces: "No workspaces yet – your personal workspace is created when you first open BloomMD.",
    more: (count: number) => `and ${count} more`,
    notAllowed: "Account settings, password and billing stay in the browser; the app cannot change them.",
    validity: "The connection is valid for one year. You can revoke it any time in the app (Sign out) or under Account › Desktop and agent access.",
    unexpected: "Only allow this if you just chose “Sign in” in the BloomMD app yourself.",
    notYou: "Not you?",
    switchAccount: "Sign in with another account",
    invalidTitle: "This sign-in link is invalid",
    invalidBody: "Start the sign-in again in the BloomMD app.",
    unavailable: "App sign-in is not available on this BloomMD instance (no database configured).",
  },
} as const;

export default async function MobileAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ challenge?: string; state?: string; device?: string; lang?: string }>;
}) {
  const params = await searchParams;
  const locale = getAuthLocale(params.lang);
  const text = copy[locale];
  const challenge = params.challenge;
  const state = params.state;
  const device = normalizeDeviceName(params.device);
  const valid = isValidChallenge(challenge) && isValidState(state) && Boolean(device);
  const self = appendAuthParams("/auth/mobile", { challenge, state, device: params.device, lang: locale });

  const session = await getSession();
  const userId = normalizeUuid(session?.userId);
  if (valid && (!session || !userId)) {
    redirect(appendAuthParams("/login", { next: self, lang: locale }));
  }
  const workspaces = valid && userId && isDatabaseConfigured() ? await listWorkspacesForUser(userId) : [];
  const languageHref = appendAuthParams("/auth/mobile", { challenge, state, device: params.device, lang: otherAuthLocale(locale) });

  return (
    <main className="min-h-screen bg-[#FAFAF7] px-4 py-6 text-[#1A1A1A] sm:px-8 sm:py-10">
      <div className="mx-auto flex max-w-2xl items-center justify-between">
        <span className="text-lg font-semibold tracking-tight">BloomMD</span>
        <Link href={languageHref} className="rounded-md border border-[#D4CFC8] bg-white px-3 py-2 text-sm font-semibold text-[#5F574F] hover:bg-[#F2F0ED]">
          {languageLabel(otherAuthLocale(locale))}
        </Link>
      </div>
      <section className="mx-auto mt-8 max-w-2xl rounded-2xl border border-[#E8E4DF] bg-white p-6 shadow-sm sm:mt-14 sm:p-8" data-testid="mobile-consent">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#B64A1F]">{text.eyebrow}</p>
        {!valid || !session || !userId ? (
          <>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{text.invalidTitle}</h1>
            <p className="mt-4 text-base leading-7 text-[#5F574F]">{text.invalidBody}</p>
          </>
        ) : !isDatabaseConfigured() ? (
          <p className="mt-4 text-base leading-7 text-[#5F574F]" role="alert">{text.unavailable}</p>
        ) : (
          <>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{text.title(device!)}</h1>
            <p className="mt-4 text-base leading-7 text-[#5F574F]">{text.intro}</p>
            <dl className="mt-6 grid gap-4 rounded-xl border border-[#E8E4DF] bg-[#FCFBFA] p-4 text-sm leading-6">
              <div>
                <dt className="font-semibold">{text.account}</dt>
                <dd className="text-[#5F574F]" data-testid="mobile-consent-email">{session.email}</dd>
              </div>
              <div>
                <dt className="font-semibold">{text.workspaces}</dt>
                <dd className="text-[#5F574F]">
                  {workspaces.length === 0 ? text.noWorkspaces : (
                    <ul className="mt-1 grid gap-1">
                      {workspaces.slice(0, 5).map((workspace) => (
                        <li key={workspace.id}>{workspace.name} <span className="text-xs text-[#8A8178]">· {roleLabel(workspace.role, locale)}</span></li>
                      ))}
                      {workspaces.length > 5 && <li>{text.more(workspaces.length - 5)}</li>}
                    </ul>
                  )}
                </dd>
              </div>
            </dl>
            <ul className="mt-5 grid list-disc gap-2 pl-5 text-sm leading-6 text-[#5F574F]">
              <li>{text.notAllowed}</li>
              <li>{text.validity}</li>
              <li className="font-medium text-[#1A1A1A]">{text.unexpected}</li>
            </ul>
            <MobileConsentActions
              challenge={challenge!}
              state={state!}
              device={device!}
              denyUrl={mobileRedirectUrl({ error: "access_denied", state: state! })}
              locale={locale}
            />
            <form action="/api/auth/logout" method="post" className="mt-6 border-t border-[#E8E4DF] pt-4 text-sm text-[#5F574F]">
              <input type="hidden" name="next" value={appendAuthParams("/login", { next: self, lang: locale })} />
              {text.notYou}{" "}
              <button type="submit" className="font-semibold text-[#B64A1F] hover:text-[#FF6B35]">{text.switchAccount}</button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
