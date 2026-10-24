import Link from "next/link";
import { getSession } from "../../../lib/auth";
import { authCopy, getAuthLocale, languageLabel, otherAuthLocale } from "../../../lib/auth-copy";
import { getWorkspaceInvitationPreview } from "../../../lib/db";
import { appendAuthParams, createWorkspaceInviteHandoff } from "../../../lib/invite-intent";
import { WorkspaceInviteCard } from "../WorkspaceInviteCard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WorkspaceInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);
  const locale = getAuthLocale(query.lang);
  const copy = authCopy[locale];
  const preview = await getWorkspaceInvitationPreview(decodeURIComponent(token));
  const handoff = preview?.status === "pending" ? createWorkspaceInviteHandoff({ invitationId: preview.id, expiresAt: preview.expiresAt }) : null;
  const session = await getSession();
  const languageHref = appendAuthParams(`/invite/${encodeURIComponent(token)}`, { lang: otherAuthLocale(locale) });

  return (
    <main className="min-h-screen bg-[#FAFAF7] px-4 py-6 text-[#1A1A1A] sm:px-8 sm:py-10">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <Link href={appendAuthParams("/", { lang: locale })} className="text-lg font-semibold tracking-tight">BloomMD</Link>
        <Link href={languageHref} className="rounded-md border border-[#D4CFC8] bg-white px-3 py-2 text-sm font-semibold text-[#5F574F] hover:bg-[#F2F0ED]" aria-label={`${copy.language}: ${languageLabel(otherAuthLocale(locale))}`}>
          {languageLabel(otherAuthLocale(locale))}
        </Link>
      </div>
      <div className="mx-auto mt-8 flex max-w-5xl justify-center sm:mt-14">
        {preview ? (
          <WorkspaceInviteCard invitation={preview} handoff={handoff} locale={locale} session={session} />
        ) : (
          <section className="w-full max-w-2xl rounded-2xl border border-[#E8E4DF] bg-white p-6 shadow-sm sm:p-10" data-testid="workspace-invite-invalid">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#B64A1F]">{copy.invitation}</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">{copy.invitationInvalid}</h1>
            <p className="mt-4 text-base leading-7 text-[#5F574F]">{copy.contactInviter}.</p>
          <Link href={appendAuthParams("/login", { lang: locale })} className="mt-7 inline-flex min-h-11 items-center justify-center rounded-md bg-[#C94317] px-4 py-2 text-sm font-semibold text-white hover:bg-[#A93612]">{copy.backToSignIn}</Link>
          </section>
        )}
      </div>
    </main>
  );
}
