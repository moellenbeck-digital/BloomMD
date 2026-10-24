# BloomMD Agent Runtime

`@bloommd/agent-runtime` contains the local, review-first runtime used by the BloomMD OpenClaw
plugin. It owns pairing, OS secret storage, task claiming, the OpenClaw command cron, and the
proposal submission contract.

For normal users the runtime is bundled into the **BloomMD OpenClaw plugin**. Install the plugin
through the public BloomMD guide; do not download a second binary just to invite an agent.

The standalone `bloommd-agent` binary is for controlled automation, diagnostics, and integration
development:

```bash
bloommd-agent --help
bloommd-agent pair --server https://bloommd.app --profile research --pairing-code-file ./pairing-code
bloommd-agent status --profile research
bloommd-agent cron install --profile research --interval-seconds 60
```

Pairing codes and tokens are never accepted as command-line values. The runtime reads the one-time
code from a private file and stores the issued token in macOS Keychain or the Linux Secret Service.
It starts an OpenClaw model turn only after it has claimed an explicitly assigned task.

## Distribution

Release builds provide native Bun single binaries for macOS ARM64, Linux x86_64 and Linux ARM64.
The runtime also exposes a library API for the OpenClaw plugin; it does not import the Wiki CLI.
