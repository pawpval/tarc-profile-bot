import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = String(process.env.TARC_DATA_DIR || "./data");
const FILE = path.join(DATA_DIR, "tarc-game-state.json");

const DEFAULT_PROFILE = {
  version: 1,
  level: 1,
  xp: 0,
  credits: 500,
  elo: 1000,
  lifetimeCredits: 500,
  quizzesCompleted: 0,
  questionsAnswered: 0,
  correctAnswers: 0,
  bestStreak: 0,
  currentStreak: 0,
  rankedWins: 0,
  rankedLosses: 0,
  faceoffWins: 0,
  faceoffLosses: 0,
  patrols: 0,
  missions: 0,
  raidsWon: 0,
  raidsLost: 0,
  dailyStreak: 0,
  lastDaily: 0,
  lastPatrol: 0,
  inventory: [],
  equippedTitle: "Rookie",
  equippedAnswerStyle: "standard",
  achievements: [],
  categoryStats: {},
  difficultyStats: {},
  history: [],
  questProgress: {},
  claimedQuests: [],
  collection: [],
  seasonXp: 0,
  seasonTier: 1,
  raidEnergy: 5,
  lastEnergyAt: 0,
  xpBoostCharges: 0,
  creditBoostCharges: 0,
  streakShields: 0,
  commandUnits: {},
  commandIncomeAt: 0,
  eventRuns: 0,
  cratesOpened: 0,
  createdAt: 0,
  updatedAt: 0
};

let loaded = false;
const state = { players: {}, season: { id: "launch", startedAt: Date.now() } };
let saveChain = Promise.resolve();

function cloneDefault() {
  return JSON.parse(JSON.stringify(DEFAULT_PROFILE));
}

function levelFromXp(xp) {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, Number(xp) || 0) / 120)) + 1);
}

function xpForLevel(level) {
  const n = Math.max(1, Number(level) || 1) - 1;
  return n * n * 120;
}

async function save() {
  saveChain = saveChain.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(state, null, 2), "utf8");
  }).catch(err => console.error("[TARC GAME] Save failed:", err));
  return saveChain;
}

export async function loadGameState() {
  if (loaded) return state;
  loaded = true;
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed?.players && typeof parsed.players === "object") state.players = parsed.players;
    if (parsed?.season && typeof parsed.season === "object") state.season = parsed.season;
  } catch (err) {
    if (err?.code !== "ENOENT") console.error("[TARC GAME] Load failed:", err);
  }
  return state;
}

export async function getPlayer(userId) {
  await loadGameState();
  const id = String(userId);
  if (!state.players[id]) {
    const now = Date.now();
    state.players[id] = { ...cloneDefault(), createdAt: now, updatedAt: now };
    await save();
  }
  const p = state.players[id];
  for (const [key,value] of Object.entries(cloneDefault())) { if (p[key] === undefined) p[key] = value; }
  p.level = levelFromXp(p.xp);
  return p;
}

export function getLevelProgress(profile) {
  const level = levelFromXp(profile.xp);
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, current: profile.xp - floor, needed: Math.max(1, next - floor), nextTotal: next };
}

export async function mutatePlayer(userId, mutator) {
  const p = await getPlayer(userId);
  await mutator(p);
  p.level = levelFromXp(p.xp);
  p.updatedAt = Date.now();
  await save();
  return p;
}

export async function addRewards(userId, { credits = 0, xp = 0 } = {}) {
  return mutatePlayer(userId, p => {
    p.credits = Math.max(0, Math.round((p.credits || 0) + credits));
    if (credits > 0) p.lifetimeCredits = Math.round((p.lifetimeCredits || 0) + credits);
    p.xp = Math.max(0, Math.round((p.xp || 0) + xp));
  });
}

export async function recordQuizAnswer(userId, { correct, category, difficulty, credits = 0, xp = 0 } = {}) {
  return mutatePlayer(userId, p => {
    p.questionsAnswered += 1;
    if (correct) {
      p.correctAnswers += 1;
      p.currentStreak += 1;
      p.bestStreak = Math.max(p.bestStreak, p.currentStreak);
    } else {
      p.currentStreak = 0;
    }
    p.credits = Math.max(0, p.credits + credits);
    if (credits > 0) p.lifetimeCredits += credits;
    p.xp = Math.max(0, p.xp + xp);
    p.categoryStats[category] ||= { answered: 0, correct: 0 };
    p.categoryStats[category].answered += 1;
    if (correct) p.categoryStats[category].correct += 1;
    p.difficultyStats[difficulty] ||= { answered: 0, correct: 0 };
    p.difficultyStats[difficulty].answered += 1;
    if (correct) p.difficultyStats[difficulty].correct += 1;
  });
}

export async function completeQuiz(userId, { score, total, ranked = false, won = null, eloDelta = 0, mode = "Classic" }) {
  return mutatePlayer(userId, p => {
    p.quizzesCompleted += 1;
    if (ranked) {
      p.elo = Math.max(100, Math.round(p.elo + eloDelta));
      if (won === true) p.rankedWins += 1;
      if (won === false) p.rankedLosses += 1;
    }
    p.history.unshift({ at: Date.now(), mode, score, total, ranked, eloDelta });
    p.history = p.history.slice(0, 25);
  });
}

export async function claimDaily(userId) {
  const now = Date.now();
  const DAY = 86400000;
  let result;
  await mutatePlayer(userId, p => {
    const elapsed = now - Number(p.lastDaily || 0);
    if (elapsed < DAY) {
      result = { ok: false, remaining: DAY - elapsed, profile: p };
      return;
    }
    if (p.lastDaily && elapsed < DAY * 2.2) p.dailyStreak += 1;
    else p.dailyStreak = 1;
    const credits = 250 + Math.min(750, (p.dailyStreak - 1) * 50);
    const xp = 100 + Math.min(300, (p.dailyStreak - 1) * 20);
    p.lastDaily = now;
    p.credits += credits;
    p.lifetimeCredits += credits;
    p.xp += xp;
    result = { ok: true, credits, xp, streak: p.dailyStreak, profile: p };
  });
  return result;
}

export async function getLeaderboard(metric = "elo", limit = 10) {
  await loadGameState();
  const allowed = new Set(["elo","credits","xp","correctAnswers","quizzesCompleted","bestStreak"]);
  const key = allowed.has(metric) ? metric : "elo";
  return Object.entries(state.players)
    .map(([userId,p]) => ({ userId, ...p }))
    .sort((a,b) => Number(b[key] || 0) - Number(a[key] || 0))
    .slice(0, Math.max(1, Math.min(25, limit)));
}

export async function purchaseItem(userId, item) {
  let result;
  await mutatePlayer(userId, p => {
    if (p.inventory.includes(item.id)) {
      result = { ok: false, reason: "owned", profile: p };
      return;
    }
    if (p.credits < item.price) {
      result = { ok: false, reason: "credits", profile: p };
      return;
    }
    p.credits -= item.price;
    p.inventory.push(item.id);
    result = { ok: true, profile: p };
  });
  return result;
}

export async function equipItem(userId, item) {
  return mutatePlayer(userId, p => {
    if (!p.inventory.includes(item.id) && !item.free) throw new Error("You do not own that item.");
    if (item.type === "title") p.equippedTitle = item.value;
    if (item.type === "answerStyle") p.equippedAnswerStyle = item.value;
  });
}

export async function adminSetStat(userId, stat, value) {
  const allowed = new Set(["credits","xp","elo","correctAnswers","quizzesCompleted","bestStreak","rankedWins","rankedLosses"]);
  if (!allowed.has(stat)) throw new Error("That stat cannot be edited.");
  return mutatePlayer(userId, p => { p[stat] = Math.max(0, Math.round(Number(value) || 0)); });
}

export async function adminResetPlayer(userId) {
  await loadGameState();
  const now = Date.now();
  state.players[String(userId)] = { ...cloneDefault(), createdAt: now, updatedAt: now };
  await save();
  return state.players[String(userId)];
}


export async function incrementQuestProgress(userId, key, amount = 1) {
  return mutatePlayer(userId, p => {
    p.questProgress ||= {};
    p.questProgress[key] = Number(p.questProgress[key] || 0) + amount;
  });
}

export async function claimQuest(userId, quest) {
  let result;
  await mutatePlayer(userId, p => {
    p.claimedQuests ||= [];
    p.questProgress ||= {};
    if (p.claimedQuests.includes(quest.id)) { result = { ok:false, reason:"claimed", profile:p }; return; }
    if (Number(p.questProgress[quest.key] || 0) < quest.target) { result = { ok:false, reason:"progress", profile:p }; return; }
    p.claimedQuests.push(quest.id);
    p.credits += quest.credits;
    p.lifetimeCredits += quest.credits;
    p.xp += quest.xp;
    p.seasonXp = Number(p.seasonXp || 0) + quest.seasonXp;
    p.seasonTier = Math.max(1, Math.floor(p.seasonXp / 500) + 1);
    result = { ok:true, profile:p };
  });
  return result;
}

export async function addCollectible(userId, collectibleId) {
  let added = false;
  await mutatePlayer(userId, p => {
    p.collection ||= [];
    if (!p.collection.includes(collectibleId)) { p.collection.push(collectibleId); added = true; }
  });
  return added;
}
