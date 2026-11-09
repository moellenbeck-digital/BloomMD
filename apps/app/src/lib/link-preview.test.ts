import { afterEach, describe, expect, test } from "bun:test";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { gzipSync } from "node:zlib";
import {
  assertPublicHttpUrl,
  fetchLinkPreview,
  isBlockedAddress,
  normalizeHostname,
  parseLinkPreviewHtml,
  requestPinned,
  resolvePublicHttpUrl,
  setLinkPreviewTransportForTests,
  type LinkPreviewResponse,
  type PinnedTarget,
  type ResolvedAddress,
} from "./link-preview";

const PUBLIC_V4: ResolvedAddress = { address: "93.184.216.34", family: 4 };
const PUBLIC_V6: ResolvedAddress = { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 };
const PRIVATE_V4: ResolvedAddress = { address: "10.0.0.5", family: 4 };
const HTML = "<html><head><title>Example</title></head></html>";

function htmlResponse(body = HTML): LinkPreviewResponse {
  return { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, read: async () => new TextEncoder().encode(body), close: () => {} };
}

function redirect(location: string, status = 302): LinkPreviewResponse {
  return { status, headers: { location }, read: async () => new Uint8Array(), close: () => {} };
}

afterEach(() => setLinkPreviewTransportForTests(null));

describe("link previews", () => {
  test("extracts Open Graph metadata and resolves relative images", () => {
    const result = parseLinkPreviewHtml(
      "<html><head><title>Fallback</title><meta property=\"og:title\" content=\"BloomMD\"><meta property=\"og:description\" content=\"Visual maps\"><meta property=\"og:image\" content=\"/social.png\"></head></html>",
      new URL("https://example.com/docs/page"),
    );
    expect(result).toEqual({
      title: "BloomMD",
      description: "Visual maps",
      image: "https://example.com/social.png",
    });
  });

  test("rejects local and non-web preview targets", async () => {
    await expect(assertPublicHttpUrl("javascript:alert(1)")).rejects.toThrow();
    await expect(assertPublicHttpUrl("http://127.0.0.1:3000/demo")).rejects.toThrow("Private network");
    await expect(assertPublicHttpUrl("http://localhost:3000/demo")).rejects.toThrow("not allowed");
  });
});

describe("address blocklists", () => {
  const blockedV4 = [
    "0.0.0.0", "0.1.2.3", "10.0.0.1", "100.64.0.1", "100.127.255.255", "127.0.0.1", "127.255.255.254", "169.254.169.254", "172.16.0.1", "172.31.255.255",
    "192.0.0.1", "192.0.2.10", "192.88.99.1", "192.168.1.1", "198.18.0.1", "198.19.255.255", "198.51.100.7", "203.0.113.9", "224.0.0.1", "239.255.255.250",
    "240.0.0.1", "255.255.255.255",
  ];
  const publicV4 = ["1.1.1.1", "8.8.8.8", "93.184.216.34", "100.63.255.255", "100.128.0.1", "172.15.255.255", "172.32.0.1", "192.0.1.1", "192.169.0.1", "198.17.255.255", "198.20.0.1", "223.255.255.255"];
  const blockedV6 = [
    "::", "::1", "::2", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.1.2.3", "::ffff:a9fe:a9fe", "::ffff:0:0", "::127.0.0.1", "64:ff9b::7f00:1", "64:ff9b::808:808", "64:ff9b:1::1",
    "100::1", "2001::1", "2001:0:4136:e378:8000:63bf:3fff:fdd2", "2001:db8::1", "2001:db8:ffff::1", "2002:7f00:1::1", "2002:0a00:0001::", "3fff::1", "fc00::1", "fd12:3456::1",
    "fe80::1", "fe80::1%eth0", "fe90::1", "fea0::1", "febf::1", "fec0::1", "fef0::1", "ff00::1", "ff02::1", "4000::1", "8000::1",
  ];
  const publicV6 = ["2606:4700:4700::1111", "2a00:1450:4001:81b::200e", "2001:4860:4860::8888", "2002:5db8:d822::1", "::ffff:8.8.8.8", "::ffff:5db8:d822"];

  test.each(blockedV4)("blocks IPv4 %s", (address) => expect(isBlockedAddress(address)).toBe(true));
  test.each(publicV4)("allows IPv4 %s", (address) => expect(isBlockedAddress(address)).toBe(false));
  test.each(blockedV6)("blocks IPv6 %s", (address) => expect(isBlockedAddress(address)).toBe(true));
  test.each(publicV6)("allows IPv6 %s", (address) => expect(isBlockedAddress(address)).toBe(false));

  test("treats unparsable addresses as blocked", () => {
    for (const address of ["", "abc", "1.2.3", "1.2.3.4.5", "999.1.1.1", "::g"]) expect(isBlockedAddress(address)).toBe(true);
  });

  test("blocks bracketed IPv6 literals in URLs", async () => {
    for (const url of ["http://[::1]/", "http://[::ffff:127.0.0.1]/", "http://[::ffff:7f00:1]/", "http://[fe80::1]/", "http://[ff02::1]/", "http://[64:ff9b::7f00:1]/", "http://[fec0::1]/", "http://[2001:db8::1]/"]) {
      await expect(assertPublicHttpUrl(url)).rejects.toThrow("Private network");
    }
    const target = await resolvePublicHttpUrl("http://[2606:4700:4700::1111]:8080/x");
    expect(target.addresses).toEqual([{ address: "2606:4700:4700::1111", family: 6 }]);
  });

  test("blocks non-canonical IPv4 literals the URL parser normalizes", async () => {
    for (const url of ["http://2130706433/", "http://0x7f.1/", "http://127.1/", "http://0177.0.0.1/", "http://127.0.0.1./"]) {
      await expect(assertPublicHttpUrl(url)).rejects.toThrow();
    }
  });
});

describe("host names", () => {
  test("normalizes case, trailing dots and brackets", () => {
    expect(normalizeHostname("Example.COM.")).toBe("example.com");
    expect(normalizeHostname("localhost..")).toBe("localhost");
    expect(normalizeHostname("[::1]")).toBe("::1");
  });

  test("rejects local names even with a trailing dot or different case", async () => {
    for (const url of ["http://localhost./", "http://LOCALHOST/", "http://foo.internal./", "http://foo.Internal/", "http://printer.local./", "http://app.localhost/", "http://user:pw@example.com/", "http://./"]) {
      await expect(assertPublicHttpUrl(url)).rejects.toThrow("not allowed");
    }
  });

  test("resolves a name once with all addresses and rejects it if any address is not public", async () => {
    const asked: string[] = [];
    const resolve = async (hostname: string) => { asked.push(hostname); return [PUBLIC_V4, PRIVATE_V4]; };
    await expect(resolvePublicHttpUrl("http://Mixed.Example.com./", resolve)).rejects.toThrow("resolves to a private network");
    expect(asked).toEqual(["mixed.example.com"]);
    await expect(resolvePublicHttpUrl("http://empty.example.com/", async () => [])).rejects.toThrow("resolves to a private network");
    const mappedV6: ResolvedAddress = { address: "::ffff:7f00:1", family: 6 };
    await expect(resolvePublicHttpUrl("http://mapped.example.com/", async () => [PUBLIC_V4, mappedV6])).rejects.toThrow("resolves to a private network");
    const ok = await resolvePublicHttpUrl("https://ok.example.com/a?b=1", async () => [PUBLIC_V4, PUBLIC_V6]);
    expect(ok.addresses).toEqual([PUBLIC_V4, PUBLIC_V6]);
    expect(ok.hostname).toBe("ok.example.com");
  });
});

describe("fetchLinkPreview", () => {
  test("connects only to the addresses it validated and resolves each host once (DNS rebinding)", async () => {
    let lookups = 0;
    const targets: PinnedTarget[] = [];
    setLinkPreviewTransportForTests({
      // A rebinding DNS answers a public address first and an internal one afterwards.
      resolve: async () => { lookups += 1; return lookups === 1 ? [PUBLIC_V4] : [{ address: "127.0.0.1", family: 4 }]; },
      request: async (target) => { targets.push(target); return htmlResponse(); },
    });
    const preview = await fetchLinkPreview("https://rebind.example.com/page");
    expect(preview).toMatchObject({ title: "Example", finalUrl: "https://rebind.example.com/page" });
    expect(lookups).toBe(1);
    expect(targets).toHaveLength(1);
    expect(targets[0]?.addresses).toEqual([PUBLIC_V4]);
    expect(targets[0]?.hostname).toBe("rebind.example.com");
    expect(targets[0]?.url.hostname).toBe("rebind.example.com");
  });

  test("follows redirects with a fresh resolve, check and pin per hop", async () => {
    const lookedUp: string[] = [];
    const pinned: string[][] = [];
    const answers: Record<string, ResolvedAddress[]> = { "a.example.com": [PUBLIC_V4], "b.example.com": [PUBLIC_V6], "c.example.com": [{ address: "93.184.216.35", family: 4 }] };
    setLinkPreviewTransportForTests({
      resolve: async (hostname) => { lookedUp.push(hostname); return answers[hostname] ?? []; },
      request: async (target) => {
        pinned.push(target.addresses.map((entry) => entry.address));
        if (target.hostname === "a.example.com") return redirect("https://b.example.com/next");
        if (target.url.pathname === "/next") return redirect("/last", 301);
        return htmlResponse();
      },
    });
    const preview = await fetchLinkPreview("https://a.example.com/start");
    expect(preview.finalUrl).toBe("https://b.example.com/last");
    expect(lookedUp).toEqual(["a.example.com", "b.example.com", "b.example.com"]);
    expect(pinned[0]).toEqual(["93.184.216.34"]);
    expect(pinned[1]).toEqual(["2606:2800:220:1:248:1893:25c8:1946"]);
  });

  test("rejects redirects to internal targets, other protocols and downgrades", async () => {
    const respond = (location: string, start = "http://start.example.com/") => {
      setLinkPreviewTransportForTests({
        resolve: async (hostname) => (hostname === "internal.example.com" ? [PRIVATE_V4] : [PUBLIC_V4]),
        request: async () => redirect(location),
      });
      return fetchLinkPreview(start);
    };
    await expect(respond("http://127.0.0.1/admin")).rejects.toThrow();
    await expect(respond("http://localhost./admin")).rejects.toThrow("not allowed");
    await expect(respond("http://[::ffff:7f00:1]/")).rejects.toThrow("Private network");
    await expect(respond("http://169.254.169.254/latest/meta-data")).rejects.toThrow("Private network");
    await expect(respond("http://internal.example.com/")).rejects.toThrow();
    await expect(respond("http://public.example.com/", "https://start.example.com/")).rejects.toThrow("HTTPS to HTTP");
    await expect(respond("http://127.0.0.1/", "https://start.example.com/")).rejects.toThrow();
    await expect(respond("ftp://public.example.com/file")).rejects.toThrow("Only HTTP and HTTPS");
    await expect(respond("file:///etc/passwd")).rejects.toThrow("Only HTTP and HTTPS");
    await expect(respond("javascript:alert(1)")).rejects.toThrow("Only HTTP and HTTPS");
  });

  test("rejects a redirect target that only resolves to a private network", async () => {
    let requests = 0;
    setLinkPreviewTransportForTests({
      resolve: async (hostname) => (hostname === "evil.example.com" ? [PUBLIC_V4, PRIVATE_V4] : [PUBLIC_V4]),
      request: async () => { requests += 1; return redirect("http://evil.example.com/"); },
    });
    await expect(fetchLinkPreview("http://start.example.com/")).rejects.toThrow("resolves to a private network");
    expect(requests).toBe(1);
  });

  test("allows HTTP to HTTPS upgrades and keeps the redirect limit", async () => {
    setLinkPreviewTransportForTests({
      resolve: async () => [PUBLIC_V4],
      request: async (target) => (target.url.protocol === "http:" ? redirect("https://up.example.com/") : htmlResponse()),
    });
    expect((await fetchLinkPreview("http://up.example.com/")).finalUrl).toBe("https://up.example.com/");

    let hops = 0;
    setLinkPreviewTransportForTests({ resolve: async () => [PUBLIC_V4], request: async () => { hops += 1; return redirect("https://loop.example.com/"); } });
    await expect(fetchLinkPreview("https://loop.example.com/")).rejects.toThrow("Too many redirects");
    expect(hops).toBe(3);
  });

  test("keeps the HTTP status, content type and size checks", async () => {
    const answer = (response: LinkPreviewResponse) => {
      setLinkPreviewTransportForTests({ resolve: async () => [PUBLIC_V4], request: async () => response });
      return fetchLinkPreview("https://example.com/");
    };
    await expect(answer({ ...htmlResponse(), status: 404 })).rejects.toThrow("HTTP 404");
    await expect(answer({ ...htmlResponse(), headers: { "content-type": "application/json" } })).rejects.toThrow("did not return an HTML page");
    await expect(answer({ ...htmlResponse(), read: async () => { throw new Error("The HTML page is too large for a preview."); } })).rejects.toThrow("too large");
  });
});

// Link preview behaviour from ticket 91 (privacy-aware fetching), run on top of the pinned transport.
describe("link preview fetching", () => {
  // No real DNS: one name resolves to a public address, one to a private one (DNS rebinding style).
  const HOSTS: Record<string, string> = { "public.example": "93.184.216.34", "rebind.example": "10.0.0.5" };

  function stubTransport(respond: (target: PinnedTarget, call: number) => LinkPreviewResponse) {
    const urls: string[] = [];
    setLinkPreviewTransportForTests({
      resolve: async (hostname) => {
        const address = HOSTS[hostname];
        if (!address) throw new Error(`ENOTFOUND ${hostname}`);
        return [{ address, family: 4 }];
      },
      request: async (target) => {
        urls.push(target.url.toString());
        return respond(target, urls.length);
      },
    });
    return urls;
  }

  // Like the real transport, a body over the limit makes read() fail.
  const html = (body: string, status = 200, contentType = "text/html; charset=utf-8"): LinkPreviewResponse => ({
    status,
    headers: { "content-type": contentType },
    read: async (maxBytes) => {
      const bytes = new TextEncoder().encode(body);
      if (bytes.byteLength > maxBytes) throw new Error("The HTML page is too large for a preview.");
      return bytes;
    },
    close: () => {},
  });

  test("@t91 returns title, description and image of a public page with one request", async () => {
    const urls = stubTransport(() => html('<html><head><title>Fallback</title><meta property="og:title" content="BloomMD"><meta name="description" content="Visual maps"><meta property="og:image" content="/social.png"></head></html>'));
    const preview = await fetchLinkPreview("https://public.example/docs");
    expect(preview).toEqual({ url: "https://public.example/docs", finalUrl: "https://public.example/docs", title: "BloomMD", description: "Visual maps", image: "https://public.example/social.png" });
    expect(urls).toEqual(["https://public.example/docs"]);
  });

  test("@t91 a page without metadata is a valid, empty result", async () => {
    stubTransport(() => html("<html><body>Hi</body></html>"));
    expect(await fetchLinkPreview("https://public.example/")).toEqual({ url: "https://public.example/", finalUrl: "https://public.example/" });
  });

  test("@t91 rejects non-HTML, HTTP errors and oversized pages", async () => {
    stubTransport(() => html("{}", 200, "application/json"));
    await expect(fetchLinkPreview("https://public.example/api")).rejects.toThrow("did not return an HTML page");
    stubTransport(() => html("nope", 503));
    await expect(fetchLinkPreview("https://public.example/down")).rejects.toThrow("Website returned HTTP 503.");
    stubTransport(() => html("x".repeat(1_000_001)));
    await expect(fetchLinkPreview("https://public.example/big")).rejects.toThrow("too large");
  });

  test("@t91 a host that resolves to a private address is rejected before any request", async () => {
    const urls = stubTransport(() => html("<html></html>"));
    await expect(fetchLinkPreview("https://rebind.example/")).rejects.toThrow("resolves to a private network");
    expect(urls).toEqual([]);
  });

  test("@t91 a redirect to a private address is rejected and not followed", async () => {
    for (const target of ["http://127.0.0.1/admin", "https://rebind.example/internal", "http://localhost/x"]) {
      const urls = stubTransport(() => redirect(target));
      await expect(fetchLinkPreview("https://public.example/start")).rejects.toThrow();
      expect(urls).toEqual(["https://public.example/start"]);
    }
  });

  test("@t91 follows a redirect to another public address with one request per hop", async () => {
    const urls = stubTransport((_target, call) => (call === 1 ? redirect("https://93.184.216.35/final") : html('<html><head><meta property="og:title" content="T"></head></html>')));
    const preview = await fetchLinkPreview("https://93.184.216.34/start");
    expect(preview.title).toBe("T");
    expect(urls).toEqual(["https://93.184.216.34/start", "https://93.184.216.35/final"]);
  });
});

describe("requestPinned", () => {
  let server: Server | undefined;
  afterEach(() => new Promise<void>((done) => {
    if (!server) return done();
    server.close(() => done());
    server.closeAllConnections();
  }));

  async function listen(handler: (request: IncomingMessage) => { status?: number; headers?: Record<string, string>; body: string | Buffer }): Promise<number> {
    server = createServer((request, response) => {
      const result = handler(request);
      response.writeHead(result.status ?? 200, { "content-type": "text/html", ...result.headers });
      response.end(result.body);
    });
    await new Promise<void>((ready) => server!.listen(0, "127.0.0.1", ready));
    return (server.address() as { port: number }).port;
  }

  const target = (port: number, addresses: ResolvedAddress[] = [{ address: "127.0.0.1", family: 4 }]): PinnedTarget => ({
    url: new URL(`http://pinned.example.test:${port}/page?x=1`),
    hostname: "pinned.example.test",
    addresses,
  });

  test("connects to the pinned address, never resolves the name, and keeps the host name in the Host header", async () => {
    let host = "";
    let path = "";
    const port = await listen((request) => { host = request.headers.host ?? ""; path = request.url ?? ""; return { body: HTML }; });
    // pinned.example.test does not exist in DNS: the request can only succeed through the pinned address.
    const response = await requestPinned(target(port), AbortSignal.timeout(5000));
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/html");
    expect(new TextDecoder().decode(await response.read(1000))).toBe(HTML);
    expect(host).toBe(`pinned.example.test:${port}`);
    expect(path).toBe("/page?x=1");
  });

  test("@t91 sends no cookie, authorization, referer or origin header and no body", async () => {
    let seen: IncomingMessage | undefined;
    let body = "";
    const port = await listen((request) => {
      seen = request;
      request.on("data", (chunk: Buffer) => { body += chunk.toString(); });
      return { body: HTML };
    });
    const response = await requestPinned(target(port), AbortSignal.timeout(5000));
    await response.read(1000);
    const names = Object.keys(seen!.headers).sort();
    expect(seen!.method).toBe("GET");
    expect(names).toEqual(["accept", "accept-encoding", "connection", "host", "user-agent"]);
    for (const forbidden of ["cookie", "authorization", "referer", "origin"]) expect(names).not.toContain(forbidden);
    expect(body).toBe("");
  });

  test("never uses an address outside the pinned set", async () => {
    const port = await listen(() => ({ body: HTML }));
    // The pinned address is a closed port on another loopback address: no fallback to the server on 127.0.0.1.
    await expect(requestPinned(target(port, [{ address: "127.0.0.2", family: 4 }]), AbortSignal.timeout(5000))).rejects.toThrow();
  });

  test("decodes gzip and enforces the size limit on the decoded body", async () => {
    const big = "a".repeat(5000);
    const port = await listen(() => ({ headers: { "content-encoding": "gzip" }, body: gzipSync(Buffer.from(big)) }));
    const ok = await requestPinned(target(port), AbortSignal.timeout(5000));
    expect((await ok.read(10_000)).byteLength).toBe(5000);
    const limited = await requestPinned(target(port), AbortSignal.timeout(5000));
    await expect(limited.read(1000)).rejects.toThrow("too large");
  });

  test("rejects unsupported content encodings", async () => {
    const port = await listen(() => ({ headers: { "content-encoding": "zstd" }, body: "x" }));
    const response = await requestPinned(target(port), AbortSignal.timeout(5000));
    await expect(response.read(1000)).rejects.toThrow("unsupported content encoding");
  });

  test("rejects an already aborted signal", async () => {
    const port = await listen(() => ({ body: HTML }));
    await expect(requestPinned(target(port), AbortSignal.abort())).rejects.toThrow();
  });

  test("aborts a request that never answers", async () => {
    server = createServer(() => {});
    await new Promise<void>((ready) => server!.listen(0, "127.0.0.1", ready));
    const port = (server.address() as { port: number }).port;
    await expect(requestPinned(target(port), AbortSignal.timeout(300))).rejects.toThrow();
  });
});
