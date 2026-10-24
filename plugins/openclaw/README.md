# BloomMD Workspace Agent for OpenClaw

This plugin runs a **local**, review-first BloomMD workspace agent inside an existing OpenClaw installation. It polls only for work that belongs to its paired identity. A model turn starts only after it has claimed one task. Results are submitted as proposals; BloomMD never lets this plugin modify a workspace directly.

When enabled, the plugin copies its versioned `bloommd-workspace-agent` skill into the configured OpenClaw workspace. The runner prompt and the skill therefore share the same authorization boundary; no additional BloomMD executable or manual skill copy is required.

## Install

For normal beta use, download the versioned `bloommd-openclaw-plugin-<version>.tgz` package from the [BloomMD download page](https://bloommd.io/download) and install it explicitly in the existing OpenClaw installation. The stable download stays on BloomMD and resolves only a published plugin release:

```text
https://bloommd.io/openclaw-plugin/latest.tgz
```

Then install the downloaded file in the existing OpenClaw installation:

```bash
openclaw plugins install ~/Downloads/bloommd-openclaw-plugin-<version>.tgz \
  --force
```

Restart the OpenClaw gateway after installation. The package contains both the runner and the versioned BloomMD skill; no separate CLI download or skill copy is needed.

## Development from a local checkout

```bash
cd plugins/openclaw
bun run validate
openclaw plugins install --link . --force
```

Restart the OpenClaw gateway after installation.

## Pair

1. In BloomMD, invite an OpenClaw agent in the workspace and copy the one-time pairing code into a file with mode `0600`.
2. Run:

```bash
openclaw bloommd pair \
  --server https://bloommd.app \
  --bloommd-profile research \
  --pairing-code-file ./bloommd-pairing-code
```

On macOS the token is held in Keychain; on Linux it is stored through the Secret Service. Containers can deliberately use `BLOOMMD_AGENT_SECRET_BACKEND=file` only with a private, persistent secret volume.

## Configure the runner

```json
{
  "plugins": {
    "entries": {
      "bloommd-workspace-agent": {
        "enabled": true,
        "config": {
          "enabled": true,
          "profile": "research",
          "openClawAgentId": "main",
          "pollIntervalSeconds": 60,
          "agentTimeoutSeconds": 600
        }
      }
    }
  }
}
```

The OpenClaw command remains available after installation, but the runner is disabled until this explicit `config.enabled` setting is committed. The plugin keeps an outgoing realtime connection to BloomMD and wakes immediately for its own queued tasks. `pollIntervalSeconds` is only a network fallback, not a BloomMD user-facing cron. The plugin is idle without a waiting task and therefore does not start model turns or consume model tokens.
