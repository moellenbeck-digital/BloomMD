# Public, repository-independent BloomMD OpenClaw agent image.
# Pin BLOOMMD_PLUGIN_URL to a versioned bloommd.io URL for reproducible production builds.
ARG OPENCLAW_IMAGE=ghcr.io/openclaw/openclaw:2026.9.3-browser
FROM ${OPENCLAW_IMAGE}

USER root

ARG BLOOMMD_PLUGIN_URL=https://bloommd.io/openclaw-plugin/latest.tgz
ADD ${BLOOMMD_PLUGIN_URL} /tmp/bloommd-plugin.tgz

RUN mkdir -p /opt/bloommd-plugin \
  && tar -xzf /tmp/bloommd-plugin.tgz --strip-components=1 -C /opt/bloommd-plugin \
  && rm /tmp/bloommd-plugin.tgz \
  && chown -R node:node /opt/bloommd-plugin

COPY entrypoint.sh /opt/bloommd-plugin/entrypoint.sh
RUN chmod 0755 /opt/bloommd-plugin/entrypoint.sh

USER node
ENTRYPOINT ["/opt/bloommd-plugin/entrypoint.sh"]
CMD ["gateway", "--allow-unconfigured"]
