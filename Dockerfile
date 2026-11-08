# syntax=docker/dockerfile:1

# Dependencies only: no build metadata (SHA, time) and no sources, so this stage and its install
# layer keep the same cache key and digest across commits until bun.lock or a package.json changes.
FROM oven/bun:1.4.4-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY patches patches
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

FROM deps AS workspace
COPY . .

# Build metadata is declared here, after the install, so a new SHA only invalidates the build layers.
FROM workspace AS app-build
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
RUN bun run --cwd apps/app build

FROM app-build AS app
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "run", "--cwd", "apps/app", "start"]

FROM workspace AS marketing-build
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
# NEXT_PUBLIC_* values are inlined at build time; the cluster ConfigMap cannot change them later. The
# defaults make every image from this Dockerfile send Plausible events without extra build args
# (first-party: /_plausible/... on our own origin, proxied to the Ops instance).
ARG NEXT_PUBLIC_PLAUSIBLE_DOMAIN=bloommd.io
ARG NEXT_PUBLIC_PLAUSIBLE_SRC=/_plausible/js/script.js
ARG NEXT_PUBLIC_PLAUSIBLE_API_HOST=/_plausible
ENV NEXT_PUBLIC_PLAUSIBLE_DOMAIN=$NEXT_PUBLIC_PLAUSIBLE_DOMAIN
ENV NEXT_PUBLIC_PLAUSIBLE_SRC=$NEXT_PUBLIC_PLAUSIBLE_SRC
ENV NEXT_PUBLIC_PLAUSIBLE_API_HOST=$NEXT_PUBLIC_PLAUSIBLE_API_HOST
# The check always runs: an empty or wrong value fails the build instead of shipping without tracking.
RUN bun run --cwd apps/marketing build \
  && bun run --cwd apps/marketing verify:plausible-build

FROM marketing-build AS marketing
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "run", "--cwd", "apps/marketing", "start"]

# Builds on deps so the dependency layers are shared with app and marketing; only the sources of
# the sync server and what it imports (@bloommd/core) are added. The tsconfigs extend the base one.
FROM deps AS sync
COPY tsconfig.base.json ./
COPY packages/core packages/core
COPY packages/sync packages/sync
ENV NODE_ENV=production
ENV SYNC_PORT=4100
EXPOSE 4100
CMD ["bun", "run", "--cwd", "packages/sync", "start"]
