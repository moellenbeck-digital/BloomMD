#!/usr/bin/env bun
import { AGENT_USAGE, AgentUsageError, runAgentCommand } from "./index";

const VERSION = "0.4.4";

async function main(argv: string[]): Promise<number> {
  if (argv.includes("--version")) {
    console.log(VERSION);
    return 0;
  }
  return runAgentCommand(argv);
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    if (error instanceof AgentUsageError) console.error(`\n${AGENT_USAGE}`);
    process.exit(2);
  });
