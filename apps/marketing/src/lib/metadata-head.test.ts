import { expect, test } from "bun:test";
import nextConfig from "../../next.config.mjs";

// Without this, Next streams metadata into <body> for browsers, Googlebot and AI crawlers.
test.each([
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
])("metadata renders blocking in <head> for %s", (agent) => {
  const bots = (nextConfig as { htmlLimitedBots?: RegExp }).htmlLimitedBots;
  expect(bots).toBeInstanceOf(RegExp);
  expect(bots!.test(agent)).toBe(true);
});
