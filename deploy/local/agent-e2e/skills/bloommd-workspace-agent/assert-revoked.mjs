import { readFile, writeFile } from "node:fs/promises";

const appUrl = process.env.BLOOMMD_APP_URL;
if (!appUrl) throw new Error("BLOOMMD_APP_URL is required.");
const token = (await readFile(`${process.env.HOME}/.openclaw/bloommd-agent-token`, "utf8")).trim();
const response = await fetch(`${appUrl}/api/agent/v1/tasks/next`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
if (response.status !== 401) throw new Error(`A revoked BloomMD agent token must receive 401, received ${response.status}.`);
await writeFile(`/e2e/${process.env.BLOOMMD_E2E_AGENT}.revoked`, "revoked", { encoding: "utf8", mode: 0o600 });
