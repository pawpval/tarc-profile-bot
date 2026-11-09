
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import express from "express";
import { ABILITIES, CARD_CATALOG, CRATES, FACTIONS, MISSIONS, RARITIES, crateOdds, dailyContract, getCard, getLeague, rankFromLevel } from "./galacticCatalog.js";
import { realStarWarsImage } from "./galacticImages.js";
import * as game from "./galacticState.js";

const route = "/api/galactic";
const hour = 3600000;
const id = value => typeof value === "string" && /^\d{16,22}$/.test(value);
const cardUid = value => typeof value === "string" && /^[a-f0-9]{8}$/.test(value);
const offerId = value => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]$/.test(value);
const pick = choices => value => choices.includes(value);
const bool = value => typeof value === "boolean";
const level = max => value => Number.isInteger(value) && value >= 1 && value <= max;
const periods = ["daily", "weekly", "monthly"];
const nonce = () => randomBytes(32).toString("base64url");
const hash = value => createHash("sha256").update(value).digest();
const equal = (a, b) => typeof a === "string" && typeof b === "string" && timingSafeEqual(hash(a), hash(b));
const deal = day => typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day);
const action = (fields, execute) => ({ fields, execute });

const actions = {
  enter: action({}, game.daily),
  faction: action({ faction: pick(Object.keys(FACTIONS)) }, (user, a) => game.chooseFaction(user, a.faction)),
  roll: action({}, user => game.roll(user)),
  crate: action({ crate: pick(Object.keys(CRATES)) }, (user, a) => game.roll(user, a.crate)),
  deal: action({ day: deal }, (user, a) => game.buyDailyDeal(user, a.day)),
  assign: action({ uid: cardUid, role: pick(["combat", "production", "reserve"]) }, (user, a) => game.assignCard(user, a.uid, a.role)),
  upgrade: action({ uid: cardUid, fuse: bool, level: level(20) }, (user, a) => game.upgradeCard(user, a.uid, a.fuse, a.level)),
  train: action({ uid: cardUid, level: level(5) }, (user, a) => game.trainAbility(user, a.uid, a.level)),
  recycle: action({ uid: cardUid }, (user, a) => game.recycleCard(user, a.uid)),
  mission: action({ mission: pick([...MISSIONS.map(m => m.id), "contract"]) }, (user, a) => game.runMission(user, a.mission)),
  event: action({}, user => game.runMission(user, "droid", { event: true })),
  salvage: action({}, game.salvage),
  quest: action({ period: pick(periods), quest: value => typeof value === "string" && /^[a-z]{1,20}$/.test(value) }, (user, a) => game.claimQuest(user, a.period, a.quest)),
  raid: action({ target: id }, (user, a) => game.raid(user, a.target)),
  duel: action({ target: id, ranked: bool }, (user, a) => game.proposeDuel(user, a.target, a.ranked)),
  duelAnswer: action({ offer: offerId, accept: bool }, (user, a) => game.answerDuel(a.offer, user, a.accept)),
  trade: action({ target: id, offer: cardUid, wanted: cardUid }, (user, a) => game.proposeTrade(user, a.target, a.offer, a.wanted)),
  tradeAnswer: action({ offer: offerId, accept: bool }, (user, a) => game.answerTrade(a.offer, user, a.accept)),
  guildCreate: action({ name: value => typeof value === "string" && /^[\w '-]{3,28}$/.test(value) }, (user, a) => game.createGuild(user, a.name)),
  guildJoin: action({ code: value => typeof value === "string" && /^[a-f0-9]{6}$/i.test(value) }, (user, a) => game.joinGuild(user, a.code)),
  guildLeave: action({}, game.leaveGuild),
  guildDonate: action({ credits: value => Number.isSafeInteger(value) && value >= 100 && value <= 20000 }, (user, a) => game.donateGuild(user, a.credits)),
  guildResearch: action({ type: pick(["economy", "war"]) }, (user, a) => game.researchGuild(user, a.type)),
  guildTransfer: action({ target: id }, (user, a) => game.transferGuild(user, a.target))
};

function cookie(req, name) {
  return (req.get("cookie") || "").split(";").map(part => part.trim()).find(part => part.startsWith(name + "="))?.slice(name.length + 1);
}

function reserve(player) {
  return player.cards.filter(c => !player.combat.includes(c.uid) && !player.production.includes(c.uid));
}

function cardView({ uid, cardId, level, abilityLevel }) {
  return { uid, cardId, level, abilityLevel: abilityLevel || 1 };
}

function profileView(p, now) {
  const level = game.playerLevel(p.xp);
  return {
    faction: p.faction, credits: p.credits, xp: p.xp, scrap: p.scrap, level,
    rank: rankFromLevel(level), league: getLeague(p.weekScore), weekScore: p.weekScore,
    rankedRating: p.rankedRating, rankedWins: p.rankedWins, rankedLosses: p.rankedLosses,
    raidsWon: p.raidsWon, raidsLost: p.raidsLost, duelsWon: p.duelsWon, rolls: p.rolls,
    cards: p.cards.map(owned => {
      const card = getCard(owned.cardId);
      return { ...cardView(owned), costs: card ? game.cardCosts(owned, card) : null,
        stats: card ? game.cardStrength(owned, card) : null };
    }),
    combat: p.combat, production: p.production,
    odds: Object.fromEntries(Object.entries(CRATES).map(([key, crate]) => [key, crateOdds(crate, p.upgrades.luck)])),
    income: game.hourlyIncome(p), stats: game.combatStats(p),
    quests: Object.fromEntries(periods.map(period => [period, game.activeQuests(p, period, now)])),
    missions: [...MISSIONS, dailyContract(now)].map(m => ({ ...m, readyAt: (p.missions[m.id] || 0) + m.cooldown })),
    eventReadyAt: p.eventAt + 30 * 60000,
    salvageReadyAt: (p.cooldowns.salvage || 0) + 15 * 60000,
    raidReadyAt: p.lastRaidAt + hour, dailyReadyAt: p.dailyAt + 20 * hour,
    dailyStreak: p.dailyStreak, dealBought: p.cooldowns.dailyDeal === game.dailyDeal(now).key
  };
}

const catalog = {
  factions: FACTIONS, rarities: RARITIES, crates: CRATES, abilities: ABILITIES, rollPrice: game.ROLL_PRICE,
  cards: CARD_CATALOG.map(({ imageKey, portrait, ...card }) => ({
    ...card, image: realStarWarsImage({ ...card, imageKey, portrait })
  }))
};

function identity(user) {
  return {
    id: user.id, name: user.global_name || user.globalName || user.username,
    avatar: typeof user.avatar === "string" && /^[a-f0-9_]+$/.test(user.avatar)
      ? "https://cdn.discordapp.com/avatars/" + user.id + "/" + user.avatar + ".webp?size=128" : null
  };
}

export function createGalacticWebRouter({
  env = process.env, request = fetch, discordUser = () => null, secureCookies = true
} = {}) {
  const router = express.Router();
  const sessions = new Map();
  const oauth = new Map();
  const limits = new Map();
  const sessionCookie = secureCookies ? "__Host-gc_session" : "gc_session";
  const stateCookie = secureCookies ? "__Host-gc_oauth" : "gc_oauth";
  const cookieOptions = { httpOnly: true, sameSite: "lax", secure: secureCookies, path: "/" };
  const { GALACTIC_WEB_ORIGIN: origin, GALACTIC_WEB_PROXY_KEY: proxyKey,
    GALACTIC_DISCORD_CLIENT_ID: clientId, GALACTIC_DISCORD_CLIENT_SECRET: clientSecret } = env;
  const validOrigin = /^https:\/\/[a-z0-9.-]+$/i.test(origin || "") ||
    (!secureCookies && /^http:\/\/127\.0\.0\.1:\d+$/.test(origin || ""));
  const enabled = validOrigin && proxyKey?.length >= 32 && id(clientId) && clientSecret;
  const redirectUri = origin + route + "/auth/callback";
  const display = userId => {
    const user = discordUser(userId);
    return user ? identity(user).name : "Commander " + userId.slice(-6);
  };

  function prune(map, now) {
    for (const [key, value] of map) if (value.expires <= now) map.delete(key);
  }
  function rate(key, limit, res) {
    const now = Date.now();
    if (limits.size >= 10000) prune(limits, now);
    let counter = limits.get(key);
    if (!counter || counter.expires <= now) {
      if (limits.size >= 10000 && !counter) return res.status(429).json({ error: "Command traffic is high. Try again in a minute." });
      counter = { count: 0, expires: now + 60000 };
      limits.set(key, counter);
    }
    if (++counter.count <= limit) return null;
    res.set("Retry-After", String(Math.ceil((counter.expires - now) / 1000)));
    return res.status(429).json({ error: "Too many requests. Try again in a minute." });
  }
  const handle = fn => (req, res, next) => Promise.resolve().then(() => fn(req, res)).catch(next);

  router.use((req, res, next) => {
    res.set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
    if (!enabled) return res.status(503).json({ error: "The game service is being configured." });
    if (!equal(req.get("x-galactic-proxy"), proxyKey)) return res.status(403).json({ error: "Open Galactic Command from its official site." });
    const ip = req.get("x-galactic-client-ip") || "unknown";
    if (rate("ip:" + ip, 240, res)) return;
    next();
  });

  router.get("/auth/login", (req, res) => {
    if (rate("login:" + (req.get("x-galactic-client-ip") || "unknown"), 15, res)) return;
    prune(oauth, Date.now());
    if (oauth.size >= 3000) return res.status(503).json({ error: "Login traffic is high. Try again shortly." });
    const state = nonce();
    oauth.set(state, { expires: Date.now() + 10 * 60000 });
    res.cookie(stateCookie, state, { ...cookieOptions, maxAge: 10 * 60000 });
    const query = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "identify", state });
    res.redirect(303, "https://discord.com/oauth2/authorize?" + query);
  });

  router.get("/auth/callback", handle(async (req, res) => {
    const state = cookie(req, stateCookie);
    res.clearCookie(stateCookie, cookieOptions);
    const pending = oauth.get(state);
    if (state) oauth.delete(state);
    if (!pending || pending.expires <= Date.now() || !equal(req.query.state, state) || typeof req.query.code !== "string") {
      return res.redirect(303, origin + "/?login=retry");
    }
    try {
      const tokenResponse = await request("https://discord.com/api/v10/oauth2/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(8000),
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code: req.query.code,
          grant_type: "authorization_code", redirect_uri: redirectUri })
      });
      if (!tokenResponse.ok) throw Error("Discord token exchange failed");
      const token = await tokenResponse.json();
      if (typeof token.access_token !== "string") throw Error("Discord returned no token");
      const userResponse = await request("https://discord.com/api/v10/users/@me", {
        headers: { Authorization: "Bearer " + token.access_token }, signal: AbortSignal.timeout(8000)
      });
      if (!userResponse.ok) throw Error("Discord identity lookup failed");
      const user = await userResponse.json();
      if (!id(user.id) || typeof user.username !== "string" || user.bot) throw Error("Invalid Discord identity");
      const now = Date.now();
      prune(sessions, now);
      sessions.delete(cookie(req, sessionCookie));
      if (sessions.size >= 5000) return res.redirect(303, origin + "/?login=retry");
      const sessionId = nonce();
      sessions.set(sessionId, { identity: identity(user), csrf: nonce(), expires: now + 12 * hour });
      res.cookie(sessionCookie, sessionId, { ...cookieOptions, maxAge: 12 * hour });
      return res.redirect(303, origin + "/");
    } catch {
      return res.redirect(303, origin + "/?login=retry");
    }
  }));

  router.use((req, res, next) => {
    const token = cookie(req, sessionCookie);
    const session = sessions.get(token);
    if (!session || session.expires <= Date.now()) {
      sessions.delete(token);
      return res.status(401).json({ error: "Sign in with Discord to continue." });
    }
    if (req.method === "POST" && (req.get("origin") !== origin || !equal(req.get("x-csrf-token"), session.csrf))) {
      return res.status(403).json({ error: "Refresh Galactic Command before trying again." });
    }
    if (rate("user:" + session.identity.id, 90, res)) return;
    req.galacticSession = session;
    next();
  });
  router.use(express.json({ limit: "4kb" }));
  router.post("/auth/logout", (req, res) => {
    sessions.delete(cookie(req, sessionCookie));
    res.clearCookie(sessionCookie, cookieOptions);
    res.json({ ok: true });
  });
  router.get("/catalog", (_req, res) => res.json(catalog));

  router.get("/state", handle(async (req, res) => {
    const { identity: account, csrf } = req.galacticSession;
    const view = await game.transact(({ s, player, now }) => {
      const p = player(account.id);
      const participant = (a, b) => a === p.id || b === p.id;
      const tradeCard = (owner, uid) => {
        const owned = s.players[owner]?.cards.find(c => c.uid === uid);
        return owned ? { cardId: owned.cardId, level: owned.level } : null;
      };
      const trades = Object.values(s.trades).filter(t => t.expiresAt > now && participant(t.sender, t.recipient))
        .map(t => ({
          id: t.id, incoming: t.recipient === p.id, expiresAt: t.expiresAt,
          other: display(t.sender === p.id ? t.recipient : t.sender),
          offer: tradeCard(t.sender, t.offerUid),
          wanted: tradeCard(t.recipient, t.wantedUid)
        }));
      const duels = Object.values(s.duels || {}).filter(d => d.expiresAt > now && participant(d.challenger, d.opponent))
        .map(d => ({ id: d.id, incoming: d.opponent === p.id, ranked: d.ranked,
          other: display(d.challenger === p.id ? d.opponent : d.challenger), expiresAt: d.expiresAt }));
      const drop = s.config.activeDrop;
      return {
        account, csrf, now, week: s.week, profile: profileView(p, now), deal: game.dailyDeal(now),
        event: game.currentEvent(now), doubleXp: game.isDoubleXp(now),
        history: s.history.map(w => ({ week: w.week, winners: w.winners.map(x => ({ position: x.position, score: x.score, name: display(x.userId) })) })),
        trades, duels, guild: s.guilds[p.guild] ? structuredClone(s.guilds[p.guild]) : null,
        tradeHistory: [...(p.tradeHistory || []), ...Object.values(s.trades)
          .filter(t => t.expiresAt <= now && t.expiresAt > now - 24 * hour && participant(t.sender, t.recipient))
          .map(t => ({ other: t.sender === p.id ? t.recipient : t.sender, status: "Expired", at: t.expiresAt }))]
          .sort((a, b) => b.at - a.at).slice(0, 12).map(t => ({ name: display(t.other), status: t.status, at: t.at })),
        drop: drop?.messageId && drop.expiresAt > now ? { cardId: drop.cardId, expiresAt: drop.expiresAt,
          remaining: Math.max(0, drop.maxClaims - drop.claimers.length) } : null
      };
    });
    res.json(view);
  }));

  router.get("/leaders", handle(async (req, res) => {
    const metric = pick(["weekScore", "xp", "credits", "raidsWon", "cards", "seasonScore"])(req.query.metric) ? req.query.metric : "weekScore";
    const rows = await game.leaders(metric, 25);
    res.json(rows.map(p => ({ id: p.id, faction: p.faction, name: display(p.id), score: p[metric], league: getLeague(p.weekScore) })));
  }));

  router.get("/guilds", handle(async (_req, res) => {
    const guilds = await game.guildDetails(null);
    res.json(guilds.map(g => ({ name: g.name, faction: g.faction, count: g.members.length, score: g.weekScore })));
  }));

  router.get("/opponent/:id", handle(async (req, res) => {
    const userId = req.galacticSession.identity.id;
    const target = req.params.id;
    if (!id(target) || target === userId) return res.status(400).json({ error: "Choose another commander's Discord ID." });
    const view = await game.transact(({ s, now, player }) => {
      const other = s.players[target];
      if (!other?.faction) return null;
      const p = player(userId);
      const { aScore, dScore } = game.battlePower(p, other, { isRaid: true });
      return { id: other.id, name: display(other.id), faction: other.faction,
        level: game.playerLevel(other.xp), squadSize: other.combat.length, protectionUntil: other.createdAt + 24 * hour,
        raidReadyAt: Math.max(p.lastRaidAt + hour, (p.raidTargets[target] || 0) + 6 * hour),
        ownPower: Math.round(aScore), rivalPower: Math.round(dScore), strong: dScore > aScore * 1.45,
        reserve: p.faction ? reserve(other).map(cardView) : []
      };
    });
    if (!view) return res.status(404).json({ error: "That player hasn't joined Galactic Command." });
    res.json(view);
  }));

  router.post("/action", handle(async (req, res) => {
    const user = req.galacticSession.identity.id;
    const body = req.body;
    const key = req.get("idempotency-key") || "";
    if (!/^(\d{13})-[a-f0-9-]{36}$/.test(key) || !body || Array.isArray(body) || typeof body.action !== "string" ||
        !Object.hasOwn(actions, body.action)) {
      return res.status(400).json({ error: "That command is invalid." });
    }
    const { fields, execute } = actions[body.action];
    const args = {};
    if (Object.keys(body).length !== Object.keys(fields).length + 1) return res.status(400).json({ error: "Check the command details." });
    for (const [name, validate] of Object.entries(fields)) {
      if (!validate(body[name])) return res.status(400).json({ error: "Check the command details." });
      args[name] = body[name];
    }
    const signature = hash(JSON.stringify([body.action, args])).toString("base64url");
    const result = await game.runWebAction(user, key, Number(key.slice(0, 13)), signature, () => execute(user, args));
    if (body.action === "faction" && result.ok) return res.json({ ok: true });
    res.json(result);
  }));

  router.use((_req, res) => res.status(404).json({ error: "That command is unavailable." }));
  router.use((error, _req, res, _next) => {
    if (error.status === 400 || error.status === 413) return res.status(error.status).json({ error: "Check the command details." });
    console.error("[Galactic Web] Request failed:", error.code || error.name);
    res.status(503).json({ error: "Command uplink interrupted. Try again shortly." });
  });
  return router;
}
