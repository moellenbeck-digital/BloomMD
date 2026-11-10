// Stand-in for the Plausible instance of Ops, used by the e2e run (see playwright.config.ts).
// GET /js/script.js, POST /api/event (202) like the real one; GET /__last-event returns the headers and
// body of the last event so a test can prove what the proxy forwarded.
const port = Number(process.argv[2] ?? 3291);

let lastEvent: { headers: Record<string, string>; body: string } | null = null;

Bun.serve({
  port,
  hostname: "127.0.0.1",
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === "/__health") return new Response("ok");
    if (pathname === "/__last-event") return Response.json(lastEvent);
    if (pathname === "/js/script.js" && request.method === "GET") {
      return new Response("/* plausible e2e stub */", { headers: { "content-type": "application/javascript" } });
    }
    if (pathname === "/api/event" && request.method === "POST") {
      lastEvent = { headers: Object.fromEntries(request.headers), body: await request.text() };
      return new Response("ok", { status: 202, headers: { "content-type": "text/plain" } });
    }
    return new Response(null, { status: 404 });
  },
});
console.log(`Plausible e2e stub listening on 127.0.0.1:${port}`);
