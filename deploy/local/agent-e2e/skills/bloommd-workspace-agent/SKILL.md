---
name: bloommd-workspace-agent
description: Pair this local OpenClaw runtime with one BloomMD workspace agent, poll exactly one assigned task and return a reviewable proposal.
---

Use the supplied scripts only. They call BloomMD's local agent API and never receive a workspace-wide document listing. The task response is the only document context this skill may use.

- Pair: `node /workspace/skills/bloommd-workspace-agent/pair.mjs`
- Process one task: `node /workspace/skills/bloommd-workspace-agent/process-task.mjs`
- Verify revocation: `node /workspace/skills/bloommd-workspace-agent/assert-revoked.mjs`
