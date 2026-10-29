import { assertProductionConfig, productionConfigWarnings } from "../src/lib/production-config";

assertProductionConfig(process.env);
for (const warning of productionConfigWarnings(process.env)) console.warn(`WARNING: ${warning}`);
console.log("BloomMD production environment passes the static release configuration gate.");
