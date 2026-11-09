
const basePath = "/api/galactic";
const forward = ["accept", "content-type", "cookie", "origin", "x-csrf-token", "idempotency-key"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== basePath && !url.pathname.startsWith(basePath + "/")) {
      return env.ASSETS.fetch(request);
    }
    const unavailable = () => Response.json({ error: "Command uplink unavailable. Try again shortly." }, {
      status: 503, headers: { "Cache-Control": "no-store" }
    });
    if (url.origin !== env.GALACTIC_WEB_ORIGIN || !/^https:\/\/[a-z0-9.-]+$/i.test(env.GALACTIC_RAILWAY_ORIGIN || "") ||
        (env.GALACTIC_WEB_PROXY_KEY || "").length < 32) return unavailable();

    const headers = new Headers();
    for (const name of forward) {
      if (request.headers.has(name)) headers.set(name, request.headers.get(name));
    }
    headers.set("x-galactic-proxy", env.GALACTIC_WEB_PROXY_KEY);
    headers.set("x-galactic-client-ip", request.headers.get("cf-connecting-ip") || "unknown");
    try {
      const backend = new URL(env.GALACTIC_RAILWAY_ORIGIN);
      backend.pathname = url.pathname;
      backend.search = url.search;
      const result = await fetch(backend, {
        method: request.method, headers, body: request.body, redirect: "manual", signal: AbortSignal.timeout(25000)
      });
      if (result.status >= 500 && !result.headers.get("content-type")?.includes("application/json")) return unavailable();
      const response = new Response(result.body, result);
      response.headers.set("Cache-Control", "no-store");
      return response;
    } catch {
      return unavailable();
    }
  }
};
