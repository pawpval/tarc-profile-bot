
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { chromium } from "playwright";
import express from "express";

const root = fileURLToPath(new URL("../../", import.meta.url));
const dir = await mkdtemp(join(tmpdir(), "galactic-browser-"));
process.env.TARC_DATA_DIR = dir;
const game = await import("../../game/galacticState.js");
const { createGalacticWebRouter } = await import("../../game/galacticWeb.js");
const playerId = "100000000000000001";
const rivalId = "100000000000000002";
const app = express();
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const origin = "http://127.0.0.1:" + server.address().port;
const prefix = "/api/galactic";
const proxyKey = "isolated-local-browser-test-proxy-key";
app.use(prefix, (req, res, next) => { req.headers["x-galactic-proxy"] = proxyKey; next(); });
app.use(prefix, createGalacticWebRouter({
  secureCookies: false,
  env: { GALACTIC_WEB_ORIGIN: origin, GALACTIC_WEB_PROXY_KEY: proxyKey,
    GALACTIC_DISCORD_CLIENT_ID: "100000000000000009", GALACTIC_DISCORD_CLIENT_SECRET: "fixture-only" },
  request: async (url, options) => {
    if (url.endsWith("/oauth2/token")) return Response.json({ access_token: options.body.get("code") });
    const id = options.headers.Authorization.slice("Bearer ".length);
    return Response.json({ id, username: id === playerId ? "Vela" : "Talon", avatar: null });
  }
}));
app.use(express.static(resolve(root, "web/public")));
let browser;
try {
  const rival = await game.chooseFaction(rivalId, "cis");
  const rivalCard = rival.profile.combat[0];
  assert.equal((await game.assignCard(rivalId, rivalCard, "reserve")).ok, true);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(7500);
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  async function fixtureLogin(tab, accountId) {
    await tab.route("**/api/galactic/auth/login", async route => {
      const login = await route.fetch({ maxRedirects: 0 });
      const params = new URL(login.headers().location).searchParams;
      const target = new URL(params.get("redirect_uri"));
      target.searchParams.set("state", params.get("state"));
      target.searchParams.set("code", accountId);
      await route.fulfill({ response: login, headers: { ...login.headers(), location: target.href } });
    });
  }
  await fixtureLogin(page, playerId);
  const h = text => page.getByRole("heading", { name: text, exact: true });
  const b = text => page.getByRole("button", { name: text, exact: true });
  const go = text => page.getByRole("navigation").getByRole("button", { name: text, exact: true }).click();
  const close = () => b("Close").click();
  const navs = [["Collection", "Collection"], ["Squad", "Your squad"], ["Operations", "Operations"],
    ["Supply", "Supply"], ["Commanders", "Commanders"], ["Rankings", "Rankings"], ["Guild", "Guild"], ["Profile", "Vela"], ["Command", "Command Deck"]];
  await page.goto(origin);
  await page.getByRole("link", { name: /Sign in with Discord/ }).waitFor();
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), "Skip to content");
  await page.getByRole("link", { name: /Sign in with Discord/ }).click();
  await h("Choose your faction").waitFor();
  await page.getByRole("article").filter({ has: h("Galactic Republic") }).getByRole("button", { name: "Enlist" }).click();
  await b("Confirm").click();
  await h("Command Deck").waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll(".mini-units img")].every(img => img.complete));
  if (process.env.GALACTIC_QA_SCREENSHOTS) await page.screenshot({ path: resolve(process.env.GALACTIC_QA_SCREENSHOTS, "desktop-hub.png") });
  await b("Roll card · 300 Credits").click();
  await h("Recruit secured").waitFor();
  await close();
  await go("Collection");
  await h("Collection").waitFor();
  const cards = page.locator(".card-grid .unit");
  assert.equal(await cards.count(), 6);
  await cards.last().click();
  await page.getByLabel("Assignment").selectOption("combat");
  await b("Assign").click();
  await page.getByRole("status").getByText("Assignment updated.").waitFor();
  await page.keyboard.press("Escape");
  await go("Squad");
  assert.equal(await page.locator(".slot-grid").first().locator(".unit").count(), 4);

  await go("Supply");
  await page.getByRole("article").filter({ has: h("Galactic Supply Crate") }).last().getByRole("button", { name: "Review crate" }).click();
  await h("Drop odds per card").waitFor();
  await b("Open crate · 900 Credits").click();
  await h("Supply crate opened").waitFor();
  assert.equal(await page.locator(".reveal-grid .unit").count(), 3);
  await close();
  assert.ok(await b("Roll card · 300 Credits").count() === 0);

  await go("Operations");
  await page.getByRole("article").filter({ has: h("Border Patrol") }).getByRole("button", { name: "Deploy squad" }).click();
  await page.getByRole("dialog").getByRole("heading", { name: /Mission succeeded|Squad withdrew/ }).waitFor();
  await close();
  await page.getByRole("article").filter({ has: h("Border Patrol") }).locator("time").waitFor();
  await go("Commanders");
  await page.getByLabel("Discord user ID").fill(rivalId);
  await b("Find commander").click();
  await page.getByText(/New-player protection ends/).waitFor();
  assert.equal(await b("Launch raid").isDisabled(), true);
  const offered = await page.getByLabel("You offer").locator("option").nth(1).getAttribute("value");
  await page.getByLabel("You offer").selectOption(offered);
  await page.getByLabel("You request").selectOption(rivalCard);
  await b("Review trade").click();
  await b("Confirm").click();
  await page.getByText("Awaiting response", { exact: true }).waitFor();

  const opponentPage = await browser.newPage({ viewport: { width: 900, height: 800 } });
  opponentPage.setDefaultTimeout(7500);
  opponentPage.on("pageerror", e => errors.push(e.message));
  await fixtureLogin(opponentPage, rivalId);
  await opponentPage.goto(origin);
  await opponentPage.getByRole("link", { name: /Sign in with Discord/ }).click();
  await opponentPage.getByRole("heading", { name: "Daily supplies delivered" }).waitFor();
  const rivalButton = name => opponentPage.getByRole("button", { name, exact: true });
  await rivalButton("Close").click();
  await opponentPage.getByRole("navigation").getByRole("button", { name: /Commanders/ }).click();
  await rivalButton("Accept").click();
  await rivalButton("Confirm").click();
  await opponentPage.getByRole("status").getByText("Trade completed.").waitFor();
  assert.ok((await game.snapshot(playerId)).profile.cards.some(card => card.uid === rivalCard));

  await page.getByRole("checkbox", { name: "Ranked duel" }).check();
  await b("Send challenge").click();
  await page.getByRole("status").getByText(/Challenge sent/).waitFor();
  await rivalButton("Sync").click();
  await rivalButton("Accept").click();
  await rivalButton("Confirm").click();
  await opponentPage.getByRole("dialog").getByRole("heading", { name: /Battle won|Battle lost/ }).waitFor();
  await opponentPage.close();

  await b("Settings").click();
  await page.getByRole("checkbox", { name: "Motion effects" }).uncheck();
  await page.getByRole("checkbox", { name: "Game effects" }).check();
  await b("Save settings").click();
  assert.equal(await page.locator("html").evaluate(el => el.classList.contains("reduced")), true);

  await page.setViewportSize({ width: 390, height: 844 });
  for (const [label, title] of navs) {
    await go(label);
    await h(title).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), label + " has horizontal overflow");
  }
  if (process.env.GALACTIC_QA_SCREENSHOTS) await page.screenshot({ path: resolve(process.env.GALACTIC_QA_SCREENSHOTS, "mobile-hub.png") });
  await game.adminGameAction("fixture", "set", playerId, "credits", 1000);
  let failOnce = true;
  await page.route("**/api/galactic/action", async route => {
    if (failOnce) {
      failOnce = false;
      const committed = await route.fetch();
      assert.equal(committed.status(), 200);
      await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Command uplink interrupted."}' });
    } else await route.continue();
  });
  const before = (await game.snapshot(playerId)).profile.cards.length;
  await b("Sync").click();
  await page.getByRole("status").getByText("Profile synced.").waitFor();
  await b("Roll card · 300 Credits").click();
  await b("Retry command").waitFor();
  await b("Retry command").click();
  await h("Recruit secured").waitFor();
  assert.equal((await game.snapshot(playerId)).profile.cards.length, before + 1);
  await close();
  await page.reload();
  await h("Daily supplies delivered").waitFor();
  await close();
  await h("Command Deck").waitFor();
  await b("Log out").click();
  await page.getByRole("link", { name: /Sign in with Discord/ }).waitFor();
  assert.deepEqual(errors, []);
  console.log("Browser checks passed at desktop and mobile widths, including keyboard focus, login, gameplay, trade, ranked duel, settings, a lost response and logout.");
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
}
