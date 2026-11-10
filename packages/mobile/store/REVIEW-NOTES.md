# Review notes for Apple and Google (English)

Text for the "Notes" field of App Store Connect (App Review Information) and for "App access" in the
Play Console. Everything between the `paste:` markers is meant to be pasted as it is; the sections
around it are for the owner. Statements were checked against the code on 2026-11-04 (BloomMD 1.0.0,
`app.bloommd.mobile`). See `OWNER-CHECKLIST.md` (German) for the click-by-click order.

## For the owner (not for the reviewers)

- **No credentials in the repository, the PR or the chat.** This file holds only the placeholders
  `<DEMO-ACCOUNT-EMAIL>` and `<DEMO-ACCOUNT-PASSWORD>`. Create the demo account yourself and enter
  it in the review fields, not in this file:
  - App Store Connect → the app → *App Review Information* → *Sign-in required* → user name and
    password of the demo account; paste the text below into *Notes*.
  - Play Console → *App content* → *App access* → *All or some functionality is restricted* → add
    instructions with the demo account (short version below).
- The demo account must be **ready to use**: email address confirmed (a new account cannot sign in
  before that) and, if the closed-beta gate is on (`BLOOMMD_BETA_ACCESS=1`), on the allowlist. Give
  it a workspace with one or two harmless maps and nothing private.
- Optional: generate a demo vault and attach it to the App Store review (the field accepts files):
  `bun packages/mobile/store/screenshots/harness/demo-vault.ts <out-dir> en` writes an
  Obsidian-style folder (maps, a handwriting drawing, ordinary notes). The reviewers do not need it;
  *New* works without any file.
- Reviewers use the **public** server `https://bloommd.app`. It must be reachable and have the
  mobile sign-in (`/auth/mobile`, `/api/mobile/*`) deployed when the review starts.
- If the demo account is renamed, its password changed or the account deleted: update the review
  fields before the next submission.

## paste: App Store Connect "Notes" (English)

<!-- paste:start -->
BloomMD shows Markdown notes as a mind map. The app is fully usable WITHOUT an account: it works with local files (the app's own folder or a folder picked in the Files app). Signing in with a BloomMD account is optional and only needed for the optional cloud workspaces. There are no in-app purchases, no ads, no tracking and no analytics.

Test without an account
1. Open the app. The empty screen says "No mind map open". Tap "New", enter a title. A map with one node appears.
2. Switch the canvas mode to "Outline" and tap the row of the node. The node editor opens (side panel on iPad, bottom sheet on iPhone). Edit the title or text of the node there; changes are saved to the file (the save button shows a check mark).
3. Handwriting: in the node editor choose "Handwriting" > "New drawing". With Apple Pencil, draw directly. Without a pencil, tap the hand icon ("Draw with finger") first, then draw with a finger. Tools: pen, highlighter, eraser, lasso, text. Tap the check mark to finish: the drawing is saved as an SVG file and embedded in the node.
4. Open the side menu (top left). "Import" takes a .md or .opml file, "Open folder" opens any folder from the Files app (edited in place, no import; subfolders are levels to walk through, with the path shown and a way back up), "This device" returns to the app's own folder. The share icon (top right) exports the map as Markdown, OPML, PDF, PNG or SVG.
5. Link into the app: bloommd://open?path=<note path>&node=<node id> opens a note of the opened folder at a node. A Markdown file in the Files app can also be opened with BloomMD (Share or Open in…); it is edited where it lies, without a copy.

Optional cloud sign-in (browser, authorization code with PKCE)
1. Side menu > "Sign in". The sign-in page opens in an in-app browser; the password is typed only there, never in the app.
2. Sign in with the demo account:
   e-mail: <DEMO-ACCOUNT-EMAIL>
   password: <DEMO-ACCOUNT-PASSWORD>
3. Confirm "Connect the BloomMD app on ...?". The app returns, shows "Signed in as ...". Tap "Connect" to open the cloud maps; edits sync live. "Work locally" returns to local files.
4. "Sign out" revokes the access on the server and deletes the token on the device (it is kept in the iOS keychain).
5. Account deletion (Guideline 5.1.1(v)): when signed in, "Manage or delete account" opens the account page of the server; "Delete account permanently" is there. Accounts can also be created on the sign-in page; creating one requires confirming the e-mail address, so please use the demo account.

Data: nothing leaves the device without the optional sign-in. After sign-in the app sends the e-mail address and the maps opened in a cloud workspace to the BloomMD server (see the privacy manifest and the App Privacy answers). Encryption: only HTTPS/TLS and the system keychain (ITSAppUsesNonExemptEncryption = NO). The app asks for no system permissions. Runs on iPad, iPhone and Apple silicon Macs. Support: https://bloommd.io/docs/ipad
<!-- paste:end -->

## paste: Google Play "App access" (short version)

<!-- paste-short:start -->
All core features work without an account (open a folder with "Open folder", or "New"). The optional cloud sign-in is: side menu > Sign in (browser). Demo account: <DEMO-ACCOUNT-EMAIL> / <DEMO-ACCOUNT-PASSWORD>. Confirm "Connect the BloomMD app", then tap "Connect". "Sign out" revokes the token. Account deletion: "Manage or delete account" when signed in.
<!-- paste-short:end -->

## Background for reviewers' questions

- **Account:** none required. The cloud sign-in is an optional feature (beta). Accounts are created
  and deleted on the BloomMD website, reached from the app's in-app browser (Safari View Controller
  on iOS, Custom Tabs on Android).
- **Sign-in:** authorization code with PKCE (`src/mobile-auth.ts`). The browser returns
  `bloommd://auth?code=…&state=…`; the app checks the state, exchanges the code for an access token
  and stores it in the iOS keychain / Android Keystore (never in WebView storage). The token is
  valid for one year, can be revoked in the app (*Sign out*) or in the account on the website.
- **Custom server:** under *Advanced: custom server* an `https://` address of a self-hosted BloomMD
  server can be entered; the default is `https://bloommd.app`. The in-app browser opens only that
  server's `/auth/mobile` and `/account` pages, there is no address bar.
- **Files:** iOS uses a security-scoped bookmark of the folder picked in the Files app; Android uses
  the Storage Access Framework (folder grant). On iOS a single Markdown file handed over by the
  Files app ("Open in BloomMD", document type Markdown, opened in place) is read and replaced in place
  through the security scope of its URL, never copied. The app writes only what the user changes: opening a
  note never rewrites it, and a note changed on another device is not overwritten but kept as
  "… (iPad-Konflikt).md" / "… (Android-Konflikt).md".
- **Handwriting:** a pen (Apple Pencil, S Pen, USI) draws with pressure; fingers pan and zoom, a
  resting palm does not draw; the hand icon lets a finger draw while no pen has been detected.
  Drawings are SVG files next to the notes, so they are plain, portable files.
- **Data and permissions:** no camera, microphone, location, contacts or photo access; Android asks
  only for `INTERNET`. No third-party SDK except Capacitor and BloomMD's own plugins.
- **Not part of the app (do not look for it):** AI features, text recognition of handwriting,
  automatic detection of changes made by other apps, a dark appearance of the app. Share links and
  workspace agents exist in the web app only.
- **Behaviour that is known and not a defect:** the node editor shows `[[wiki links]]` as "target
  not found" (the link lookup needs the web API); an embedded drawing appears as `![[… ink.svg]]`
  text in the content field and in the presentation view. Both are known open points.
- **Links from the web:** `https://bloommd.io/open?path=…&node=…` opens the app (Universal Links /
  App Links) once the owner has activated the association files on the website; without them only
  `bloommd://` links work.
