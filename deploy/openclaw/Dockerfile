# The plugin is built separately so the runtime stays the official OpenClaw image.
FROM oven/bun:1.3.14-alpine AS plugin-build
WORKDIR /workspace
COPY package.json bun.lock ./
COPY apps/app/package.json apps/app/package.json
COPY apps/marketing/package.json apps/marketing/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/agent-runtime/package.json packages/agent-runtime/package.json
COPY packages/desktop/package.json packages/desktop/package.json
COPY packages/mobile/package.json packages/mobile/package.json
COPY packages/capacitor-folder/package.json packages/capacitor-folder/package.json
COPY packages/capacitor-keychain/package.json packages/capacitor-keychain/package.json
COPY packages/ink/package.json packages/ink/package.json
COPY packages/sync/package.json packages/sync/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/wiki-cli/package.json packages/wiki-cli/package.json
COPY plugins/obsidian/package.json plugins/obsidian/package.json
COPY packages/agent-runtime/src/index.ts packages/agent-runtime/src/index.ts
COPY plugins/openclaw ./plugins/openclaw
RUN bun install --frozen-lockfile
RUN bun build ./plugins/openclaw/src/index.ts --target node --outdir /plugin/dist --external openclaw/*

FROM ghcr.io/openclaw/openclaw:2026.9.3-browser
USER root
COPY --from=plugin-build /plugin/dist/index.js /opt/bloommd-plugin/dist/index.js
COPY plugins/openclaw/openclaw.plugin.json plugins/openclaw/package.json plugins/openclaw/README.md /opt/bloommd-plugin/
COPY plugins/openclaw/LICENSE plugins/openclaw/LICENSE-MIT-legacy /opt/bloommd-plugin/
COPY plugins/openclaw/skills /opt/bloommd-plugin/skills
COPY plugins/openclaw/scripts /opt/bloommd-plugin/scripts
COPY deploy/openclaw/entrypoint.sh /opt/bloommd-plugin/entrypoint.sh
RUN chmod 0755 /opt/bloommd-plugin/entrypoint.sh /opt/bloommd-plugin/scripts/install-plugin.sh && chown -R node:node /opt/bloommd-plugin
USER node
ENTRYPOINT ["/opt/bloommd-plugin/entrypoint.sh"]
CMD ["gateway"]
