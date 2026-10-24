import { migrateMarketSchema } from "../src/lib/db";

await migrateMarketSchema();
console.log("BloomMD database schema is up to date.");
