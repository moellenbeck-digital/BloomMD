/**
 * Operator accounts from the command line (ticket #206). Needs the environment of the CMS (`CMS_DATABASE_URL`, `PAYLOAD_SECRET`).
 *
 *   CMS_OPERATOR_PASSWORD=... bun run operator create <email> <admin|support|editor>
 *   bun run operator reset-mfa <email>      the way back for the last admin who lost the second factor
 *   bun run operator purge-audit            deletes audit entries older than 365 days (also done with every audit write)
 *
 * The password comes from the environment, never from the command line. The sign-up route of Payload (`first-register`)
 * is closed by the guard, so `create` is the only way to the first operator; the new operator sets the second factor up at
 * the first sign-in. Every action is audited with the actor `cli`.
 */
import config from "@payload-config";
import { createLocalReq, getPayload } from "payload";
import { purgeExpiredAudit } from "../src/lib/audit";
import { clearFactor } from "../src/lib/operator-mfa";
import { poolOf } from "../src/lib/shared-store";

const [command, email, role] = process.argv.slice(2);
const password = process.env.CMS_OPERATOR_PASSWORD;
const USAGE = "Usage: CMS_OPERATOR_PASSWORD=... operator create <email> <admin|support|editor> | operator reset-mfa <email> | operator purge-audit";

try {
  const payload = await getPayload({ config });
  const req = await createLocalReq({ context: { auditActor: "cli" } }, payload);
  if (command === "create") {
    if (!email || !role || !["admin", "support", "editor"].includes(role)) throw new Error(USAGE);
    if (!password) throw new Error("CMS_OPERATOR_PASSWORD is required");
    const created = await payload.create({ collection: "operators", data: { email: email.trim().toLowerCase(), password, role: role as "admin" | "support" | "editor" }, overrideAccess: true, req });
    console.log(`operator ${created.email} (${created.role}) created; the second factor is set up at the first sign-in`);
  } else if (command === "reset-mfa") {
    if (!email) throw new Error(USAGE);
    const found = await payload.find({ collection: "operators", where: { email: { equals: email.trim().toLowerCase() } }, limit: 1, depth: 0, overrideAccess: true });
    const operator = found.docs[0];
    if (!operator) throw new Error(`no operator ${email}`);
    await clearFactor(req, operator.id);
    console.log(`second factor of ${operator.email} reset; sessions ended; set up again at the next sign-in`);
  } else if (command === "purge-audit") {
    console.log(`${await purgeExpiredAudit(poolOf(payload))} audit entries deleted`);
  } else {
    throw new Error(USAGE);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
process.exit(process.exitCode ?? 0);
