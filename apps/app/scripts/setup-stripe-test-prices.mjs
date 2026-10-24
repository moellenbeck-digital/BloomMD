import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");
const envPath = path.join(webRoot, ".env.local");

const plans = [
  {
    envKey: "STRIPE_PRICE_PRO_MONTHLY",
    lookupKey: "bloommd_pro_monthly_test",
    tier: "pro-monthly",
    name: "BloomMD Pro Monthly",
    amount: 900,
    recurring: { interval: "month" },
  },
  {
    envKey: "STRIPE_PRICE_PRO_ANNUAL",
    lookupKey: "bloommd_pro_annual_test",
    tier: "pro-annual",
    name: "BloomMD Pro Annual",
    amount: 7900,
    recurring: { interval: "year" },
  },
  {
    envKey: "STRIPE_PRICE_LIFETIME",
    lookupKey: "bloommd_lifetime_test",
    tier: "lifetime",
    name: "BloomMD Lifetime",
    amount: 14900,
  },
  {
    envKey: "STRIPE_PRICE_SYNC_MONTHLY",
    lookupKey: "bloommd_sync_monthly_test",
    tier: "sync-monthly",
    name: "BloomMD Sync Monthly",
    amount: 500,
    recurring: { interval: "month" },
  },
];

function parseEnv(content) {
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

async function stripeRequest(secretKey, method, endpoint, body) {
  const response = await fetch(`https://api.stripe.com${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message ?? `Stripe request failed with ${response.status}`;
    throw new Error(message);
  }
  return data;
}

async function findPrice(secretKey, lookupKey) {
  const params = new URLSearchParams();
  params.append("active", "true");
  params.append("lookup_keys[]", lookupKey);
  const data = await stripeRequest(secretKey, "GET", `/v1/prices?${params.toString()}`);
  return Array.isArray(data.data) ? data.data[0] : null;
}

async function createProduct(secretKey, plan) {
  const body = new URLSearchParams({
    name: plan.name,
    "metadata[tier]": plan.tier,
    "metadata[app]": "bloommd",
  });
  return stripeRequest(secretKey, "POST", "/v1/products", body);
}

async function createPrice(secretKey, productId, plan) {
  const body = new URLSearchParams({
    product: productId,
    currency: "eur",
    unit_amount: String(plan.amount),
    lookup_key: plan.lookupKey,
    "metadata[tier]": plan.tier,
    "metadata[app]": "bloommd",
  });

  if (plan.recurring) {
    body.append("recurring[interval]", plan.recurring.interval);
  }

  return stripeRequest(secretKey, "POST", "/v1/prices", body);
}

function setEnvValue(content, key, value) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  if (pattern.test(content)) return content.replace(pattern, line);
  return `${content.replace(/\s*$/, "")}\n${line}\n`;
}

const envContent = await readFile(envPath, "utf8");
const env = parseEnv(envContent);

if (!env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is missing in apps/app/.env.local");
}

const resolved = {};

for (const plan of plans) {
  let price = await findPrice(env.STRIPE_SECRET_KEY, plan.lookupKey);
  if (!price) {
    const product = await createProduct(env.STRIPE_SECRET_KEY, plan);
    price = await createPrice(env.STRIPE_SECRET_KEY, product.id, plan);
  }
  resolved[plan.envKey] = price.id;
}

let nextEnv = envContent;
for (const [key, value] of Object.entries(resolved)) {
  nextEnv = setEnvValue(nextEnv, key, value);
}

await writeFile(envPath, nextEnv);

for (const plan of plans) {
  console.log(`${plan.envKey}=${resolved[plan.envKey]}`);
}
