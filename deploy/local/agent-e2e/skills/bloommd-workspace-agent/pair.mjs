import { mkdir, writeFile } from "node:fs/promises";

const appUrl = process.env.BLOOMMD_APP_URL;
const pairingCode = process.env.BLOOMMD_PAIRING_CODE;
const agentName = process.env.BLOOMMD_E2E_AGENT;
if (!appUrl || !pairingCode || !agentName) throw new Error("BloomMD E2E pairing environment is incomplete.");

const response = await fetch(`${appUrl}/api/agent/v1/pair`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ pairingCode }),
});
if (response.status !== 201) throw new Error(`BloomMD agent pairing failed with ${response.status}.`);
const result = await response.json();
if (!result.token) throw new Error("BloomMD pairing response did not contain an agent token.");
await mkdir(`${process.env.HOME}/.openclaw`, { recursive: true, mode: 0o700 });
await writeFile(`${process.env.HOME}/.openclaw/bloommd-agent-token`, result.token, { encoding: "utf8", mode: 0o600 });
await writeFile(`/e2e/${agentName}.paired`, "paired", { encoding: "utf8", mode: 0o600 });
