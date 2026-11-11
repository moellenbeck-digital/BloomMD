/**
 * Manages the read tokens of marketing (option T): `bun run read-token create <label> [days]`,
 * `list`, `revoke <id>`. The token is printed once; only its hash is stored (rotation: create the new
 * one, switch marketing, revoke the old one). Needs CMS_DATABASE_URL and PAYLOAD_SECRET.
 */
import config from "@payload-config";
import { getPayload } from "payload";
import { generateToken, hashToken } from "../src/lib/token";

const [command, ...args] = process.argv.slice(2);
const payload = await getPayload({ config });

try {
  if (command === "create") {
    const label = args[0]?.trim();
    if (!label) throw new Error("Usage: read-token create <label> [expires-in-days]");
    const days = args[1] ? Number(args[1]) : undefined;
    if (days !== undefined && (!Number.isFinite(days) || days <= 0)) throw new Error("expires-in-days must be a positive number");
    const token = generateToken();
    const created = await payload.create({
      collection: "read-tokens",
      data: { label, tokenHash: hashToken(token), expiresAt: days ? new Date(Date.now() + days * 86_400_000).toISOString() : undefined },
      overrideAccess: true,
    });
    console.log(`id: ${created.id}\nlabel: ${label}\ntoken (shown once, store it in 1Password): ${token}`);
  } else if (command === "list") {
    const tokens = await payload.find({ collection: "read-tokens", limit: 100, pagination: false, overrideAccess: true });
    for (const token of tokens.docs) console.log(`${token.id}\t${token.label}\tuses=${token.uses ?? 0}\tlast=${token.lastUsedAt ?? "-"}\texpires=${token.expiresAt ?? "-"}`);
  } else if (command === "revoke") {
    const id = Number(args[0]);
    if (!Number.isInteger(id)) throw new Error("Usage: read-token revoke <id>");
    await payload.delete({ collection: "read-tokens", id, overrideAccess: true });
    console.log(`revoked ${id}`);
  } else {
    throw new Error("Usage: read-token create <label> [expires-in-days] | list | revoke <id>");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
process.exit(process.exitCode ?? 0);
