/**
 * `bloommd://` links into the app:
 *   bloommd://open?path=Schule/Physik.md&node=abc123   a note of the open folder, at a node
 *   bloommd://auth?code=…&state=…                      end of the account sign-in (see mobile-auth.ts)
 *   bloommd://selftest                                 simulator self-test (test builds only)
 */
export type AppLink =
  | { kind: "open"; path: string; node: string | null }
  | { kind: "auth"; url: string }
  | { kind: "selftest" };

const NODE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function parseAppLink(raw: string): AppLink | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "bloommd:") return null;
  // `bloommd://open?…` parses with host "open"; `bloommd:open?…` with pathname "open".
  const action = url.host || url.pathname.replace(/^\/+/, "");
  if (action === "selftest") return { kind: "selftest" };
  if (action === "auth") return { kind: "auth", url: raw };
  if (action !== "open") return null;
  const path = (url.searchParams.get("path") ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!path || path.split("/").some((part) => part === ".." || part === "") || !/\.(md|markdown)$/i.test(path)) return null;
  const node = url.searchParams.get("node");
  return { kind: "open", path, node: node && NODE_ID.test(node) ? node : null };
}
