# syntax=docker/dockerfile:1

FROM oven/bun:1.3.14 AS workspace
WORKDIR /app
ARG BLOOMMD_BUILD_SHA=unknown
ARG BLOOMMD_BUILD_TAG=
ARG BLOOMMD_BUILD_TIME=
ARG BLOOMMD_RELEASE_VERSION=
ENV BLOOMMD_BUILD_SHA=$BLOOMMD_BUILD_SHA
ENV BLOOMMD_BUILD_TAG=$BLOOMMD_BUILD_TAG
ENV BLOOMMD_BUILD_TIME=$BLOOMMD_BUILD_TIME
ENV BLOOMMD_RELEASE_VERSION=$BLOOMMD_RELEASE_VERSION
ENV NEXT_PUBLIC_BLOOMMD_GIT_SHA=$BLOOMMD_BUILD_SHA
ENV NEXT_PUBLIC_BLOOMMD_GIT_TAG=$BLOOMMD_BUILD_TAG
ENV NEXT_PUBLIC_BLOOMMD_BUILD_TIME=$BLOOMMD_BUILD_TIME
ENV NEXT_PUBLIC_BLOOMMD_VERSION=$BLOOMMD_RELEASE_VERSION
COPY package.json bun.lock ./
COPY packages/core/package.json packages/core/package.json
COPY packages/agent-runtime/package.json packages/agent-runtime/package.json
COPY packages/wiki-cli/package.json packages/wiki-cli/package.json
COPY packages/desktop/package.json packages/desktop/package.json
COPY packages/mobile/package.json packages/mobile/package.json
COPY packages/capacitor-folder/package.json packages/capacitor-folder/package.json
COPY packages/capacitor-keychain/package.json packages/capacitor-keychain/package.json
COPY packages/ink/package.json packages/ink/package.json
COPY packages/sync/package.json packages/sync/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY apps/app/package.json apps/app/package.json
COPY apps/marketing/package.json apps/marketing/package.json
COPY plugins/obsidian/package.json plugins/obsidian/package.json
COPY plugins/openclaw/package.json plugins/openclaw/package.json
RUN bun install --frozen-lockfile
COPY . .

FROM workspace AS app-build
RUN bun run --cwd apps/app build

FROM app-build AS app
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "run", "--cwd", "apps/app", "start"]

FROM workspace AS marketing-build
ARG NEXT_PUBLIC_PLAUSIBLE_DOMAIN=
ARG NEXT_PUBLIC_PLAUSIBLE_SRC=https://plausible.moellenbeck-digital.io/js/script.js
ARG NEXT_PUBLIC_PLAUSIBLE_API_HOST=https://plausible.moellenbeck-digital.io
ENV NEXT_PUBLIC_PLAUSIBLE_DOMAIN=$NEXT_PUBLIC_PLAUSIBLE_DOMAIN
ENV NEXT_PUBLIC_PLAUSIBLE_SRC=$NEXT_PUBLIC_PLAUSIBLE_SRC
ENV NEXT_PUBLIC_PLAUSIBLE_API_HOST=$NEXT_PUBLIC_PLAUSIBLE_API_HOST
RUN bun run --cwd apps/marketing build \
  && if [ -n "$NEXT_PUBLIC_PLAUSIBLE_DOMAIN" ]; then bun run --cwd apps/marketing verify:plausible-build; fi

FROM marketing-build AS marketing
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "run", "--cwd", "apps/marketing", "start"]

FROM oven/bun:1.3.14 AS sync
WORKDIR /app
COPY --from=workspace /app /app
ENV NODE_ENV=production
ENV SYNC_PORT=4100
EXPOSE 4100
CMD ["bun", "run", "--cwd", "packages/sync", "start"]
