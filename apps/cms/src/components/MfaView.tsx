import { MinimalTemplate } from "@payloadcms/next/templates";
import { redirect } from "next/navigation";
import type { AdminViewServerProps } from "payload";
import { signedInOperator } from "../access";
import { mfaVerified } from "../lib/mfa-session";
import { MfaForm } from "./MfaForm";

/**
 * Admin view `/admin/mfa` (ticket #206): the step after the password. With a factor: ask for the code; without:
 * the setup (QR code, first code, recovery codes). Payload lets custom views pass without admin access, so this is
 * the only page of an operator whose second factor is still missing. `proxy.ts` sends every other admin page here.
 */
export async function MfaView({ initPageResult }: AdminViewServerProps) {
  const { req } = initPageResult;
  const adminRoute = req.payload.config.routes.admin;
  const operator = signedInOperator(req);
  if (!operator || operator.blocked) redirect(`${adminRoute}/login`);
  if (mfaVerified(req.headers, operator.id, req.payload.config.cookiePrefix)) redirect(adminRoute);
  const row = (await req.payload.findByID({ collection: "operators", id: operator.id, depth: 0, overrideAccess: true })) as { totpEnabledAt?: string | null };
  return (
    <MinimalTemplate className="mfa">
      <MfaForm enrolled={Boolean(row.totpEnabledAt)} email={operator.email ?? ""} adminRoute={adminRoute} />
    </MinimalTemplate>
  );
}
