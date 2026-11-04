---
title: Web app
description: Local folders in the browser, without uploading them.
order: 3
---

# Web app

The Web app at `/app` has two deliberately different modes.

## Local folder and cloud at a glance

- **Local folder in the browser:** The files live in your folder on your computer. Nothing is uploaded
  and there is no collaboration. The Web app at `/app` requires sign-in; only the
  [browser demo](/demo?lang=en) works without an account.
- **Cloud workspace:** The files live in the server's database. You need an account, files are
  imported, and collaboration runs through the sync server.

The full comparison is in [Local or cloud](/docs/lokal-oder-cloud?lang=en).

![Real screenshot of the Web app: the file Kapitel 1 from a local folder as a map with three child nodes](/docs/web-app-map-en.png)

## Local folder in the browser

Use the File System Access API to open a real folder. Files stay on your computer — **nothing is
uploaded**, including attachments and PDFs. A preview is built from the local handle rather than
from a server.

The permission state is visible. A read-only folder shows a **Read only** notice and a button to
request write access. The request only happens after a click because browsers reject permission
requests without a user gesture.

The API is available in Chrome and Edge. Firefox and Safari do not support it.

![Real screenshot of the Web app: a local folder is open, the Read only notice sits next to the folder name](/docs/web-open-folder-en.png)

### Opening a folder, step by step

1. In `/app`, choose the folder icon (tooltip **Open local Markdown folder**) at the top.
2. Grant access to the folder in the browser dialog.
3. If **Read only** appears next to the folder name, the folder is only shared for reading. Click the
   notice to request write access; the browser then asks you.
4. Open a file from the selector next to the folder name.

### New file from a template

With write access, **+ File** creates a new mind map in the folder. In the dialog you choose the folder,
the **Template**, and a name. Built-in templates are Lecture, Cornell, Literature note, Exam prep, and
Project; **Blank** only creates the heading. Your own templates are Markdown files in the `Vorlagen`
folder of your workspace.

![Real screenshot of the Web app: the new-file dialog with folder, the Lecture template, and a name](/docs/templates-en.png)

### Browser demo

The [browser demo](/demo?lang=en) needs no account. It loads a built-in template; your Markdown stays
in the browser unless you download it. Paste your own Markdown on the left or choose a local file.

![Real screenshot of the browser demo: a Markdown input on the left, the map of the Software Architecture Map template on the right](/docs/demo-en.png)

## Cloud workspace

Cloud workspaces require an account. Documents are stored in the database and collaboration uses the
sync server. Registration (open, no invitation needed) is described in [Closed beta access](/docs/closed-beta-zugang?lang=en).

When a sync server is connected, the header shows the sync status next to the file title, for example
**Synced**. It only appears in wide windows (1536 pixels and up).

![Real screenshot of the Web app header: the sync status Synced next to the file title Graphentheorie](/docs/sync-status-en.png)

To import a Markdown file, sign in, select the cloud workspace, choose **Import Markdown** from the
toolbar or command palette, select a `.md` or `.markdown` file, and open it from the file list.
From that point the file is stored in the cloud workspace and can use sync and collaboration.

Do not upload credentials, secrets, third-party personal data, or production-critical content during
the beta. A reduced Markdown example is enough for an error report.

## Feedback and views

Signed-in beta testers use the Feedback button. A screenshot is required; a short video is optional.
Do not upload private Markdown, credentials, or third-party personal data. The Document view shows
the opened file; the Workspace view shows folders, files, and references.
