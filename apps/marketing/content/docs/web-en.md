---
title: Web app
description: Local folders in the browser, without uploading them.
order: 3
---

# Web app

The Web app at `/app` has two deliberately different modes.

## Local folder in the browser

Use the File System Access API to open a real folder. Files stay on your computer — **nothing is
uploaded**, including attachments and PDFs. A preview is built from the local handle rather than
from a server.

The permission state is visible. A read-only folder shows a **Read only** notice and a button to
request write access. The request only happens after a click because browsers reject permission
requests without a user gesture.

The API is available in Chrome and Edge. Firefox and Safari do not support it.

## Cloud workspace

Cloud workspaces require an account. Documents are stored in the database and collaboration uses the
sync server. The closed-beta process is described in [Closed beta access](/docs/closed-beta-zugang?lang=en).

To import a Markdown file, sign in, select the cloud workspace, choose **Import Markdown** from the
toolbar or command palette, select a `.md` or `.markdown` file, and open it from the file list.
From that point the file is stored in the cloud workspace and can use sync and collaboration.

Do not upload credentials, secrets, third-party personal data, or production-critical content during
the beta. A reduced Markdown example is enough for an error report.

## Feedback and views

Signed-in beta testers use the Feedback button. A screenshot is required; a short video is optional.
Do not upload private Markdown, credentials, or third-party personal data. The Document view shows
the opened file; the Workspace view shows folders, files, and references.
