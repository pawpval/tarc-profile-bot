
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, mkdir, rename, rmdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";

const dir = await mkdtemp(join(tmpdir(), "galactic-web-"));
process.env.TARC_DATA_DIR = dir;
const game = await import("./galacticState.js");
const { createGalacticWebRouter } = await import("./galacticWeb.js");
const { handleGalacticInteraction } = await import("./galacticCommands.js");
const { default: edge } = await import("../web/public/_worker.js");
const origin = "https://command.example";
const prefix = "/api/galactic";
const proxyKey = "test-proxy-key-for-isolated-fixture-only";
const firstId = "100000000000000001";
const secondId = "100000000000000002";
const thirdId = "100000000000000003";

const app = express();
let oauthCalls = 0;
app.use(prefix, createGalacticWebRouter({
  env: {
    GALACTIC_WEB_ORIGIN: origin, GALACTIC_WEB_PROXY_KEY: proxyKey,
    GALACTIC_DISCORD_CLIENT_ID: "100000000000000009", GALACTIC_DISCORD_CLIENT_SECRET: "test-only"
  },
  request: async (url, options) => {
    oauthCalls++;
    if (url.endsWith("/oauth2/token")) {
      assert.equal(options.body.get("redirect_uri"), origin + prefix + "/auth/callback");
      return Response.json({ access_token: options.body.get("code") });
    }
    return Response.json({ id: options.headers.Authorization.slice(7), username: "Test commander", avatar: null });
  }
}));
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const backend = "http://127.0.0.1:" + server.address().port + prefix;
after(async () => {
  await new Promise(resolve => server.close(resolve));
  await rm(dir, { force: true, recursive: true });
});
const request = (path, options = {}) => fetch(backend + path, {
  ...options, redirect: "manual", headers: { "x-galactic-proxy": proxyKey, ...options.headers }
});
const key = (at = Date.now()) => at + "-" + randomUUID();

async function login(accountId) {
  const begin = await request("/auth/login");
  assert.equal(begin.status, 303);
  const location = new URL(begin.headers.get("location"));
  assert.equal(location.hostname, "discord.com");
  assert.equal(location.searchParams.get("scope"), "identify");
  assert.equal(location.searchParams.get("redirect_uri"), origin + prefix + "/auth/callback");
  const oauthCookie = begin.headers.get("set-cookie");
  assert.match(oauthCookie, /HttpOnly; Secure; SameSite=Lax/);
  const state = location.searchParams.get("state");
  const callback = "/auth/callback?state=" + state + "&code=" + accountId;
  const options = { headers: { Cookie: oauthCookie.split(";")[0] } };
  const finish = await request(callback, options);
  assert.equal(finish.headers.get("location"), origin + "/");
  const session = finish.headers.getSetCookie().find(c => c.startsWith("__Host-gc_session"));
  assert.match(session, /Path=\/; .*HttpOnly; Secure; SameSite=Lax/);
  assert.equal((await request(callback, options)).headers.get("location"), origin + "/?login=retry");
  const cookie = session.split(";")[0];
  const get = path => request(path, { headers: { Cookie: cookie } });
  const stateResponse = await get("/state");
  assert.equal(stateResponse.status, 200);
  assert.equal(stateResponse.headers.get("cache-control"), "no-store");
  const view = await stateResponse.json();
  assert.equal(view.account.id, accountId);
  const post = (body, retryKey = key(), headers = {}, path = "/action") => request(path, {
    method: "POST", headers: { Cookie: cookie, Origin: origin, "X-CSRF-Token": view.csrf,
      "Idempotency-Key": retryKey, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
  return { view, get, post, state: async () => (await get("/state")).json(),
    act: async (...args) => (await post(...args)).json() };
}

test("OAuth binds requests to the session and rejects cross-site or forged commands", async () => {
  assert.equal((await fetch(backend + "/state")).status, 403);
  assert.equal((await request("/state")).status, 401);
  const start = await request("/auth/login");
  const before = oauthCalls;
  const wrong = await request("/auth/callback?state=wrong&code=" + firstId, {
    headers: { Cookie: start.headers.get("set-cookie").split(";")[0] }
  });
  assert.equal(wrong.headers.get("location"), origin + "/?login=retry");
  assert.equal(oauthCalls, before);

  const client = await login(firstId);
  assert.equal((await client.post({ action: "roll" }, key(), { Origin: "https://other.example" })).status, 403);
  assert.equal((await client.post({ action: "roll" }, key(), { "X-CSRF-Token": "wrong" })).status, 403);
  assert.equal((await client.post({ action: "roll", userId: secondId })).status, 400);
  assert.equal((await client.post({ action: "roll", free: true })).status, 400);
  assert.equal((await client.post({ action: "admin" })).status, 400);
  assert.equal((await client.post({}, key(), {}, "/auth/logout")).status, 200);
  assert.equal((await client.get("/state")).status, 401);
});

test("browser and Discord share cards, charges, dailies, assignments, missions and retries", async () => {
  const client = await login(firstId);
  assert.equal(client.view.profile.faction, null);
  assert.equal((await client.act({ action: "faction", faction: "republic" })).ok, true);
  assert.equal((await client.state()).profile.cards.length, 5);
  const daily = await Promise.all([client.act({ action: "enter" }), game.daily(firstId)]);
  assert.equal(daily.filter(r => r.ok).length, 1);

  const start = (await client.state()).profile;
  const retryKey = key();
  const [one, two] = await Promise.all([
    client.act({ action: "roll" }, retryKey),
    client.act({ action: "roll" }, retryKey)
  ]);
  assert.equal(one.ok, true);
  assert.deepEqual(one, two);
  assert.equal(one.found[0].faction, "republic");
  const afterRoll = (await game.snapshot(firstId)).profile;
  assert.equal(afterRoll.credits, start.credits - game.ROLL_PRICE);
  assert.equal(afterRoll.cards.length, start.cards.length + 1);
  assert.equal((await client.act({ action: "crate", crate: "standard" }, retryKey)).ok, false);
  assert.equal((await client.act({ action: "roll" }, key(Date.now() - 16 * 60000))).ok, false);

  const uid = one.found[0].uid;
  assert.equal((await client.act({ action: "assign", uid, role: "combat" })).ok, true);
  assert.equal((await client.act({ action: "upgrade", uid, fuse: false, level: 1 })).ok, true);
  assert.equal((await client.act({ action: "upgrade", uid, fuse: false, level: 1 })).ok, false);
  const upgraded = (await game.snapshot(firstId)).profile;
  assert.equal(upgraded.cards.find(c => c.uid === uid).level, 2);
  assert.ok(upgraded.combat.includes(uid));

  let discordResult;
  await handleGalacticInteraction({
    isChatInputCommand: () => true, commandName: "roll", user: { id: firstId },
    options: { getString: () => null },
    async deferReply() { this.deferred = true; },
    async editReply(payload) { discordResult = payload; }
  });
  assert.ok(discordResult.embeds?.length);
  assert.equal((await client.state()).profile.cards.length, upgraded.cards.length + 1);

  await game.adminGameAction("fixture", "set", firstId, "credits", 10000);
  const crate = await client.act({ action: "crate", crate: "standard" });
  assert.equal(crate.found.length, 3);
  assert.equal(crate.spent, 900);
  assert.equal((await client.act({ action: "deal", day: "2000-01-01" })).ok, false);
  assert.equal((await client.act({ action: "deal", day: (await client.state()).deal.key })).found.length, 3);
  const mission = await client.act({ action: "mission", mission: "border" });
  assert.equal(mission.ok, true);
  assert.ok(mission.credits > 0);
  assert.equal((await client.act({ action: "mission", mission: "border" })).ok, false);
  await game.adminGameAction("fixture", "set", firstId, "credits", 0);
  assert.equal((await client.act({ action: "roll" })).ok, false);
});

test("two profiles can exchange cards once and duel only with recipient consent", async () => {
  const a = await login(firstId);
  const b = await login(secondId);
  const c = await login(thirdId);
  assert.equal((await b.act({ action: "faction", faction: "cis" })).ok, true);
  const one = (await a.state()).profile.combat[0];
  const two = (await b.state()).profile.combat[0];
  assert.equal((await a.act({ action: "assign", uid: one, role: "reserve" })).ok, true);
  assert.equal((await b.act({ action: "assign", uid: two, role: "reserve" })).ok, true);
  const trade = await a.act({ action: "trade", target: secondId, offer: one, wanted: two });
  assert.equal(trade.ok, true);
  assert.equal((await b.state()).trades[0].id, trade.id);
  assert.equal((await c.state()).trades.length, 0);
  assert.equal((await c.act({ action: "tradeAnswer", offer: trade.id, accept: true })).ok, false);
  const [accepted, repeated] = await Promise.all(Array.from({ length: 2 }, () =>
    b.act({ action: "tradeAnswer", offer: trade.id, accept: true })));
  assert.equal([accepted, repeated].filter(r => r.ok).length, 1);
  const aProfile = (await a.state()).profile, bProfile = (await b.state()).profile;
  assert.ok(aProfile.cards.some(x => x.uid === two) && !aProfile.cards.some(x => x.uid === one));
  assert.ok(bProfile.cards.some(x => x.uid === one) && !bProfile.cards.some(x => x.uid === two));
  assert.equal((await a.state()).tradeHistory[0].status, "Completed");
  const rival = await (await a.get("/opponent/" + secondId)).json();
  assert.ok(rival.protectionUntil > Date.now());
  assert.equal((await a.act({ action: "raid", target: secondId })).ok, false);

  const duel = await game.proposeDuel(firstId, secondId, true);
  assert.equal((await b.state()).duels[0].id, duel.id);
  assert.equal((await a.act({ action: "duelAnswer", offer: duel.id, accept: true })).ok, false);
  const resolved = await b.act({ action: "duelAnswer", offer: duel.id, accept: true });
  assert.equal(resolved.ok, true);
  assert.ok([firstId, secondId].includes(resolved.winner));
  assert.equal((await game.answerDuel(duel.id, secondId, true)).ok, false);
});

test("failed save rolls back the in-memory change and a committed receipt survives reload", async () => {
  const client = await login(firstId);
  await game.adminGameAction("fixture", "set", firstId, "credits", 3000);
  const balance = (await client.state()).profile.credits;
  const save = join(dir, "tarc-galactic-v2.json");
  const backup = save + ".backup";
  const retryKey = key();
  await rename(save, backup);
  await mkdir(save);
  try {
    const failed = await client.post({ action: "roll" }, retryKey);
    assert.equal(failed.status, 503);
  } finally {
    await rmdir(save);
    await rename(backup, save);
  }
  assert.equal((await client.state()).profile.credits, balance);
  const result = await client.act({ action: "roll" }, retryKey);
  assert.equal(result.ok, true);
  const reloaded = await import("./galacticState.js?webReceiptReload");
  const signature = (await import("node:crypto")).createHash("sha256").update(JSON.stringify(["roll", {}])).digest("base64url");
  const replay = await reloaded.runWebAction(firstId, retryKey, Number(retryKey.slice(0, 13)), signature, () => reloaded.roll(firstId));
  assert.deepEqual(result, replay);
  assert.equal((await reloaded.snapshot(firstId)).profile.credits, balance - game.ROLL_PRICE);
});

test("Pages proxy preserves OAuth redirect and cookies and does not trust browser proxy headers", async () => {
  const originalFetch = globalThis.fetch;
  const url = origin + prefix + "/auth/login";
  const bindings = { GALACTIC_WEB_ORIGIN: origin, GALACTIC_RAILWAY_ORIGIN: "https://rail.example", GALACTIC_WEB_PROXY_KEY: proxyKey };
  let calls = 0;
  try {
    globalThis.fetch = async (target, options) => {
      calls++;
      assert.equal(target.href, "https://rail.example" + prefix + "/auth/login");
      assert.equal(options.redirect, "manual");
      assert.equal(options.headers.get("x-galactic-proxy"), proxyKey);
      assert.equal(options.headers.get("x-galactic-client-ip"), "192.0.2.2");
      return new Response(null, { status: 303, headers: { Location: "https://discord.com/oauth2/authorize", "Set-Cookie": "__Host-gc_oauth=abc; Secure; HttpOnly; Path=/" } });
    };
    const response = await edge.fetch(new Request(url, { headers: { "x-galactic-proxy": "forged", "x-galactic-client-ip": "forged", "cf-connecting-ip": "192.0.2.2" } }), bindings);
    assert.equal(response.status, 303);
    assert.match(response.headers.get("set-cookie"), /__Host-gc_oauth/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await edge.fetch(new Request("https://preview.example" + prefix + "/state"), bindings)).status, 503);
    assert.equal(calls, 1);
    globalThis.fetch = async () => { throw Error("offline"); };
    assert.equal((await edge.fetch(new Request(url), bindings)).status, 503);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
