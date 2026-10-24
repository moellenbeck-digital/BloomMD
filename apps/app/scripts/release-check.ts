import { assertProductionConfig } from "../src/lib/production-config";

assertProductionConfig(process.env);
console.log("BloomMD production environment passes the static release configuration gate.");
