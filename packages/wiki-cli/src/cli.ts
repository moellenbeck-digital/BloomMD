#!/usr/bin/env bun
import { WIKI_USAGE, WikiUsageError, runWikiCli } from "./index";

runWikiCli(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    if (error instanceof WikiUsageError) console.error(`\n${WIKI_USAGE}`);
    process.exit(2);
  });
