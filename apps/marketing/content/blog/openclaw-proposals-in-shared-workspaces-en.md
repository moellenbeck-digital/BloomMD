---
title: "OpenClaw in a shared workspace: review proposals where the decision happens"
description: "Local agents extend Shared Mode with node-scoped requests, visible status, and human approval instead of direct writes."
date: 2026-09-22
tags:
  - OpenClaw
  - AI agents
  - Shared Mode
  - Collaboration
  - Markdown
draft: false
---

# OpenClaw in a shared workspace: review proposals where the decision happens

A shared Markdown workspace is a good place to collaborate — but not for an agent that can change
everything unnoticed. When an agent researches or expands a branch, the request needs a clear scope
and its result needs a clear decision.

BloomMD combines both with local OpenClaw agents: the request belongs to a selected node, the agent
runs locally, and its change returns only as a proposal. The human decision stays visible in the
workspace.

## The node is the context

Instead of opening a disconnected chat with no relation to the map, select the relevant node and
open the Agent tab in the right sidebar. Its title, content, and node path remain visible. That makes
a request concrete:

> “Extend this node with three verifiable questions and research reliable sources. Add the results
> as child nodes.”

The agent receives that request and the explicit node context — not the entire workspace or local
folder by default.

![Real BloomMD capture: an agent request is bound to a selected node and is composed in the sidebar.](/docs/openclaw-agent-composer.png)

*Real product capture from the agent E2E flow: the request and node context remain together in the
sidebar.*

## A local agent does not become a silent editor

After pairing, the agent has its own revocable identity. It picks up only work assigned to it. A
model turn starts only when a request actually exists — not while the map is merely open.

The flow remains understandable for everyone involved:

1. A member creates a request at a node.
2. The local agent works only on that request.
3. BloomMD shows **waiting for agent**, **in progress**, **proposal ready**, or an error.
4. The team reviews the proposal in node context.
5. Only **Accept** writes the change to the shared document.

The agent can therefore propose child nodes, structural changes, or Markdown content without
determining the final state itself.

## Preview matches the kind of change

A list of Markdown lines does not help much when the question is “Which branches will my map gain?”
BloomMD therefore presents structural proposals as a tree. For text changes, Markdown remains the
appropriate review. This is not decoration: it answers what will happen before anyone accepts.

![Real BloomMD capture: the preview shows the source node and proposed child nodes as a tree.](/docs/openclaw-agent-proposal.png)

*Real product capture from the agent E2E flow: a structure can be reviewed as a tree before
approval.*

## Shared Mode and agents complement one another

Shared Mode determines which individual local file belongs to which workspace. Roles determine who
can read and write. OpenClaw adds a third boundary: an agent can prepare work, but cannot force a
decision.

This suits collaborative research, review lists, or an unfinished project structure. One person can
delegate a question; others see the proposal at the same node and can discuss it. If they decline,
the Markdown file remains unchanged.

## Start with a small request

The first request should be contained: an open question, an empty chapter, or a checklist. Describe
the desired result and explicitly say what must not change. That makes the proposal a useful basis
for discussion instead of a large, difficult-to-review rewrite.

> The [OpenClaw agent guide](/docs/openclaw-agent) covers setup, pairing, Docker/Kubernetes, and
> revocation. The [collaboration guide](/docs/collaboration) explains how to deliberately share the
> local source file.
