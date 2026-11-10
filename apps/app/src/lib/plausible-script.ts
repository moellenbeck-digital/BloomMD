import { PLAUSIBLE_EVENT_ALLOWLIST, PLAUSIBLE_PATH_RULES } from "./plausible";

/**
 * The first-party tracker, served at /_plausible/js/script.js.
 *
 * Why our own script and not the one of the Plausible instance: its classic script sends the full
 * page URL (query and hash included) on every load and navigation, and the app has secrets in URLs
 * (share and invite tokens). The ticket requires route patterns only, so the browser must send the
 * clean URL itself. This script is about 1 KB, runs no third-party code, and speaks the documented
 * Events API (`n`, `u`, `d`). The proxy still scrubs every event again on the server.
 *
 * Reads `data-domain` and `data-api` from its own tag. It does nothing unless the page is served over
 * http(s) from exactly that domain (so not in the desktop app on `views://mainview`, and not on the
 * test system), and not when the browser sends Do Not Track.
 *
 * It is plain ES5 text and must stay self-contained: it is not bundled.
 */
export function plausibleTrackerSource(): string {
  const rules = JSON.stringify(PLAUSIBLE_PATH_RULES);
  const allowed = JSON.stringify(PLAUSIBLE_EVENT_ALLOWLIST);
  return `(function () {
  var tag = document.currentScript;
  if (!tag) return;
  var domain = tag.getAttribute("data-domain");
  var api = tag.getAttribute("data-api");
  var loc = window.location;
  if (!domain || !api) return;
  if (loc.protocol !== "http:" && loc.protocol !== "https:") return;
  if (loc.hostname.toLowerCase() !== domain) return;
  if (navigator.doNotTrack === "1" || window.doNotTrack === "1") return;
  var rules = ${rules};
  var allowed = ${allowed};
  function normalize(pathname) {
    var path = String(pathname).toLowerCase();
    if (path.length > 1 && path.charAt(path.length - 1) === "/") path = path.slice(0, -1);
    if (rules.statics.indexOf(path) >= 0) return path;
    for (var i = 0; i < rules.dynamics.length; i++) {
      var rule = rules.dynamics[i];
      if (path.indexOf(rule.prefix) === 0 && path.length > rule.prefix.length && path.slice(rule.prefix.length).indexOf("/") < 0) return rule.pattern;
    }
    return rules.fallback;
  }
  function send(name) {
    if (allowed.indexOf(name) < 0) return;
    var body = JSON.stringify({ n: name, u: "https://" + domain + normalize(loc.pathname), d: domain });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(api, body)) return;
      fetch(api, { method: "POST", body: body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(function () {});
    } catch (e) {}
  }
  var last = null;
  function page() {
    var current = normalize(loc.pathname);
    if (current === last) return;
    last = current;
    send("pageview");
  }
  function wrap(method) {
    var original = history[method];
    history[method] = function () {
      var result = original.apply(this, arguments);
      page();
      return result;
    };
  }
  wrap("pushState");
  wrap("replaceState");
  window.addEventListener("popstate", page);
  window.plausible = function (name) { send(name); };
  if (document.visibilityState === "prerender") {
    document.addEventListener("visibilitychange", page, { once: true });
  } else {
    page();
  }
})();
`;
}
