/**
 * Creates the first operators: `CMS_OPERATOR_PASSWORD=... bun run operator create <email> <admin|support|editor>`.
 * The password comes from the environment, never from the command line. The sign-up route of Payload
 * (`first-register`) is closed by the guard, so this is the only way to the first operator. The password
 * rule applies. The second factor and the operator UI are ticket #206.
 */
import config from "@payload-config";
import { getPayload } from "payload";

const [command, email, role] = process.argv.slice(2);
const password = process.env.CMS_OPERATOR_PASSWORD;

try {
  if (command !== "create" || !email || !role || !["admin", "support", "editor"].includes(role)) throw new Error("Usage: CMS_OPERATOR_PASSWORD=... operator create <email> <admin|support|editor>");
  if (!password) throw new Error("CMS_OPERATOR_PASSWORD is required");
  const payload = await getPayload({ config });
  const created = await payload.create({ collection: "operators", data: { email: email.trim().toLowerCase(), password, role: role as "admin" | "support" | "editor" }, overrideAccess: true });
  console.log(`operator ${created.email} (${created.role}) created`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
process.exit(process.exitCode ?? 0);
