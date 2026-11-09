import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { CARD_BY_ID, CRATES, FACTIONS, MISSIONS, QUESTS, RARITIES, dailyContract, drawCard, getCard } from "./galacticCatalog.js";

// New game, new save. Never overwrite the V1 file during the fresh launch.
// Railway exposes the mount path automatically when a persistent volume is attached.
// An explicit TARC_DATA_DIR still takes precedence for existing deployments.
const ROOT = process.env.TARC_DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || "./data";
const FILE = path.join(ROOT, "tarc-galactic-v2.json");
const HOUR = 3600000, DAY = 24 * HOUR;
const STARTING_CREDITS = 1600;
export const ROLL_PRICE = 300;
const PRIZE_TABLE = [{ credits: 7500, packs: 3 }, { credits: 5000, packs: 2 }, { credits: 3000, packs: 1 }];
const BOSS_NAMES = ["Separatist Command Dreadnought", "Mandalorian Warlord", "Rogue MagnaGuard General", "Droid Foundry Titan", "Coruscant Shadow Syndicate"];
let state = null, loading = null, chain = Promise.resolve();

const number = n => Number.isFinite(Number(n)) ? Number(n) : 0;
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const randomInt = (a, b, rng = Math.random) => Math.floor(a + rng() * (b - a + 1));
const utcDay = at => new Date(at).toISOString().slice(0, 10);
const utcMonth = at => utcDay(at).slice(0, 7);
export function utcWeek(at = Date.now()) {
  const d = new Date(at);
  const offset = (d.getUTCDay() + 6) % 7;
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - offset);
  return utcDay(monday);
}
export const playerLevel = xp => Math.max(1, Math.floor(Math.sqrt(Math.max(0, number(xp)) / 140)) + 1);
export const profilePower = (p, type = "combat") => {
  const cards = (p[type] || []).map(uid => p.cards.find(c => c.uid === uid)).filter(Boolean);
  return cards.reduce((sum, owned) => {
    const c = getCard(owned.cardId);
    if (!c) return sum;
    const power = type === "production" ? c.income : c.attack + c.defense;
    return sum + Math.round(power * (1 + (owned.level - 1) * 0.13));
  }, 0);
};
export function hourlyIncome(p) {
  const income = profilePower(p, "production");
  const logistic = 1 + number(p.upgrades.logistics) * 0.09;
  return Math.round(income * logistic * (1 + (p.baseLevel - 1) * 0.045));
}
export function combatStats(p, type = "attack") {
  let attack = 0, defense = 0, tactics = 0, command = 0;
  for (const uid of p.combat) {
    const owned = p.cards.find(c => c.uid === uid), card = owned && getCard(owned.cardId);
    if (!card) continue;
    const scale = 1 + (owned.level - 1) * 0.13;
    const abilityPower = 1 + ((owned.abilityLevel || 1) - 1) * 0.15;
    let a = card.attack * scale, d = card.defense * scale;
    if (card.ability === "assault") a *= 1 + 0.12 * abilityPower;
    if (card.ability === "guardian") d *= 1 + 0.18 * abilityPower;
    if (card.ability === "fortify" && type === "defense") d *= 1 + 0.14 * abilityPower;
    if (card.ability === "ambush" && type === "attack") a *= 1 + 0.17 * abilityPower;
    if (card.ability === "tactics") tactics += 0.07 * abilityPower;
    if (card.ability === "command") command += 0.10 * abilityPower;
    attack += a; defense += d;
  }
  const aura = 1 + Math.min(0.30, tactics + command);
  attack *= aura * (1 + p.upgrades.assault * 0.055);
  defense *= aura * (1 + p.upgrades.fortify * 0.055);
  if (type === "defense") defense *= 1 + (p.baseLevel - 1) * 0.08;
  return { attack: Math.round(attack), defense: Math.round(defense) };
}

function createPlayer(id, now = Date.now()) {
  return {
    id, createdAt: now, updatedAt: now, faction: null, credits: STARTING_CREDITS, xp: 0, scrap: 12,
    cards: [], combat: [], production: [], baseLevel: 1, upgrades: { luck: 0, assault: 0, fortify: 0, logistics: 0 },
    title: "Recruit", dailyAt: 0, dailyStreak: 0, incomeAt: now, raidsWon: 0, raidsLost: 0, duelsWon: 0,
    lastRaidAt: 0, lastDuelAt: 0, raidTargets: {}, missions: {}, eventAt: 0, rolls: 0, packsOpened: 0,
    week: utcWeek(now), weekScore: 0, seasonScore: 0, guild: null, cooldowns: {}, weekRaidTargets: {},
    rankedRating: 1000, rankedWins: 0, rankedLosses: 0, rankedTargets: {},
    questStats: { daily: {}, weekly: {}, monthly: {} }, questClaimed: { daily: [], weekly: [], monthly: [] },
    questKeys: { daily: utcDay(now), weekly: utcWeek(now), monthly: utcMonth(now) },
    rewards: [], auditFlag: false
  };
}
function newState(now = Date.now()) {
  const week=utcWeek(now);
  return {
    version: 2, startedAt: now, week, players: {}, guilds: {}, trades: {}, boss:newBoss(week),
    lastWeekWinners: [], history: [], audit: [],
    config: { dropChannelId: process.env.GALACTIC_DROP_CHANNEL_ID || "", nextDropAt: now + 45 * 60000, activeDrop: null, announcedEvent: "", announcedWeek: "" }
  };
}
function newBoss(week) {
  const n=[...week].reduce((v,ch)=>v+ch.charCodeAt(0),0);
  return { week, name:BOSS_NAMES[n%BOSS_NAMES.length], hp:30000, maxHp:30000, contributors:{}, defeated:false };
}
async function readState() {
  if (state) return state;
  if (!loading) loading = (async () => {
    try {
      const data = JSON.parse(await fs.readFile(FILE, "utf8"));
      if (data.version !== 2 || !data.players || !data.config) throw Error("Unexpected game save schema");
      state = data;
      state.boss ||= newBoss(state.week);
      state.config.announcedWeek ??= "";
    } catch (error) {
      if (error.code !== "ENOENT") throw new Error(`Galactic Command could not load its save (not resetting): ${error.message}`);
      state = newState();
    }
    return state;
  })();
  try { return await loading; } catch (err) { loading = null; throw err; }
}
async function persist() {
  await fs.mkdir(ROOT, { recursive: true });
  const temporary = `${FILE}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(state), { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporary, FILE);
}
function ensurePlayer(s, id, now) {
  if (!s.players[id]) s.players[id] = createPlayer(id, now);
  const p = s.players[id];
  for (const period of ["daily", "weekly", "monthly"]) {
    const key = period === "daily" ? utcDay(now) : period === "weekly" ? utcWeek(now) : utcMonth(now);
    if (p.questKeys[period] !== key) {
      p.questKeys[period] = key;
      p.questStats[period] = {};
      p.questClaimed[period] = [];
    }
  }
  // Production pays automatically whenever this profile is accessed. Players
  // never need to press a separate Claim Income button.
  settleIncome(p, now);
  return p;
}
function settleIncome(p, now) {
  if (!p.faction) { p.incomeAt = now; return 0; }
  const elapsed = Math.min(12 * HOUR, Math.max(0, now - number(p.incomeAt || now)));
  const credits = Math.floor(hourlyIncome(p) * elapsed / HOUR);
  if (credits > 0) {
    award(p, { credits });
    record(p, "income");
  }
  // Keep the fraction of an hour when under the 12-hour offline limit so that
  // checking a profile frequently never wipes away small earnings.
  const rate = hourlyIncome(p);
  const consumed = rate > 0 ? credits * HOUR / rate : 0;
  p.incomeAt = elapsed >= 12 * HOUR ? now : Math.min(now, number(p.incomeAt || now) + consumed);
  return credits;
}
function award(p, { credits = 0, xp = 0, scrap = 0, points = 0 } = {}) {
  p.credits = Math.max(0, p.credits + Math.round(credits));
  p.xp = Math.max(0, p.xp + Math.round(xp));
  p.scrap = Math.max(0, p.scrap + Math.round(scrap));
  p.weekScore = Math.max(0, p.weekScore + Math.round(points));
  p.seasonScore = Math.max(0, p.seasonScore + Math.round(points));
}
function record(p, action, count = 1) {
  for (const scope of ["daily", "weekly", "monthly"]) p.questStats[scope][action] = (p.questStats[scope][action] || 0) + count;
}
function addCard(p, cardId, source = "roll") {
  const card = getCard(cardId);
  if (!card) throw new Error(`Unknown card: ${cardId}`);
  const owned = { uid: randomUUID().slice(0, 8), cardId, level: 1, abilityLevel: 1, acquiredAt: Date.now(), source };
  p.cards.push(owned);
  return owned;
}
function rotateWeek(s, now) {
  const current = utcWeek(now);
  if (s.week >= current) return;
  // Results are based on active weekly play, not lifetime Credit balances.
  const ranking = Object.values(s.players).filter(p => !p.auditFlag).sort((a,b) => b.weekScore - a.weekScore).filter(p => p.weekScore >= 25);
  s.lastWeekWinners = ranking.slice(0, 10).map((p,i) => ({ userId: p.id, position: i + 1, score: p.weekScore, week: s.week }));
  for (const [i,winner] of s.lastWeekWinners.entries()) {
    const prize = PRIZE_TABLE[i];
    if (!prize) break;
    const p = s.players[winner.userId];
    award(p, { credits: prize.credits, xp: (3-i) * 350 });
    for (let j = 0; j < prize.packs; j++) addCard(p, drawCard("elite", p.upgrades.luck).id, "weekly-prize");
    p.rewards.push({ week: s.week, position: i + 1, credits: prize.credits, packs: prize.packs, fulfilledPhysical: false });
  }
  for (const p of Object.values(s.players)) {
    p.week = current; p.weekScore = 0; p.auditFlag = false;
    p.weekRaidTargets = {};
    p.questKeys.weekly = current; p.questStats.weekly = {}; p.questClaimed.weekly = [];
  }
  for (const g of Object.values(s.guilds)) g.weekScore = 0;
  // Remove timed-out offers so unattended deployments don't accumulate old interactions forever.
  s.duels = {};
  s.trades = {};
  s.history.unshift({ week: s.week, winners: s.lastWeekWinners });
  s.history = s.history.slice(0, 24);
  s.week = current;
  s.boss = newBoss(current);
}
// All actions, including two-player actions, are serialized before their first await.
export async function transact(callback, now = Date.now()) {
  await readState();
  const job = chain.then(async () => {
    rotateWeek(state, now);
    const result = await callback({ s: state, player: id => ensurePlayer(state, String(id), now), now });
    await persist();
    return result;
  });
  chain = job.catch(() => {});
  return job;
}
export async function snapshot(userId) {
  return transact(({ s, player }) => ({ profile: structuredClone(player(userId)),
    week: s.week, lastWeekWinners: s.lastWeekWinners, boss:structuredClone(s.boss), config: structuredClone(s.config),
    totalPlayers: Object.keys(s.players).length }));
}
export async function bossSnapshot() { return transact(({s})=>structuredClone(s.boss)); }
export async function attackBoss(userId) {
  return transact(({s,player,now})=>{
    const p=player(userId),boss=s.boss;
    if (!p.faction || !p.combat.length) return {ok:false,error:"Choose a faction and deploy a squad first."};
    if (boss.defeated) return {ok:false,error:"This week's boss has been defeated. A new boss appears next Monday."};
    if (now-number(p.cooldowns.bossAttack)<30*60000) return {ok:false,error:`You can fight the boss again <t:${Math.floor((p.cooldowns.bossAttack+30*60000)/1000)}:R>.`};
    p.cooldowns.bossAttack=now;
    const {attack,defense}=combatStats(p),damage=Math.max(25,Math.round(attack*0.65+defense*0.18+randomInt(10,90)));
    boss.hp=Math.max(0,boss.hp-damage);
    boss.contributors[p.id]=(boss.contributors[p.id]||0)+damage;
    addActionReward(p,"boss",{credits:Math.round(damage*0.7),xp:100,points:18,scrap:3},now);
    if (p.guild && s.guilds[p.guild]) s.guilds[p.guild].weekScore+=8;
    let awards=[];
    if (boss.hp===0) {
      boss.defeated=true;
      const ranking=Object.entries(boss.contributors).sort((a,b)=>b[1]-a[1]);
      awards=ranking.slice(0,3).map(([id,points],i)=>{
        const winner=player(id),rarity=i===0?"legendary":"elite";
        const card=drawCard(rarity,winner.upgrades.luck);
        addCard(winner,card.id,"weekly-boss");
        award(winner,{credits:3000-i*750,xp:500-i*100,points:60-i*10});
        return {userId:id,card:card.name,contribution:points};
      });
      for(const [id] of ranking.slice(3)) award(player(id),{credits:500,xp:150,points:15});
    }
    return {ok:true,damage,hp:boss.hp,maxHp:boss.maxHp,defeated:boss.defeated,awards};
  });
}
export async function leaders(metric = "weekScore", limit = 10) {
  const allowed = new Set(["weekScore", "xp", "credits", "raidsWon", "cards", "seasonScore"]);
  return transact(({ s }) => Object.values(s.players).filter(p => p.faction && !p.auditFlag)
    .sort((a,b) => (allowed.has(metric) ? (metric === "cards" ? b.cards.length - a.cards.length : number(b[metric]) - number(a[metric])) : b.weekScore - a.weekScore))
    .slice(0, limit).map(p => ({ id: p.id, faction: p.faction, weekScore: p.weekScore, xp: p.xp, credits: p.credits, cards: p.cards.length, raidsWon: p.raidsWon, seasonScore: p.seasonScore })));
}
export function isDoubleXp(now = Date.now()) { const day = new Date(now).getUTCDay(); return (day === 6 || day === 0); }
export function currentEvent(now = Date.now()) {
  const id = Math.floor(now / (4 * HOUR));
  const names = ["Droid Invasion", "Coruscant Bomb Threat", "VIP Escort Emergency", "Black Market Surge", "Fleet Defence", "Mandalorian Incursion"];
  return { id, name: names[id % names.length], active: now % (4 * HOUR) < HOUR, multiplier: 1.5 };
}
function xpMultiplier(now) { return isDoubleXp(now) ? 2 : 1; }
function addActionReward(p, action, rewards, now, { quest = true } = {}) {
  const actual = { ...rewards, xp: Math.round((rewards.xp || 0) * xpMultiplier(now)) };
  award(p, actual);
  if (quest) record(p, action);
  return actual;
}
export function activeQuests(p, period, now = Date.now()) {
  const key = period === "daily" ? utcDay(now) : period === "weekly" ? utcWeek(now) : utcMonth(now);
  let seed = [...`${period}:${key}`].reduce((n,c) => ((n * 31 + c.charCodeAt(0)) >>> 0), 17);
  const list = [...QUESTS];
  for (let i = list.length - 1; i > 0; i--) { seed = (seed * 1664525 + 1013904223) >>> 0; const j = seed % (i + 1); [list[i], list[j]] = [list[j], list[i]]; }
  const multiplier = period === "daily" ? 1 : period === "weekly" ? 3 : 8;
  const count = period === "daily" ? 3 : period === "weekly" ? 5 : 7;
  return list.slice(0, count).map(q => ({ ...q, target: q.target * multiplier, credits: q.credits * multiplier, xp: q.xp * multiplier,
    progress: number(p.questStats[period]?.[q.action]), claimed: p.questClaimed[period]?.includes(q.id) || false }));
}

export async function chooseFaction(userId, faction) {
  return transact(({ player }) => {
    const p = player(userId);
    if (!FACTIONS[faction]) return { ok: false, error: "Choose Republic, CIS or Independent." };
    if (p.faction) return { ok: false, error: "Your faction is already chosen. Start a new game only through ownership." };
    p.faction = faction;
    // Five guaranteed starters give players a ready squad and functioning outpost.
    const starters = [...CARD_BY_ID.values()].filter(c => c.faction === faction && c.rarity === "Common");
    for (let i = 0; i < 5; i++) {
      const card = starters[i % starters.length];
      const owned = addCard(p, card.id, "starter");
      if (i < 3) p.combat.push(owned.uid); else p.production.push(owned.uid);
    }
    return { ok: true, profile: structuredClone(p) };
  });
}

export async function roll(userId, crateId = "single", { free = false } = {}) {
  return transact(({ player, now }) => {
    const p = player(userId);
    if (!p.faction) return { ok: false, error: "Choose your faction with /game first." };
    const crate = CRATES[crateId === "single" ? "standard" : crateId];
    if (!crate) return { ok: false, error: "Unknown crate." };
    const cost = free ? 0 : crateId === "single" ? ROLL_PRICE : crate.price;
    if (p.credits < cost) return { ok: false, error: `You need ${cost.toLocaleString("en-GB")} Credits. Complete missions or claim your daily reward.` };
    // Players can roll repeatedly as long as they have enough Credits.
    p.credits -= cost; p.cooldowns.roll = now;
    const found = [];
    for (let i = 0; i < (crateId === "single" ? 1 : crate.count); i++) {
      const card = drawCard(crateId === "single" ? "standard" : crateId, p.upgrades.luck);
      const owned = addCard(p, card.id, crateId);
      found.push({ ...card, uid: owned.uid });
    }
    if (crateId === "single") { p.rolls++; record(p, "roll"); }
    else { p.packsOpened++; record(p, "crate"); }
    const today = utcDay(now);
    if (p.cooldowns.rollPointsDay !== today) { p.cooldowns.rollPointsDay = today; p.cooldowns.rollPoints = 0; }
    const availablePoints = Math.max(0, 10 - p.cooldowns.rollPoints);
    const points = Math.min(availablePoints, Math.min(5, found.length * 2));
    p.cooldowns.rollPoints += points;
    award(p, { xp: 15 * (crateId === "single" ? 1 : 3) * xpMultiplier(now), points });
    return { ok: true, found, spent: cost, credits: p.credits };
  });
}

export function dailyDeal(now=Date.now()) {
  const ids=["republic","cis","outlaw","standard","elite"];
  const key=utcDay(now);
  const value=[...key].reduce((sum,ch)=>sum+ch.charCodeAt(0),0);
  const id=ids[value%ids.length];
  return { id, crate:CRATES[id], price:Math.round(CRATES[id].price*0.7), key };
}
export async function buyDailyDeal(userId) {
  return transact(({player,now})=>{
    const p=player(userId),offer=dailyDeal(now);
    if (!p.faction) return {ok:false,error:"Choose a faction first."};
    if (p.cooldowns.dailyDeal===offer.key) return {ok:false,error:"You've already bought today's special offer."};
    if (p.credits<offer.price) return {ok:false,error:`Today's offer costs ${offer.price} Credits.`};
    p.credits-=offer.price;p.cooldowns.dailyDeal=offer.key;p.packsOpened++;
    const found=[];
    for(let i=0;i<offer.crate.count;i++){
      const card=drawCard(offer.id,p.upgrades.luck),owned=addCard(p,card.id,"daily-deal");
      found.push({...card,uid:owned.uid});
    }
    addActionReward(p,"crate",{xp:50,points:4},now);
    return {ok:true,found,spent:offer.price};
  });
}

export async function daily(userId) {
  return transact(({ player, now }) => {
    const p = player(userId);
    if (!p.faction) return { ok: false, error: "Choose a faction first." };
    if (now - p.dailyAt < 20 * HOUR) return { ok: false, error: `Next daily pack <t:${Math.floor((p.dailyAt + 20 * HOUR)/1000)}:R>.` };
    p.dailyStreak = now - p.dailyAt <= 48 * HOUR ? p.dailyStreak + 1 : 1;
    p.dailyAt = now;
    const bonus = Math.min(7, p.dailyStreak) * 80;
    addActionReward(p, "daily", { credits: 400 + bonus, xp: 100, scrap: 3, points: 10 }, now);
    const card = drawCard(p.faction === "independent" ? "outlaw" : p.faction, p.upgrades.luck);
    const owned = addCard(p, card.id, "daily");
    return { ok: true, streak: p.dailyStreak, credits: 400 + bonus, card: { ...card, uid: owned.uid } };
  });
}

export async function claimIncome(userId) {
  return transact(({ player, now }) => {
    const p = player(userId);
    return { ok: true, credits: 0, rate: hourlyIncome(p), automatic: true };
  });
}

export const combatSlots = p => Math.min(8, 3 + Math.floor(p.baseLevel / 3));
export const productionSlots = p => Math.min(8, 2 + Math.floor(p.baseLevel / 2));
export async function assignCard(userId, uid, role) {
  return transact(({ player }) => {
    const p = player(userId);
    if (!p.cards.some(c => c.uid === uid)) return { ok: false, error: "That card isn't in your collection." };
    if (!["combat", "production", "reserve"].includes(role)) return { ok: false, error: "Invalid card assignment." };
    const remainingCombat = p.combat.filter(x => x !== uid);
    const remainingProduction = p.production.filter(x => x !== uid);
    if (role === "combat" && remainingCombat.length >= combatSlots(p)) return { ok: false, error: "Squad is full. Upgrade your base or put a card in reserve." };
    if (role === "production" && remainingProduction.length >= productionSlots(p)) return { ok: false, error: "Production is full. Upgrade your base or put a card in reserve." };
    // Income is settled by ensurePlayer before changing the production rate.
    p.incomeAt = Date.now(); p.combat = remainingCombat; p.production = remainingProduction;
    if (role === "combat") p.combat.push(uid);
    if (role === "production") p.production.push(uid);
    return { ok: true, role };
  });
}

export async function upgradeCard(userId, uid, fuse = false) {
  return transact(({ player, now }) => {
    const p = player(userId), owned = p.cards.find(c => c.uid === uid);
    if (!owned) return { ok: false, error: "Card not found." };
    if (owned.level >= 20) return { ok: false, error: "This card is already level 20." };
    const card = getCard(owned.cardId);
    const cost = Math.round(260 * owned.level * RARITIES[card.rarity].multiplier);
    const scrap = Math.max(1, Math.ceil(owned.level / 2));
    if (fuse) {
      const duplicate = p.cards.find(c => c.uid !== uid && c.cardId === owned.cardId && !p.combat.includes(c.uid) && !p.production.includes(c.uid));
      if (!duplicate) return { ok: false, error: "You need an unequipped duplicate to fuse." };
      p.cards = p.cards.filter(c => c.uid !== duplicate.uid);
      owned.level = Math.min(20, owned.level + 2);
    } else {
      if (p.credits < cost || p.scrap < scrap) return { ok: false, error: `Need ${cost} Credits and ${scrap} Scrap for the upgrade.` };
      p.credits -= cost; p.scrap -= scrap; owned.level++;
    }
    if (p.production.includes(uid)) p.incomeAt = now;
    record(p, "upgrade"); award(p, { xp: 55 * xpMultiplier(now), points: 4 });
    return { ok: true, level: owned.level, card };
  });
}

export async function recycleCard(userId, uid) {
  return transact(({player}) => {
    const p = player(userId), owned = p.cards.find(c => c.uid === uid);
    if (!owned) return {ok:false,error:"That card is no longer in your collection."};
    if (p.combat.includes(uid) || p.production.includes(uid))
      return {ok:false,error:"Move this card to Storage before recycling it."};
    const card = getCard(owned.cardId);
    if (!card) return {ok:false,error:"That card is no longer available."};
    const scrap = Math.max(1,Math.round(RARITIES[card.rarity].multiplier * 2));
    p.cards = p.cards.filter(c=>c.uid!==uid);
    award(p,{scrap});
    return {ok:true,scrap,name:card.name};
  });
}

export async function trainAbility(userId, uid) {
  return transact(({ player, now }) => {
    const p=player(userId), owned=p.cards.find(c=>c.uid===uid);
    if (!owned) return { ok:false,error:"Card not found." };
    const card=getCard(owned.cardId), rank=owned.abilityLevel||1;
    if (rank>=5) return { ok:false,error:"Ability is already max level." };
    const cost=Math.round(800*rank*RARITIES[card.rarity].multiplier),scrap=rank*4;
    if (p.credits<cost||p.scrap<scrap) return { ok:false,error:`Ability training requires ${cost} Credits and ${scrap} Scrap.` };
    p.credits-=cost;p.scrap-=scrap;owned.abilityLevel=rank+1;
    addActionReward(p,"upgrade",{xp:90,points:5},now);
    return {ok:true,level:owned.abilityLevel};
  });
}

export async function upgradeBase(userId) {
  return transact(({ player, now }) => {
    const p = player(userId), cost = p.baseLevel * 1500, scrap = p.baseLevel * 4;
    if (!p.faction) return { ok: false, error: "Choose your faction first." };
    if (p.baseLevel >= 30) return { ok: false, error: "Your base is fully upgraded." };
    if (p.credits < cost || p.scrap < scrap) return { ok: false, error: `Base level ${p.baseLevel + 1} requires ${cost} Credits and ${scrap} Scrap.` };
    p.incomeAt = now; p.credits -= cost; p.scrap -= scrap; p.baseLevel++;
    addActionReward(p, "base", { xp: 120, points: 12 }, now);
    return { ok: true, level: p.baseLevel };
  });
}

export async function upgradeAttribute(userId, type) {
  return transact(({ player, now }) => {
    const p = player(userId);
    if (!Object.hasOwn(p.upgrades, type)) return { ok: false, error: "Unknown upgrade." };
    const rank = p.upgrades[type];
    if (rank >= 10) return { ok: false, error: "This upgrade is maxed." };
    const cost = Math.round(700 * (rank + 1) ** 1.45);
    if (p.credits < cost) return { ok: false, error: `Need ${cost} Credits.` };
    p.credits -= cost; p.upgrades[type]++;
    if (type === "logistics") p.incomeAt = now;
    addActionReward(p, "upgrade", { xp: 75, points: 6 }, now);
    return { ok: true, rank: p.upgrades[type], cost };
  });
}

export async function salvage(userId) {
  return transact(({ player, now }) => {
    const p = player(userId);
    if (!p.faction) return { ok: false, error: "Choose your faction first." };
    if (now - number(p.cooldowns.salvage) < 15 * 60000) return { ok: false, error: `Salvage available <t:${Math.floor((p.cooldowns.salvage + 15 * 60000)/1000)}:R>.` };
    p.cooldowns.salvage = now;
    const scrap = randomInt(3, 7);
    addActionReward(p, "salvage", { credits: 85, xp: 45, scrap, points: 3 }, now);
    return { ok: true, scrap };
  });
}

export async function runMission(userId, missionId, { event = false } = {}) {
  return transact(({ s, player, now }) => {
    const p = player(userId), m = missionId==="contract" ? dailyContract(now) : MISSIONS.find(x => x.id === missionId);
    if (!p.faction || !p.combat.length) return { ok: false, error: "Deploy a combat squad first." };
    if (!m) return { ok: false, error: "Unknown mission." };
    const eventInfo = currentEvent(now);
    if (event && !eventInfo.active) return { ok: false, error: "The dynamic event is not active. Another begins soon." };
    const wait = event ? 30 * 60000 - (now - p.eventAt) : m.cooldown - (now - number(p.missions[m.id]));
    if (wait > 0) return { ok: false, error: `Available <t:${Math.floor((now + wait) / 1000)}:R>.` };
    const { attack, defense } = combatStats(p);
    const chance = clamp(0.28 + (attack + defense * 0.35) / (m.difficulty * 3.5), 0.29, 0.93);
    const win = Math.random() < chance;
    const extra = event ? 1.5 : 1;
    const guildBonus = p.guild && s.guilds[p.guild]?.upgrades?.economy ? 1 + s.guilds[p.guild].upgrades.economy * 0.04 : 1;
    const credits = Math.round(randomInt(...m.credits) * (win ? 1 : 0.2) * extra * guildBonus);
    const xp = Math.round(m.xp * (win ? 1 : 0.4) * extra);
    const scrap = Math.max(1, Math.round(m.scrap * (win ? 1 : 0.25)));
    const points = win ? (event ? 24 : 10) : 3;
    addActionReward(p, event ? "event" : "mission", { credits, xp, scrap, points }, now);
    if (event) p.eventAt = now; else p.missions[m.id] = now;
    return { ok: true, win, name: event ? eventInfo.name : m.name, credits, xp: xp * xpMultiplier(now), scrap, points, chance };
  });
}

export async function claimQuest(userId, period, questId) {
  return transact(({ player, now }) => {
    const p = player(userId);
    if (!["daily", "weekly", "monthly"].includes(period)) return { ok: false, error: "Invalid quest period." };
    const q = activeQuests(p, period, now).find(q => q.id === questId);
    if (!q) return { ok: false, error: "Quest isn't active." };
    if (q.claimed) return { ok: false, error: "Quest already claimed." };
    if (q.progress < q.target) return { ok: false, error: `Progress ${q.progress}/${q.target}.` };
    p.questClaimed[period].push(questId);
    const points = period === "daily" ? 10 : period === "weekly" ? 45 : 100;
    const rewards = addActionReward(p, "quest", { credits: q.credits, xp: q.xp, scrap: period === "daily" ? 2 : 10, points }, now);
    return { ok: true, rewards, points, quest: q };
  });
}

export async function awardQuizTraining(userId, correct = 0) {
  // Quiz is now an optional source of V2 XP/Credits, with a daily cap on weekly points.
  return transact(({ player, now }) => {
    const p = player(userId);
    if (!p.faction) return { ok: false };
    const day = utcDay(now);
    if (p.cooldowns.quizDay !== day) { p.cooldowns.quizDay = day; p.cooldowns.quizzesToday = 0; }
    const points = p.cooldowns.quizzesToday < 3 ? Math.min(12, correct * 2) : 0;
    p.cooldowns.quizzesToday++;
    addActionReward(p, "quiz", { credits: correct * 35, xp: correct * 20, points }, now);
    return { ok: true, points };
  });
}

function battleAttack(attacker, defender, { isRaid = false } = {}) {
  const a = combatStats(attacker, "attack"), d = combatStats(defender, "defense");
  const base = isRaid ? 1 : 0.7;
  const aScore = a.attack + a.defense * 0.22;
  const dScore = d.defense + d.attack * base * 0.35;
  const aRoll = aScore * (0.82 + Math.random() * 0.35);
  const dRoll = dScore * (0.85 + Math.random() * 0.3);
  return { win: aRoll >= dRoll, attackerPower: Math.round(aScore), defenderPower: Math.round(dScore), attackRoll: Math.round(aRoll), defenseRoll: Math.round(dRoll) };
}

export async function raid(attackerId, defenderId) {
  return transact(({ s, player, now }) => {
    if (String(attackerId) === String(defenderId)) return { ok: false, error: "You cannot raid yourself." };
    if (!s.players[String(defenderId)]?.faction) return { ok: false, error: "That player needs to join Galactic Command first." };
    const p = player(attackerId), d = player(defenderId);
    if (!p.faction || p.combat.length === 0) return { ok: false, error: "Choose a faction and deploy a combat squad." };
    if (now - d.createdAt < DAY) return { ok: false, error: "New outposts have 24 hours of raid protection." };
    if (now - p.lastRaidAt < 60 * 60000) return { ok: false, error: `You can raid again <t:${Math.floor((p.lastRaidAt + 60 * 60000)/1000)}:R>.` };
    if (now - number(p.raidTargets[defenderId]) < 6 * HOUR) return { ok: false, error: "You have already raided this outpost recently. Pick another target." };
    const result = battleAttack(p, d, { isRaid: true });
    p.lastRaidAt = now; p.raidTargets[defenderId] = now;
    for (const [id,at] of Object.entries(p.raidTargets)) if (at < now - 12 * HOUR) delete p.raidTargets[id];
    p.raidsWon += Number(result.win); p.raidsLost += Number(!result.win);
    const firstWeeklyRaid = !p.weekRaidTargets[defenderId];
    p.weekRaidTargets[defenderId] = now;
    const points = result.win ? (firstWeeklyRaid ? 42 : 8) : (firstWeeklyRaid ? 6 : 1);
    const rewards = addActionReward(p, "raid", { credits: result.win ? 450 + d.baseLevel * 55 : 85,
      xp: result.win ? 200 : 65, scrap: result.win ? 5 : 1, points }, now);
    if (result.win) record(p, "win");
    // Defenders lose no cards or cash: progression isn't punished while offline.
    if (!result.win) award(d, { xp: 45 });
    if (p.guild && s.guilds[p.guild]) s.guilds[p.guild].weekScore += result.win ? 20 + (s.guilds[p.guild].upgrades?.war || 0)*2 : 2;
    return { ok: true, ...result, rewards, attackerFaction: p.faction, defenderFaction: d.faction, defenderBase: d.baseLevel };
  });
}

export async function proposeDuel(challengerId, opponentId, ranked = false) {
  return transact(({ s, player, now }) => {
    if (String(challengerId) === String(opponentId)) return { ok: false, error: "Choose another player." };
    if (!s.players[String(opponentId)]?.faction) return { ok: false, error: "That player needs to join Galactic Command first." };
    const p = player(challengerId);
    if (!p.faction || !p.combat.length) return { ok: false, error: "Deploy a combat squad first." };
    if (now - number(p.cooldowns.lastChallenge) < 60000) return { ok: false, error: "Wait a minute before challenging again." };
    p.cooldowns.lastChallenge = now;
    s.duels ||= {};
    const id = randomUUID().slice(0, 10);
    s.duels[id] = { id, challenger: String(challengerId), opponent: String(opponentId), ranked: Boolean(ranked), expiresAt: now + 5 * 60000 };
    return { ok: true, id };
  });
}
export async function answerDuel(duelId, userId, accept) {
  return transact(({ s, player, now }) => {
    const duel = s.duels?.[duelId];
    if (!duel) return { ok: false, error: "Duel expired or already resolved." };
    if (duel.opponent !== String(userId)) return { ok: false, error: "Only the challenged player can accept." };
    if (!accept) { delete s.duels[duelId]; return { ok: true, declined: true }; }
    if (now > duel.expiresAt) return { ok: false, error: "The challenge has expired." };
    const p = player(duel.challenger), d = player(duel.opponent);
    if (!p.combat.length || !d.combat.length) return { ok: false, error: "Both players need deployed squads." };
    if (now - p.lastDuelAt < 10 * 60000 || now - d.lastDuelAt < 10 * 60000) return { ok: false, error: "A player is on duel cooldown." };
    if (duel.ranked) {
      const day=utcDay(now);
      if (p.rankedTargets[`${day}:${d.id}`] || d.rankedTargets[`${day}:${p.id}`])
        return { ok:false,error:"Ranked matches against the same opponent are limited to once daily." };
    }
    delete s.duels[duelId]; p.lastDuelAt = now; d.lastDuelAt = now;
    const result = battleAttack(p,d);
    const victor = result.win ? p : d, loser = result.win ? d : p;
    victor.duelsWon++;
    let ratingChange=0;
    if (duel.ranked) {
      const key=`${utcDay(now)}:${loser.id}`;
      const otherKey=`${utcDay(now)}:${victor.id}`;
      victor.rankedTargets[key]=now;loser.rankedTargets[otherKey]=now;
      ratingChange=22;
      victor.rankedRating+=22;loser.rankedRating=Math.max(100,loser.rankedRating-18);
      victor.rankedWins++;loser.rankedLosses++;
    }
    addActionReward(victor, "duel", { credits: 180, xp: 110, points: 15 }, now);
    addActionReward(loser, "duel", { credits: 65, xp: 45, points: 4 }, now);
    return { ok: true, ...result, winner: victor.id, loser: loser.id, ranked:duel.ranked, ratingChange };
  });
}

export async function proposeTrade(senderId, recipientId, offerUid, wantedUid) {
  return transact(({ s, player, now }) => {
    if (String(senderId) === String(recipientId)) return { ok: false, error: "You cannot trade with yourself." };
    if (!s.players[String(recipientId)]?.faction) return { ok: false, error: "That user hasn't joined the game." };
    const sender = player(senderId), recipient = player(recipientId);
    const offer = sender.cards.find(c => c.uid === offerUid), wanted = recipient.cards.find(c => c.uid === wantedUid);
    if (!offer || !wanted) return { ok: false, error: "Both players must own the exact card IDs provided. See /cards." };
    if (sender.combat.includes(offerUid) || sender.production.includes(offerUid) || recipient.combat.includes(wantedUid) || recipient.production.includes(wantedUid))
      return { ok: false, error: "Both cards must be in reserve. Use /cards to unassign them first." };
    if (now - number(sender.cooldowns.tradeOffer) < 30000) return { ok: false, error: "Wait 30 seconds before requesting another trade." };
    sender.cooldowns.tradeOffer = now;
    const id = randomUUID().slice(0, 10);
    s.trades[id] = { id, sender: sender.id, recipient: recipient.id, offerUid, wantedUid, expiresAt: now + 10 * 60000 };
    return { ok: true, id, offer: getCard(offer.cardId), wanted: getCard(wanted.cardId) };
  });
}
export async function answerTrade(tradeId, userId, accept) {
  return transact(({ s, player, now }) => {
    const trade = s.trades[tradeId];
    if (!trade) return { ok: false, error: "Trade expired or already resolved." };
    if (trade.recipient !== String(userId)) return { ok: false, error: "Only the other trader can respond." };
    delete s.trades[tradeId];
    if (!accept) return { ok: true, declined: true };
    if (now > trade.expiresAt) return { ok: false, error: "This offer expired." };
    const a = player(trade.sender), b = player(trade.recipient);
    const ac = a.cards.find(c => c.uid === trade.offerUid), bc = b.cards.find(c => c.uid === trade.wantedUid);
    if (!ac || !bc || a.combat.includes(ac.uid) || a.production.includes(ac.uid) || b.combat.includes(bc.uid) || b.production.includes(bc.uid))
      return { ok: false, error: "The cards were moved or equipped. Trade cancelled." };
    a.cards = a.cards.filter(c => c.uid !== ac.uid); b.cards = b.cards.filter(c => c.uid !== bc.uid);
    a.cards.push(bc); b.cards.push(ac);
    record(a,"trade"); record(b,"trade");
    return { ok: true, from: ac.cardId, to: bc.cardId, sender: a.id, recipient: b.id };
  });
}

export async function createGuild(userId, name) {
  return transact(({ s, player }) => {
    const p = player(userId), title = String(name).trim().replace(/\s+/g," ");
    if (!p.faction) return { ok: false, error: "Join a faction first." };
    if (p.guild) return { ok: false, error: "Leave your current guild first." };
    if (!/^[\w '-]{3,28}$/.test(title)) return { ok: false, error: "Guild names need 3–28 letters, numbers or spaces." };
    if (p.credits < 10000) return { ok: false, error: "Creating a guild costs 10,000 Credits." };
    if (Object.values(s.guilds).some(g => g.name.toLowerCase() === title.toLowerCase())) return { ok: false, error: "That guild name is taken." };
    p.credits -= 10000;
    const code = randomUUID().slice(0, 6).toUpperCase();
    s.guilds[code] = { code, name: title, ownerId: p.id, faction: p.faction, members: [p.id], treasury: 0, weekScore: 0, upgrades:{economy:0,war:0} };
    p.guild = code;
    return { ok: true, guild: structuredClone(s.guilds[code]) };
  });
}
export async function joinGuild(userId, code) {
  return transact(({ s, player }) => {
    const p = player(userId), guild = s.guilds[String(code || "").toUpperCase()];
    if (!p.faction) return { ok: false, error: "Choose a faction first." };
    if (p.guild) return { ok: false, error: "Leave your current guild first." };
    if (!guild) return { ok: false, error: "Guild code not found." };
    if (guild.members.length >= 20) return { ok: false, error: "Guild is full (20 members)." };
    guild.members.push(p.id); p.guild = guild.code;
    return { ok: true, guild: structuredClone(guild) };
  });
}
export async function leaveGuild(userId) {
  return transact(({ s, player }) => {
    const p = player(userId), guild = s.guilds[p.guild];
    if (!guild) return { ok: false, error: "You're not in a guild." };
    if (guild.ownerId === p.id && guild.members.length > 1) return { ok: false, error: "Guild owner must transfer ownership before leaving a non-empty guild." };
    guild.members = guild.members.filter(id => id !== p.id); p.guild = null;
    if (guild.members.length === 0) delete s.guilds[guild.code];
    return { ok: true };
  });
}
export async function donateGuild(userId, amount) {
  return transact(({ s, player }) => {
    const p = player(userId), guild = s.guilds[p.guild];
    if (!guild) return { ok: false, error: "You're not in a guild." };
    if (!Number.isSafeInteger(amount) || amount < 100 || amount > 20000 || p.credits < amount) return { ok: false, error: "Donate 100–20,000 Credits you own." };
    p.credits -= amount; guild.treasury += amount;
    return { ok: true, treasury: guild.treasury };
  });
}
export async function researchGuild(userId, type) {
  return transact(({s,player})=>{
    const p=player(userId),g=s.guilds[p.guild];
    if (!g || g.ownerId!==p.id) return {ok:false,error:"Only the guild owner can spend guild treasury."};
    if (!["economy","war"].includes(type)) return {ok:false,error:"Choose economy or war research."};
    const level=g.upgrades[type];
    if (level>=10) return {ok:false,error:"Guild research is maxed."};
    const cost=(level+1)*2500;
    if (g.treasury<cost) return {ok:false,error:`Guild treasury requires ${cost} Credits.`};
    g.treasury-=cost;g.upgrades[type]++;
    return {ok:true,level:g.upgrades[type],type};
  });
}
export async function transferGuild(userId, recipientId) {
  return transact(({s,player})=>{
    const p=player(userId),g=s.guilds[p.guild];
    if (!g || g.ownerId!==p.id) return {ok:false,error:"Only the guild owner can transfer ownership."};
    if (!g.members.includes(String(recipientId))) return {ok:false,error:"Recipient must already be a guild member."};
    if (p.id===String(recipientId)) return {ok:false,error:"You already own this guild."};
    g.ownerId=String(recipientId);return {ok:true};
  });
}
export async function guildDetails(code) {
  return transact(({ s }) => code ? structuredClone(s.guilds[code] || null) : Object.values(s.guilds).sort((a,b)=>b.weekScore-a.weekScore).slice(0,10).map(g=>structuredClone(g)));
}

export async function configureDropChannel(channelId, actor) {
  return transact(({ s }) => {
    s.config.dropChannelId = channelId || "";
    s.config.nextDropAt = Date.now() + 3 * 60000;
    s.audit.unshift({ at: Date.now(), actor, action: "configure-drops", channelId });
    return { ok: true };
  });
}
export async function startAutomaticDrop(channelId, { force = false, actor = null } = {}) {
  return transact(({ s, now }) => {
    if (!channelId || s.config.dropChannelId !== channelId || s.config.activeDrop || (!force && s.config.nextDropAt > now)) return null;
    const boosted = new Date(now).getUTCDay() === 1;
    const card = drawCard(boosted ? "elite" : "standard", boosted ? 3 : 0);
    const id = randomUUID().slice(0,10);
    s.config.activeDrop = { id, cardId: card.id, channelId, messageId: null, claimers: [], expiresAt: now + 2 * 60000 };
    s.config.nextDropAt = now + randomInt(40, 85) * 60000;
    if (force) s.audit.unshift({ at: now, actor, action: "force-drop", channelId, cardId: card.id });
    return structuredClone(s.config.activeDrop);
  });
}
export async function attachDropMessage(dropId, messageId) {
  return transact(({ s }) => {
    if (s.config.activeDrop?.id !== dropId) return false;
    s.config.activeDrop.messageId = messageId;
    return true;
  });
}
export async function enterDrop(dropId, userId) {
  return transact(({ s, player, now }) => {
    const drop = s.config.activeDrop;
    if (!drop || drop.id !== dropId || now > drop.expiresAt) return { ok: false, error: "This drop has ended." };
    const p = player(userId);
    if (!p.faction) return { ok: false, error: "Join Galactic Command with /game first." };
    if (drop.claimers.includes(p.id)) return { ok: false, error: "You're already entered." };
    drop.claimers.push(p.id);
    return { ok: true, entered: drop.claimers.length };
  });
}
export async function finishDrop() {
  return transact(({ s, player, now }) => {
    const drop = s.config.activeDrop;
    if (!drop || now < drop.expiresAt) return null;
    s.config.activeDrop = null;
    const entrants = [...drop.claimers].sort(() => Math.random() - 0.5);
    const winners = entrants.slice(0, Math.min(3, entrants.length));
    for (const id of winners) {
      const p = player(id);
      addCard(p, drop.cardId, "channel-drop");
      record(p, "drop"); award(p, { xp: 45, points: 6 });
    }
    return { ...drop, winners };
  });
}
export async function scheduledGameState() {
  return transact(({ s }) => ({ config: structuredClone(s.config), week: s.week, event: currentEvent(), doubleXp: isDoubleXp(), winners: structuredClone(s.lastWeekWinners) }));
}
export async function updateEventAnnouncement(key) {
  return transact(({ s }) => { s.config.announcedEvent = String(key); return true; });
}
export async function markWeeklyAnnouncement(week) {
  return transact(({ s }) => {
    if (!s.lastWeekWinners.some(w => w.week === week)) return false;
    s.config.announcedWeek = week;
    return true;
  });
}

export async function adminGameAction(actor, action, targetId, key, value) {
  return transact(({ s, player }) => {
    let result;
    if (action === "grantcard") {
      const card = getCard(key);
      if (!card) return { ok: false, error: "Unknown card ID. See /cards." };
      const p = player(targetId);
      const amount = clamp(Math.floor(number(value) || 1), 1, 20);
      for (let n = 0; n < amount; n++) addCard(p, card.id, "owner-grant");
      p.auditFlag = true;
      result = `Granted ${amount}x ${card.name}.`;
    } else if (action === "reset") {
      const p = player(targetId);
      if (p.guild && s.guilds[p.guild]) {
        const guild=s.guilds[p.guild];
        guild.members=guild.members.filter(id=>id !== p.id);
        if (!guild.members.length) delete s.guilds[p.guild];
        else if (guild.ownerId===p.id) guild.ownerId=guild.members[0];
      }
      s.players[p.id] = createPlayer(p.id);
      result = "Player reset to a fresh recruit.";
    } else if (action === "set") {
      const allowed = ["credits", "xp", "scrap", "weekScore", "baseLevel"];
      if (!allowed.includes(key)) return { ok: false, error: `Allowed: ${allowed.join(", ")}.` };
      if (!Number.isSafeInteger(value) || value < 0 || value > 50000000) return { ok: false, error: "Value must be 0–50,000,000." };
      const p = player(targetId);
      p[key] = key === "baseLevel" ? clamp(value, 1, 30) : value;
      p.auditFlag = true;
      result = `${key} = ${p[key]}. (Excluded from this week's prizes)`;
    } else if (action === "prize") {
      const p = player(targetId);
      const item = p.rewards.find(r => !r.fulfilledPhysical);
      if (!item) return { ok: false, error: "No outstanding reward claim." };
      item.fulfilledPhysical = true; item.fulfilledBy = actor; item.fulfilledAt = Date.now();
      result = "Physical reward marked as fulfilled.";
    } else return { ok: false, error: "Unknown owner action." };
    s.audit.unshift({ at: Date.now(), actor, action, targetId, key, value });
    s.audit = s.audit.slice(0,500);
    return { ok: true, message: result };
  });
}
