import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = String(process.env.TARC_DATA_DIR || "./data");
const STATE_FILE = path.join(DATA_DIR, "tarc-assistant-state.json");

const MAX_TEACHINGS = 500;
const MAX_RECENT_QUESTIONS = 2000;
const MAX_DYNAMIC_TOPICS = 50;

const state = {
  loaded: false,
  teachings: [],
  recentQuestions: [],
  dynamicTopics: {}
};

const STOP_WORDS = new Set([
  "a","an","and","are","as","at","be","because","been","but","by","can","could","did","do","does","for",
  "from","had","has","have","he","her","here","him","his","how","i","if","in","is","it","its","me","my",
  "of","on","or","our","she","so","that","the","their","them","then","there","they","this","to","too",
  "up","us","was","we","were","what","when","where","which","who","why","will","with","would","you","your",
  "tarc","bot","ask","please","tell","know","about"
]);

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9_\-\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function persistState() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      teachings: state.teachings.slice(-MAX_TEACHINGS),
      recentQuestions: state.recentQuestions.slice(-MAX_RECENT_QUESTIONS),
      dynamicTopics: Object.fromEntries(
        Object.entries(state.dynamicTopics)
          .sort((a, b) => Number(b[1]?.count || 0) - Number(a[1]?.count || 0))
          .slice(0, MAX_DYNAMIC_TOPICS)
      )
    };
    await fs.writeFile(STATE_FILE, JSON.stringify(payload, null, 2), "utf8");
  } catch (err) {
    console.error("[TARC STATE] Save failed:", err);
  }
}

export async function loadAssistantState() {
  if (state.loaded) return state;
  state.loaded = true;

  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const raw = await fs.readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed?.teachings)) state.teachings = parsed.teachings.slice(-MAX_TEACHINGS);
    if (Array.isArray(parsed?.recentQuestions)) state.recentQuestions = parsed.recentQuestions.slice(-MAX_RECENT_QUESTIONS);
    if (parsed?.dynamicTopics && typeof parsed.dynamicTopics === "object") state.dynamicTopics = parsed.dynamicTopics;
  } catch (err) {
    if (err?.code !== "ENOENT") {
      console.error("[TARC STATE] Load failed:", err);
    }
  }

  return state;
}

function extractTopicPhrases(question) {
  const words = normalize(question)
    .split(" ")
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

  const scores = new Map();

  // Single meaningful words.
  for (const word of words) {
    scores.set(word, (scores.get(word) || 0) + 1);
  }

  // Two-word phrases capture community language without us predefining topics.
  for (let i = 0; i < words.length - 1; i++) {
    const phrase = `${words[i]} ${words[i + 1]}`;
    scores.set(phrase, (scores.get(phrase) || 0) + 2);
  }

  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([phrase]) => phrase);
}

export async function recordQuestionTrend(question) {
  await loadAssistantState();

  const now = Date.now();
  const clean = String(question || "").trim().slice(0, 1000);
  if (!clean) return;

  state.recentQuestions.push({ question: clean, at: now });
  state.recentQuestions = state.recentQuestions
    .filter((item) => now - Number(item.at || 0) <= 30 * 24 * 60 * 60 * 1000)
    .slice(-MAX_RECENT_QUESTIONS);

  for (const phrase of extractTopicPhrases(clean)) {
    const current = state.dynamicTopics[phrase] || { count: 0, lastSeen: 0 };
    current.count += 1;
    current.lastSeen = now;
    state.dynamicTopics[phrase] = current;
  }

  await persistState();
}

export async function getDynamicTrendContext() {
  await loadAssistantState();

  const now = Date.now();
  return Object.entries(state.dynamicTopics)
    .filter(([, value]) => now - Number(value?.lastSeen || 0) <= 30 * 24 * 60 * 60 * 1000)
    .sort((a, b) => Number(b[1]?.count || 0) - Number(a[1]?.count || 0))
    .slice(0, 15)
    .map(([topic, value]) => `${topic}:${value.count}`)
    .join(", ");
}

export async function addTeaching({ text, topic = "general", visibility = "public", taughtByDiscordId = "" }) {
  await loadAssistantState();

  const clean = String(text || "").trim();
  if (!clean) throw new Error("Teaching text cannot be empty.");

  const entry = {
    id: `teach_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    topic: String(topic || "general").trim().slice(0, 80) || "general",
    visibility: visibility === "private" ? "private" : "public",
    text: clean.slice(0, 3000),
    taughtByDiscordId: String(taughtByDiscordId || ""),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  state.teachings.push(entry);
  state.teachings = state.teachings.slice(-MAX_TEACHINGS);
  await persistState();
  return entry;
}

export async function getPublicTeachingContext(question, limit = 12) {
  await loadAssistantState();

  const q = normalize(question);
  const tokens = new Set(q.split(" ").filter((w) => w.length >= 3 && !STOP_WORDS.has(w)));

  const scored = state.teachings
    .filter((entry) => entry.visibility === "public")
    .map((entry) => {
      const haystack = normalize(`${entry.topic} ${entry.text}`);
      let score = 0;
      if (q && haystack.includes(q)) score += 50;
      for (const token of tokens) {
        if (haystack.includes(token)) score += 2;
      }
      return { entry, score };
    })
    .filter((item) => item.score > 0 || state.teachings.length <= limit)
    .sort((a, b) => b.score - a.score || Number(b.entry.updatedAt) - Number(a.entry.updatedAt))
    .slice(0, Math.max(1, Math.min(25, Number(limit) || 12)))
    .map((item) => item.entry);

  if (!scored.length) return "No owner-taught public knowledge matched this question.";

  return scored.map((entry) => [
    `Topic: ${entry.topic}`,
    `Owner-taught fact: ${entry.text}`,
    `Taught: ${new Date(entry.updatedAt).toISOString()}`
  ].join("\n")).join("\n\n");
}

export async function getTeachingCount() {
  await loadAssistantState();
  return state.teachings.length;
}
