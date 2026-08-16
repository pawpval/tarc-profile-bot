import { askTarcAssistant, teachTarcAssistant } from "./tarcAssistant.js";
import { randomUUID } from "node:crypto";
import express from "express";
import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  Events
} from "discord.js";

const app = express();

const LEGAL_EFFECTIVE_DATE = "16 August 2026";

function renderLegalPage({ title, subtitle, sections }) {
  const sectionHtml = sections
    .map(({ heading, body }) => `
      <section>
        <h2>${heading}</h2>
        ${body}
      </section>
    `)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <title>${title} | TARC Bot</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0f1117;
      --panel: #171a22;
      --text: #eef1f7;
      --muted: #aeb6c5;
      --line: #2a2f3a;
      --accent: #5da8ff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.65;
    }
    main {
      width: min(920px, calc(100% - 32px));
      margin: 48px auto;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 32px;
    }
    h1 { margin: 0 0 6px; font-size: clamp(2rem, 5vw, 3rem); }
    h2 { margin: 30px 0 8px; font-size: 1.25rem; }
    p, li { color: var(--muted); }
    strong { color: var(--text); }
    a { color: var(--accent); }
    .meta {
      color: var(--muted);
      border-bottom: 1px solid var(--line);
      padding-bottom: 22px;
      margin-bottom: 22px;
    }
    ul { padding-left: 22px; }
    code {
      background: #0c0e13;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 2px 6px;
    }
    footer {
      border-top: 1px solid var(--line);
      margin-top: 36px;
      padding-top: 18px;
      color: var(--muted);
      font-size: .92rem;
    }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <div class="meta">${subtitle}<br />Effective: ${LEGAL_EFFECTIVE_DATE}</div>
    ${sectionHtml}
    <footer>
      TARC Bot is operated for The Grand Republic Clone Army (TARC).
      These pages apply to the TARC Bot Discord application.
    </footer>
  </main>
</body>
</html>`;
}


// ==================== ENV ====================
const PORT = Number(process.env.PORT || 8080);
const DISCORD_TOKEN = String(process.env.DISCORD_TOKEN || "");
const SHARED_SECRET = String(process.env.SHARED_SECRET || "");
const CLIENT_ID = String(process.env.CLIENT_ID || "");
const GUILD_ID = String(process.env.GUILD_ID || "");
const GUILD_IDS = String(process.env.GUILD_IDS || GUILD_ID || "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);
const ROBLOX_GROUP_ID = String(process.env.ROBLOX_GROUP_ID || "35324584");
const ROBLOX_UNIVERSE_ID = String(process.env.ROBLOX_UNIVERSE_ID || "8990029422");

// Discord management command permissions
const OFFICER_PERMISSION_ROLE_ID = "1318210870207320146";
const CONTENT_CREATOR_MANAGER_ROLE_ID = "1485725468799008969";
const MAX_XP_PER_TARGET = 2;
const MAX_TARGETS_PER_COMMAND = 20;
const ACTION_TTL_MS = 24 * 60 * 60 * 1000;
const ACTION_CLAIM_MS = 60 * 1000;
const ACTION_LOG_CHANNEL_ID = String(process.env.ACTION_LOG_CHANNEL_ID || "");

// Roblox Open Cloud group ranking.
const ROBLOX_API_KEY = String(process.env.ROBLOX_API_KEY || "");
const ROBLOX_OPEN_CLOUD_BASE = "https://apis.roblox.com/cloud/v2";

// Discord permissions for Roblox ranking and RMP cleanup.
// Marshal Commander can use /promote, /demote, and /rmp.
// Administrator can use every management command, including /rmpall.
const MARSHAL_COMMANDER_ROLE_ID = "1318201599365091408";
const ADMINISTRATOR_ROLE_ID = "1433858724426158256";

// Consolidated enlisted Discord role setup.
const RMP_ROLE_ID = "1434174197738766396";
const OLD_ENLISTED_ROLE_IDS = [
  "1318201599327338524", // Warrant Officer
  "1318201599327338523", // Sergeant Major
  "1318201599327338522", // Master Sergeant
  "1318201599327338521", // Staff Sergeant
  "1318201599327338520", // Sergeant
  "1318201599327338519", // Corporal
  "1318201599327338518", // Specialist
  "1318201599327338517"  // Trooper
];

// Railway memory queue. Roblox claims and completes these actions.
const discordActionQueue = new Map();


// Optional image for non-BGC command embeds. Must be a real https:// image URL.
// file:///C:/Users/... will NOT work on Railway/Discord.
const COMMAND_IMAGE_URL = String(process.env.COMMAND_IMAGE_URL || "");

// ==================== CONFIG ====================
// Discord bot presence.
// NOTE: Discord bot accounts can only set the standard Gateway activity fields
// (name/state/type/url). Full Rich Presence artwork and custom URL buttons are
// not available to normal bot users through setPresence().
const BOT_STATUS_NAME = "discord.gg/tarcs 🔥";
const BOT_STATUS_TYPE = 3; // 3 = Watching

const TARC_GROUP_LINK = `https://www.roblox.com/groups/${ROBLOX_GROUP_ID}/TARC`;
const TARC_GAME_LINK = "https://www.roblox.com/games/79834733161236";
const REPORTS_APPEALS_LINK = "https://discord.gg/TsvyxSav43";
const LAWBOOK_LINK = "https://trello.com/b/25mjJPCy/tarc-regulations-punishments";
const BOT_CMDS_CHANNEL_ID = "1318201600908460089";

const CHAT_REVIVE_CHANNEL_ID = "1380623761778151485";
const CHAT_REVIVE_INTERVAL_MS = 6 * 60 * 60 * 1000; // check every 6 hours
const CHAT_REVIVE_MIN_IDLE_MS = 60 * 60 * 1000; // only post if chat has been quiet for 1 hour
const CHAT_REVIVE_MIN_REPEAT_GAP = 8; // avoid repeating one of the last 8 prompts

// Owner-controlled external broadcast endpoint.
// Set OWNER_BROADCAST_SECRET in Railway to a strong random secret.
// POST /owner-broadcast with JSON:
// {
//   "secret": "...",
//   "channelId": "1380623761778151485",
//   "content": "your message",
//   "embed": {
//      "title": "Optional",
//      "description": "Optional",
//      "color": 5793266
//   }
// }
const OWNER_BROADCAST_SECRET = String(process.env.OWNER_BROADCAST_SECRET || "");
const OWNER_BROADCAST_COOLDOWN_MS = 10 * 60 * 1000;
const OWNER_BROADCAST_ALLOWED_CHANNELS = new Set([
  "1380623761778151485" // public chat
]);
let lastOwnerBroadcastAt = 0;

const CHAT_REVIVE_PROMPTS = [
  "What’s everyone up to today?",
  "Quick check-in: how’s everyone doing?",
  "What’s been your favourite TARC event recently?",
  "If you could add one quality-of-life feature to TARC, what would it be?",
  "Which division do you think has the cleanest uniforms?",
  "What’s one TARC feature more people should use?",
  "Favourite Clone Wars character? Keep it civil.",
  "What’s the best event type in your opinion?",
  "If you could attend any one event right now, what would you pick?",
  "What’s one thing you’re looking forward to in TARC?",
  "Which map area do you spend the most time around?",
  "What’s your favourite division to watch at events?",
  "What’s one TARC update you’ve liked recently?",
  "If you had to recommend one division to a new member, which would you pick?",
  "What’s your favourite part of being in the community?",
  "Any goals you’re working towards in TARC right now?",
  "What’s the best Star Wars era in your opinion?",
  "Favourite clone battalion outside of TARC?",
  "What kind of event should be hosted more often?",
  "What’s one thing new members should know?",
  "Which TARC system do you think is underrated?",
  "What’s your favourite in-game progression rank name?",
  "What’s one division you’d like to learn more about?",
  "What’s your favourite part of the current rank progression?",
  "What’s one event you’d like to see return?",
  "Who’s actually online right now?",
  "What’s been the best moment from this week so far?",
  "What’s one thing you’d tell someone thinking about joining TARC?",
  "What’s your favourite Star Wars planet?",
  "What should the next community discussion be about?"
];

const recentChatReviveIndexes = [];


const MAIN_GROUP_ID = 35324584;
const SUB_GROUP_IDS = new Set([35326812]); // Advanced Recon Commandos

const DIVISION_GROUPS = {
  35324584: "Republic Army",
  35326817: "91st Reconnaissance Corps",
  311903349: "501st Legion",
  35328710: "41st Elite Corps",
  688102798: "212th Attack Battalion",
  35326812: "Advanced Recon Commandos",
  35326815: "Coruscant Guard",
  35326827: "Red Guards",
  12658410: "Republic Commandos",
  35326830: "Republic Intelligence",
  33943342: "Galactic Senate",
  16060314: "Senate Guard",
  16282238: "The Jedi Order"
};

const DIVISION_ORDER = [
  35324584, 35326817, 311903349, 35328710, 688102798,
  35326812, 35326815, 35326827, 12658410, 35326830,
  33943342, 16060314, 16282238
];

const MULTI_MAIN_ALLOWED_RANK_NAMES = new Set([
  "Marshal Commander",
  "Sector Commander",
  "Supreme Commander",
  "Grand Marshal",
  "Vice Chancellor",
  "Supreme Chancellor",
  "Owner",
  "Group Owner"
]);

const STAR_WARS_QUOTES = [
  "May the Force be with you.", "Do. Or do not. There is no try.", "The Force will be with you. Always.",
  "This is the way.", "I have spoken.", "Never tell me the odds.", "So uncivilized.", "Hello there.",
  "General Kenobi.", "I find your lack of faith disturbing.", "Fear is the path to the dark side.",
  "Your focus determines your reality.", "The greatest teacher, failure is.", "Luminous beings are we, not this crude matter.",
  "No one's ever really gone.", "Rebellions are built on hope.", "I am one with the Force, and the Force is with me.",
  "There's always a bigger fish.", "The dark side clouds everything.", "Power! Unlimited power!",
  "You underestimate my power.", "It's over. I have the high ground.", "A surprise, to be sure, but a welcome one.",
  "Now this is podracing.", "I will do what I must.", "You were the chosen one.", "Always two there are, no more, no less.",
  "Good soldiers follow orders.", "For the Republic.", "Execute Order 66.",
  "I'm just a simple man trying to make my way in the universe.", "The mission always comes first.",
  "We are keepers of the peace, not soldiers.", "Only a Sith deals in absolutes.", "I have a bad feeling about this.",
  "Stay on target.", "It's a trap!", "The Force is strong with this one.",
  "Help me, Obi-Wan Kenobi. You're my only hope.", "These aren't the droids you're looking for.",
  "Let the Wookiee win.", "Strike me down and I shall become more powerful than you can possibly imagine.",
  "Great, kid. Don't get cocky.", "Laugh it up, fuzzball.", "I know.", "Size matters not.",
  "Wars not make one great.", "That is why you fail.", "You must unlearn what you have learned.",
  "Difficult to see. Always in motion is the future.", "Impressive. Most impressive.",
  "The Emperor is not as forgiving as I am.", "There is good in him. I've felt it.",
  "I am a Jedi, like my father before me.", "Your overconfidence is your weakness.",
  "Your faith in your friends is yours.", "Many Bothans died to bring us this information.",
  "Chewie, we're home.", "That's not how the Force works.", "Escape now, hug later.",
  "The garbage will do.", "A thousand generations live in you now.",
  "The belonging you seek is not behind you. It is ahead.", "Let the past die. Kill it if you have to.",
  "We are what they grow beyond.", "The spark that'll light the fire that'll burn the First Order down.",
  "I can bring you in warm, or I can bring you in cold.", "Wherever I go, he goes.",
  "Weapons are part of my religion.", "I like those odds.", "I am all the Jedi.",
  "A Jedi uses the Force for knowledge and defense.", "Patience you must have, my young Padawan.",
  "The shroud of the dark side has fallen.", "Begun, the Clone War has.",
  "One way out.", "Never more than twelve.", "Fight the Empire!",
  "The Empire is a disease that thrives in darkness.", "Hope is like the sun.",
  "The ability to speak does not make you intelligent.", "In my experience, there is no such thing as luck.",
  "Train yourself to let go of everything you fear to lose.", "Attachment is forbidden.",
  "Compassion is central to a Jedi's life.", "The negotiations were short.",
  "The circle is now complete.", "Apology accepted, Captain Needa.",
  "The Force is with you, young Skywalker.", "It's not impossible.", "I don't like sand.",
  "Wonderful girl. Either I'm going to kill her or I'm beginning to like her.",
  "The strongest stars have hearts of kyber.", "The axe forgets, but the tree remembers.",
  "I burn my life to make a sunrise that I know I'll never see.", "We have hope. Rebellions are built on hope."
];

const XP_RANKS = [
  { xp: 0, name: "Cadet" },
  { xp: 2, name: "Private" },
  { xp: 4, name: "Private Second Class" },
  { xp: 6, name: "Private First Class" },
  { xp: 10, name: "Trooper" },
  { xp: 18, name: "Specialist" },
  { xp: 28, name: "Corporal" },
  { xp: 35, name: "Sergeant" },
  { xp: 50, name: "Staff Sergeant" },
  { xp: 75, name: "Master Sergeant" },
  { xp: 100, name: "Sergeant Major" },
  { xp: 125, name: "Warrant Officer" },
  { xp: 200, name: "Upper Warrant Officer" },
  { xp: 235, name: "Command Warrant Officer" },
  { xp: 275, name: "Chief Warrant Officer" },
  { xp: 300, name: "Elite Recruit" },
  { xp: 325, name: "Elite Sergeant" },
  { xp: 360, name: "Elite Lieutenant" },
  { xp: 500, name: "Elite Commander" }
];

const CHAIN_OF_COMMAND_ROLES = [
  "Supreme Chancellor",
  "Vice Chancellor",
  "Supreme Commander",
  "Grand Marshal"
];

// ==================== SAFETY / LOGGING ====================
process.on("uncaughtException", (err) => console.error("[FATAL] uncaughtException:", err));
process.on("unhandledRejection", (reason) => console.error("[FATAL] unhandledRejection:", reason));

app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);
  next();
});

app.use(express.json({ limit: "1mb" }));

app.use((err, req, res, next) => {
  console.error("[HTTP] JSON parse error:", err);
  res.status(400).json({ error: "Bad JSON body" });
});

// ==================== CACHE ====================
// IMPORTANT: This is in-memory. If Railway restarts, cached profiles reset until players rejoin.
const profileCache = new Map();      // userId -> profile
const usernameToUserId = new Map();  // lowercase username -> userId

// ==================== MEDALS ====================
const MedalAssignments = {
  621243206: ["Medal Of Honor", "Distinguished Service", "Achivement Of Activity", "Medal Of Stars Honesty", "Leaderships Medal Of Honour", "Invaluted's Bravery"],
  2808148032: ["Achivement Of Activity"],
  1439310935: ["Medal Of Honor", "Achivement Of Activity"],
  2411349338: ["Medal Of Stars Honesty"],
  4278897258: ["Medal Of Dedication"],
  1301506053: ["Distinguished Service", "Medal Of Dedication"],
  3799212924: ["Leaderships Medal Of Honour", "Achivement Of Activity"],
  2493429350: ["Medal Of Stars Honesty"],
  4981240382: ["Medal Of Honor", "Distinguished Service", "Achivement Of Activity", "Medal Of Stars Honesty"],
  1120715283: ["Medal Of Honor", "Distinguished Service", "Medal Of Stars Honesty", "Leaderships Medal Of Honour", "Medal Of Dedication", "Achivement Of Activity"],
  1208840794: ["Medal Of Honor", "Distinguished Service", "Medal Of Stars Honesty", "Leaderships Medal Of Honour"]
};

function getMedals(userId) {
  const medals = MedalAssignments[userId];
  if (!medals || medals.length === 0) return "None";
  return medals.join(", ");
}

// ==================== HELPERS ====================
function safeTrim(text, max = 1024) {
  const str = String(text ?? "");
  return str.length > max ? `${str.slice(0, max - 3)}...` : str;
}

function formatNumber(num) {
  return Number(num || 0).toLocaleString("en-US");
}

function unixNow() {
  return Math.floor(Date.now() / 1000);
}

function formatCompactTime(seconds) {
  seconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const d = Math.floor(seconds / 86400);
  seconds %= 86400;
  const h = Math.floor(seconds / 3600);
  seconds %= 3600;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;

  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0 || parts.length) parts.push(`${h}h`);
  if (m > 0 || parts.length) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

function formatAccountAge(createdIso) {
  const created = new Date(createdIso);
  if (Number.isNaN(created.getTime())) return "Unknown";

  const days = Math.max(0, Math.floor((Date.now() - created.getTime()) / 86400000));
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);

  if (years > 0 && months > 0) return `${years}y ${months}m (${formatNumber(days)} days)`;
  if (years > 0) return `${years}y (${formatNumber(days)} days)`;
  if (months > 0) return `${months}m (${formatNumber(days)} days)`;
  return `${formatNumber(days)} days`;
}

function applyCommandImage(embed) {
  if (COMMAND_IMAGE_URL.startsWith("https://")) {
    embed.setThumbnail(COMMAND_IMAGE_URL);
  }
  return embed;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }

  return data;
}

async function resolveRobloxUser(username) {
  const data = await fetchJson("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      usernames: [username],
      excludeBannedUsers: false
    })
  });

  const found = data?.data?.[0];
  if (!found?.id) return null;

  return {
    userId: Number(found.id),
    username: String(found.name),
    displayName: String(found.displayName || found.name)
  };
}

async function getRobloxUserDetails(userId) {
  return await fetchJson(`https://users.roblox.com/v1/users/${userId}`);
}

async function getRobloxAvatarHeadshot(userId) {
  const data = await fetchJson(
    `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`
  );
  return data?.data?.[0]?.imageUrl || null;
}

async function getRobloxGroupStats() {
  return await fetchJson(`https://groups.roblox.com/v1/groups/${ROBLOX_GROUP_ID}`);
}

async function getRobloxGameStats() {
  const data = await fetchJson(`https://games.roblox.com/v1/games?universeIds=${ROBLOX_UNIVERSE_ID}`);
  return data?.data?.[0] || null;
}

async function getRobloxUserGroupRoles(userId) {
  const data = await fetchJson(`https://groups.roblox.com/v2/users/${userId}/groups/roles`);
  return data?.data || [];
}

function getMainGroupRoleFromGroupRoles(groupRoles) {
  const entry = groupRoles.find((item) => Number(item?.group?.id) === MAIN_GROUP_ID);
  return entry?.role?.name || "Not in group";
}

function getMainGroupRankNumber(groupRoles) {
  const entry = groupRoles.find((item) => Number(item?.group?.id) === MAIN_GROUP_ID);
  return Number(entry?.role?.rank || 0);
}

function getDivisionsFromGroupRoles(groupRoles) {
  const byId = new Map();

  for (const item of groupRoles) {
    const groupId = Number(item?.group?.id);
    if (!DIVISION_GROUPS[groupId]) continue;

    byId.set(groupId, {
      id: groupId,
      name: DIVISION_GROUPS[groupId],
      role: String(item?.role?.name || "Member"),
      rank: Number(item?.role?.rank || 0)
    });
  }

  return DIVISION_ORDER.filter((id) => byId.has(id)).map((id) => byId.get(id));
}

function getMainDivisionsOnly(divisions) {
  return divisions.filter((d) => d.id !== MAIN_GROUP_ID && !SUB_GROUP_IDS.has(d.id));
}

function getSubDivisionsOnly(divisions) {
  return divisions.filter((d) => SUB_GROUP_IDS.has(d.id));
}

function isMultiMainAllowed(mainRankName, mainRankNumber) {
  const rankName = String(mainRankName || "").trim();
  if (MULTI_MAIN_ALLOWED_RANK_NAMES.has(rankName)) return true;
  return Number(mainRankNumber || 0) >= 18;
}

function getTarcStatus({ userDetails, divisions, mainRankName, mainRankNumber, punishments }) {
  const reasons = [];
  let level = "green";

  const created = new Date(userDetails.created);
  const ageDays = Number.isNaN(created.getTime()) ? 9999 : Math.floor((Date.now() - created.getTime()) / 86400000);
  const mainDivisions = getMainDivisionsOnly(divisions);
  const subDivisions = getSubDivisionsOnly(divisions);
  const allowedMultiMain = isMultiMainAllowed(mainRankName, mainRankNumber);

  if (userDetails.isBanned) {
    level = "red";
    reasons.push("Roblox account is banned.");
  }

  if (Array.isArray(punishments) && punishments.length > 0) {
    level = level === "red" ? "red" : "orange";
    reasons.push("Punishment history found.");
  }

  if (ageDays < 365) {
    level = level === "red" ? "red" : "orange";
    reasons.push("Account is under 1 year old.");
  }

  if (!allowedMultiMain && mainDivisions.length > 1) {
    level = "red";
    reasons.push(`In ${mainDivisions.length} main divisions.`);
  }

  if (subDivisions.length > 1) {
    level = level === "red" ? "red" : "orange";
    reasons.push(`In ${subDivisions.length} sub divisions.`);
  }

  if (level === "red") return { text: "🔴 High risk", reasons };
  if (level === "orange") return { text: "🟠 Caution", reasons };
  return { text: "🟢 Very safe", reasons: reasons.length ? reasons : ["No major issues found."] };
}

function extractPossibleUsernameFromMember(member) {
  const pieces = [member?.nickname, member?.displayName, member?.user?.username, member?.user?.globalName]
    .filter(Boolean)
    .map(String);

  const cachedUsernames = Array.from(usernameToUserId.keys()).sort((a, b) => b.length - a.length);
  for (const piece of pieces) {
    const lower = piece.toLowerCase();
    for (const username of cachedUsernames) {
      if (username.length >= 3 && lower.includes(username)) return username;
    }
  }

  for (const piece of pieces) {
    const cleaned = piece.replace(/\[[^\]]+\]/g, " ").replace(/[^\w]/g, " ").split(/\s+/).filter((x) => x.length >= 3 && x.length <= 20);
    if (cleaned.length) return cleaned[cleaned.length - 1];
  }

  return null;
}

function getCachedProfileByResolvedUser(resolved) {
  let profile = profileCache.get(resolved.userId);
  if (!profile) {
    const cachedId = usernameToUserId.get(resolved.username.toLowerCase());
    if (cachedId) profile = profileCache.get(cachedId);
  }
  return profile || null;
}

async function robloxOpenCloudRequest(path, options = {}) {
  if (!ROBLOX_API_KEY) {
    throw new Error("ROBLOX_API_KEY is missing from the Railway environment variables.");
  }

  const response = await fetch(`${ROBLOX_OPEN_CLOUD_BASE}${path}`, {
    ...options,
    headers: {
      "x-api-key": ROBLOX_API_KEY,
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = text; }

  if (!response.ok) {
    const details = typeof data === "string" ? data : JSON.stringify(data);
    throw new Error(`Roblox Open Cloud HTTP ${response.status}: ${details || response.statusText}`);
  }

  return data;
}

async function getAllOpenCloudGroupRoles() {
  const roles = [];
  let pageToken = "";

  do {
    const params = new URLSearchParams({ maxPageSize: "100" });
    if (pageToken) params.set("pageToken", pageToken);

    const data = await robloxOpenCloudRequest(
      `/groups/${ROBLOX_GROUP_ID}/roles?${params.toString()}`
    );

    roles.push(...(data.groupRoles || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return roles;
}

async function getOpenCloudMembershipForUser(userId) {
  const params = new URLSearchParams({
    maxPageSize: "10",
    filter: `user == 'users/${userId}'`
  });

  const data = await robloxOpenCloudRequest(
    `/groups/${ROBLOX_GROUP_ID}/memberships?${params.toString()}`
  );

  return (data.groupMemberships || [])[0] || null;
}

async function setRobloxGroupRoleByExactName(usernameInput, targetRoleName, direction) {
  const resolved = await resolveRobloxUser(usernameInput);
  if (!resolved) throw new Error("That Roblox username was not found.");

  const [roles, membership] = await Promise.all([
    getAllOpenCloudGroupRoles(),
    getOpenCloudMembershipForUser(resolved.userId)
  ]);

  if (!membership) {
    throw new Error(`${resolved.username} is not a member of the TARC Roblox group.`);
  }

  const wanted = String(targetRoleName || "").trim().toLocaleLowerCase();
  const targetRole = roles.find((role) =>
    String(role.displayName || "").trim().toLocaleLowerCase() === wanted
  );

  if (!targetRole) {
    throw new Error(`No Roblox group rank exactly matches “${targetRoleName}”.`);
  }

  const currentRolePath = String(membership.role || "");
  const currentRole = roles.find((role) => String(role.path) === currentRolePath);
  const currentRank = Number(currentRole?.rank || 0);
  const targetRank = Number(targetRole.rank || 0);

  if (targetRank >= 255) throw new Error("The group owner rank cannot be assigned by this command.");
  if (targetRank <= 0) throw new Error("That target rank is not assignable.");
  if (String(currentRole?.path || "") === String(targetRole.path)) {
    throw new Error(`${resolved.username} is already ${targetRole.displayName}.`);
  }
  if (direction === "promote" && targetRank <= currentRank) {
    throw new Error(`/promote requires a rank above ${currentRole?.displayName || "the current rank"}.`);
  }
  if (direction === "demote" && targetRank >= currentRank) {
    throw new Error(`/demote requires a rank below ${currentRole?.displayName || "the current rank"}.`);
  }

  const membershipId = String(membership.path || "").split("/").pop();
  if (!membershipId) throw new Error("Roblox returned a membership without an ID.");

  await robloxOpenCloudRequest(
    `/groups/${ROBLOX_GROUP_ID}/memberships/${membershipId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ role: targetRole.path })
    }
  );

  return {
    resolved,
    oldRole: currentRole?.displayName || "Unknown",
    newRole: targetRole.displayName,
    oldRank: currentRank,
    newRank: targetRank
  };
}

async function getCommandMember(interaction) {
  if (!interaction.inGuild() || !interaction.guild) return null;
  return interaction.guild.members.fetch(interaction.user.id);
}

async function hasAdministratorAccess(interaction) {
  if (!interaction.inGuild() || !interaction.guild) return false;
  if (interaction.guild.ownerId === interaction.user.id) return true;
  const member = await getCommandMember(interaction);
  return Boolean(member?.roles.cache.has(ADMINISTRATOR_ROLE_ID));
}

async function hasRankManagementAccess(interaction) {
  if (!interaction.inGuild() || !interaction.guild) return false;
  if (interaction.guild.ownerId === interaction.user.id) return true;
  const member = await getCommandMember(interaction);
  return Boolean(
    member?.roles.cache.has(ADMINISTRATOR_ROLE_ID) ||
    member?.roles.cache.has(MARSHAL_COMMANDER_ROLE_ID)
  );
}

async function applyRmpDiscordRoles(member) {
  const removable = OLD_ENLISTED_ROLE_IDS.filter((roleId) => member.roles.cache.has(roleId));
  const hadRmp = member.roles.cache.has(RMP_ROLE_ID);

  if (removable.length) {
    await member.roles.remove(removable, "TARC enlisted roles consolidated into RMP");
  }
  if (!hadRmp) {
    await member.roles.add(RMP_ROLE_ID, "TARC enlisted roles consolidated into RMP");
  }

  return { removed: removable.length, addedRmp: !hadRmp };
}

// ==================== EMBEDS ====================
function memberHasRole(interaction, roleId) {
  const roles = interaction.member?.roles;
  if (!roles) return false;

  if (roles.cache?.has) return roles.cache.has(roleId);
  if (Array.isArray(roles)) return roles.includes(roleId);
  return false;
}

function parseUsernameList(raw) {
  const seen = new Set();
  return String(raw || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .filter((name) => {
      const key = name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function resolveRobloxUsers(usernames) {
  const data = await fetchJson("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      usernames,
      excludeBannedUsers: false
    })
  });

  const foundByInput = new Map();
  for (const user of data?.data || []) {
    foundByInput.set(String(user.requestedUsername || user.name).toLowerCase(), {
      userId: Number(user.id),
      username: String(user.name),
      displayName: String(user.displayName || user.name)
    });
  }

  return usernames.map((input) => ({
    input,
    resolved: foundByInput.get(input.toLowerCase()) || null
  }));
}

function queueDiscordAction({ type, operation, target, amount = null, reason, interaction }) {
  const id = randomUUID();
  const now = Date.now();

  const action = {
    id,
    type,
    operation,
    userId: target.userId,
    username: target.username,
    amount,
    reason,
    requestedByDiscordId: interaction.user.id,
    requestedByTag: interaction.user.tag || interaction.user.username,
    guildId: interaction.guildId,
    createdAt: now,
    expiresAt: now + ACTION_TTL_MS,
    status: "queued",
    claimedUntil: 0,
    result: null
  };

  discordActionQueue.set(id, action);
  return action;
}

async function sendActionAudit(interaction, title, description, color = 0x2b7fff) {
  if (!ACTION_LOG_CHANNEL_ID) return;

  try {
    const channel = await client.channels.fetch(ACTION_LOG_CHANNEL_ID);
    if (!channel?.isTextBased()) return;

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(color)
          .setTitle(title)
          .setDescription(description)
          .setTimestamp()
      ]
    });
  } catch (err) {
    console.error("[AUDIT] Failed to send action log:", err);
  }
}

function cleanExpiredActions() {
  const now = Date.now();
  for (const [id, action] of discordActionQueue) {
    if (action.expiresAt <= now || (action.status === "completed" && now - action.completedAt > 60 * 60 * 1000)) {
      discordActionQueue.delete(id);
    } else if (action.status === "claimed" && action.claimedUntil <= now) {
      action.status = "queued";
      action.claimedUntil = 0;
    }
  }
}

setInterval(cleanExpiredActions, 5 * 60 * 1000).unref();

function buildProfileEmbed(profile) {
  const divisionsText =
    Array.isArray(profile.divisions) && profile.divisions.length > 0
      ? profile.divisions.map(d => `• ${d.name} — **${d.role}**`).join("\n")
      : "None";

  const joinedText = profile.firstJoinUnix ? `<t:${profile.firstJoinUnix}:D>` : "N/A";
  const updatedText = profile.lastUpdateUnix ? `<t:${profile.lastUpdateUnix}:R>` : "N/A";

  return new EmbedBuilder()
    .setColor(0x2b7fff)
    .setTitle(`${profile.username} | TARC PROFILE`)
    .setDescription([
      `**Rank**`,
      `${profile.mainRankName || "Unknown"}`,
      ``,
      `**Divisions**`,
      `${divisionsText}`,
      ``,
      `**Stats**`,
      `Kills: ${profile.kills ?? "N/A"}`,
      `Playtime: ${formatCompactTime(profile.playTimeSeconds)}`,
      ``,
      `**Medals**`,
      `${getMedals(profile.userId)}`,
      ``,
      `**Info**`,
      `First Joined: ${joinedText}`,
      `Last Update: ${updatedText}`
    ].join("\n"));
}

async function buildBGCEmbed(usernameInput) {
  const resolved = await resolveRobloxUser(usernameInput);
  if (!resolved) return { error: "Couldn’t find that Roblox user." };

  const [userDetails, avatarUrl, groupRoles] = await Promise.all([
    getRobloxUserDetails(resolved.userId),
    getRobloxAvatarHeadshot(resolved.userId),
    getRobloxUserGroupRoles(resolved.userId)
  ]);

  const cachedProfile = getCachedProfileByResolvedUser(resolved);
  const divisions = getDivisionsFromGroupRoles(groupRoles);

  const mainRank = cachedProfile?.mainRankName || getMainGroupRoleFromGroupRoles(groupRoles);
  const mainRankNumber = getMainGroupRankNumber(groupRoles);
  const shownDivisions = divisions.filter((d) => d.id !== MAIN_GROUP_ID);

  const divisionsText = shownDivisions.length > 0
    ? shownDivisions.map((d) => `• ${d.name} — **${d.role}**`).join("\n")
    : "None";

  const punishments = Array.isArray(cachedProfile?.punishments) ? cachedProfile.punishments : [];
  const punishmentText = userDetails.isBanned
    ? "Roblox account is banned"
    : punishments.length > 0
      ? punishments.slice(0, 5).map((p) => `• ${String(p)}`).join("\n")
      : "None found";

  const status = getTarcStatus({
    userDetails,
    divisions,
    mainRankName: mainRank,
    mainRankNumber,
    punishments
  });

  const createdUnix = Math.floor(new Date(userDetails.created).getTime() / 1000);
  const firstSeenText = cachedProfile?.firstJoinUnix ? `<t:${cachedProfile.firstJoinUnix}:R>` : "No game data";

  const embed = new EmbedBuilder()
    .setColor(status.text.includes("🔴") ? 0xff3b30 : status.text.includes("🟠") ? 0xff9500 : 0x2b7fff)
    .setTitle(`${resolved.username} | Background Check`)
    .setDescription([
      `**TARC Status:** ${status.text}`,
      safeTrim(status.reasons.map((r) => `• ${r}`).join("\n"), 450),
      ``,
      `**User ID:** ${resolved.userId}`,
      `**Display Name:** ${resolved.displayName}`,
      ``,
      `**Account**`,
      `Age: ${formatAccountAge(userDetails.created)}`,
      `Created: <t:${createdUnix}:D>`,
      `First Seen In Game: ${firstSeenText}`,
      ``,
      `**TARC**`,
      `Rank: ${mainRank || "Unknown"}`,
      `Divisions:`,
      safeTrim(divisionsText, 700),
      ``,
      `**Punishments**`,
      safeTrim(punishmentText, 500)
    ].join("\n"));

  if (avatarUrl) embed.setThumbnail(avatarUrl);
  return { embed };
}

async function buildChainOfCommandEmbed() {
  const rolesData = await fetchJson(`https://groups.roblox.com/v1/groups/${ROBLOX_GROUP_ID}/roles`);
  const roles = rolesData?.roles || [];
  const lines = [];

  for (const roleName of CHAIN_OF_COMMAND_ROLES) {
    const role = roles.find((r) => String(r.name).toLowerCase() === roleName.toLowerCase());
    if (!role) {
      lines.push(`**${roleName}:** Role not found`);
      continue;
    }

    try {
      const users = await fetchJson(
        `https://groups.roblox.com/v1/groups/${ROBLOX_GROUP_ID}/roles/${role.id}/users?limit=100&sortOrder=Asc`
      );
      const names = (users?.data || []).map((u) => u.username || u.name).filter(Boolean);
      lines.push(`**${roleName}:** ${names.length > 0 ? names.join(", ") : "Vacant"}`);
    } catch {
      lines.push(`**${roleName}:** Could not fetch`);
    }
  }

  return applyCommandImage(
    new EmbedBuilder()
      .setColor(0x2b7fff)
      .setTitle("TARC Chain of Command")
      .setDescription(lines.join("\n"))
      .setFooter({ text: "Pulled from Roblox group roles" })
  );
}


function chooseChatRevivePrompt() {
  const available = CHAT_REVIVE_PROMPTS
    .map((prompt, index) => ({ prompt, index }))
    .filter(({ index }) => !recentChatReviveIndexes.includes(index));

  const pool = available.length ? available : CHAT_REVIVE_PROMPTS.map((prompt, index) => ({ prompt, index }));
  const chosen = pool[Math.floor(Math.random() * pool.length)];

  recentChatReviveIndexes.push(chosen.index);
  while (recentChatReviveIndexes.length > CHAT_REVIVE_MIN_REPEAT_GAP) {
    recentChatReviveIndexes.shift();
  }

  return chosen.prompt;
}

async function maybeSendChatRevive() {
  try {
    const channel = await client.channels.fetch(CHAT_REVIVE_CHANNEL_ID);
    if (!channel?.isTextBased?.() || !channel.messages?.fetch) return;

    const recent = await channel.messages.fetch({ limit: 1 });
    const lastMessage = recent.first();

    if (lastMessage && Date.now() - lastMessage.createdTimestamp < CHAT_REVIVE_MIN_IDLE_MS) {
      console.log("[CHAT REVIVE] Skipped because chat is active.");
      return;
    }

    const prompt = chooseChatRevivePrompt();
    await channel.send({
      content: prompt,
      allowedMentions: { parse: [] }
    });

    console.log("[CHAT REVIVE] Sent:", prompt);
  } catch (err) {
    console.error("[CHAT REVIVE] Failed:", err);
  }
}

function normalizeBroadcastEmbed(raw) {
  if (!raw || typeof raw !== "object") return null;

  const embed = new EmbedBuilder();

  if (raw.title) embed.setTitle(String(raw.title).slice(0, 256));
  if (raw.description) embed.setDescription(String(raw.description).slice(0, 4000));
  if (raw.color != null && Number.isFinite(Number(raw.color))) {
    embed.setColor(Math.max(0, Math.min(0xffffff, Number(raw.color))));
  }
  if (raw.footer) embed.setFooter({ text: String(raw.footer).slice(0, 2048) });
  if (raw.thumbnail && String(raw.thumbnail).startsWith("https://")) embed.setThumbnail(String(raw.thumbnail));
  if (raw.image && String(raw.image).startsWith("https://")) embed.setImage(String(raw.image));

  const json = embed.toJSON();
  const hasContent = Boolean(json.title || json.description || json.footer || json.thumbnail || json.image);
  return hasContent ? embed : null;
}

// ==================== ROUTES ====================
app.get("/", (req, res) => res.status(200).send("TARC profile bot running"));

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    cacheSize: profileCache.size
  });
});


app.get("/terms", (req, res) => {
  const html = renderLegalPage({
    title: "TARC Bot Terms of Service",
    subtitle: "Terms governing use of the TARC Bot Discord application.",
    sections: [
      {
        heading: "1. Acceptance",
        body: `<p>By installing, accessing, or using TARC Bot, you agree to these Terms and to comply with Discord's applicable terms and policies. If you do not agree, do not use the bot.</p>`
      },
      {
        heading: "2. Purpose",
        body: `<p>TARC Bot provides community and management features for The Grand Republic Clone Army, including TARC information, Roblox lookups, profiles, background checks, rank-management tools for authorised staff, role-management tools, links, statistics, and the <code>/ask</code> assistant.</p>`
      },
      {
        heading: "3. Eligibility and permissions",
        body: `<p>You must be permitted to use Discord and the server or account context in which you use TARC Bot. Staff-only commands may only be used by members who hold the required Discord roles or permissions. Attempting to bypass command restrictions, impersonate authorised staff, or misuse management features is prohibited.</p>`
      },
      {
        heading: "4. AI assistant",
        body: `<p>The <code>/ask</code> assistant is an informational feature. It may summarise TARC knowledge, official announcement content, and live Roblox/Discord context. AI-generated responses can be incomplete or incorrect. Official TARC rules, announcements, and authorised staff decisions take priority over an AI response.</p>
        <p>The assistant must not be treated as authorisation to promote, demote, punish, ban, rank, assign roles, award XP, or perform another management action. Dedicated commands and normal staff permissions remain required.</p>`
      },
      {
        heading: "5. Acceptable use",
        body: `<p>You may not use TARC Bot to harass others, obtain or disclose private/classified material, evade moderation, exploit Discord or Roblox, interfere with the service, automate abusive requests, or violate Discord, Roblox, or applicable law.</p>`
      },
      {
        heading: "6. Availability and changes",
        body: `<p>TARC Bot is provided on an as-available basis. Features may be changed, suspended, rate-limited, or removed. External services such as Discord, Roblox, Google Gemini, and Railway may affect availability.</p>`
      },
      {
        heading: "7. Enforcement",
        body: `<p>Access to TARC Bot or particular commands may be limited or revoked where necessary to protect the service, users, TARC, or comply with platform rules.</p>`
      },
      {
        heading: "8. Third-party services",
        body: `<p>TARC Bot interacts with Discord and Roblox and may use Google Gemini to generate <code>/ask</code> responses. Those services are governed by their own terms and policies.</p>`
      },
      {
        heading: "9. Contact",
        body: `<p>Questions about these Terms can be raised with TARC leadership through the main TARC Discord server: <a href="https://discord.gg/reeYBQDwHm">discord.gg/reeYBQDwHm</a>.</p>`
      }
    ]
  });

  res.type("html").status(200).send(html);
});

app.get("/privacy", (req, res) => {
  const html = renderLegalPage({
    title: "TARC Bot Privacy Policy",
    subtitle: "How TARC Bot accesses, uses, stores, and shares data.",
    sections: [
      {
        heading: "1. Information TARC Bot may process",
        body: `<p>Depending on the feature you use, TARC Bot may process:</p>
        <ul>
          <li>Discord user IDs, usernames, display names, server membership, and role information.</li>
          <li>Slash-command inputs and questions submitted through <code>/ask</code>.</li>
          <li>Recent message content, embeds, and attachment names from selected official TARC announcement, Chain of Command, and divisional recruitment channels when needed to answer a relevant question.</li>
          <li>Roblox usernames, user IDs, group memberships, group roles, and public Roblox group information.</li>
          <li>Game/profile information submitted by TARC game servers, such as kills, playtime, cash, rank, divisions, and related profile data used by bot features.</li>
          <li>Owner-approved knowledge added through the owner-only <code>/teach</code> feature and anonymous/aggregate-style question-topic trends used to improve answer relevance.</li>
        </ul>`
      },
      {
        heading: "2. How information is used",
        body: `<p>Information is used only to operate TARC Bot features, answer questions, verify relevant TARC/Roblox context, display profiles/statistics, perform authorised commands, improve response relevance, protect the service, and diagnose errors.</p>`
      },
      {
        heading: "3. AI processing",
        body: `<p>When you use <code>/ask</code>, your question and relevant contextual information may be sent to Google's Gemini API so that a response can be generated. Context can include your TARC display name/roles, relevant TARC knowledge, selected official announcement content, and relevant public Roblox information. TARC Bot is designed to send only context that is useful for the question.</p>`
      },
      {
        heading: "4. Storage and retention",
        body: `<ul>
          <li>Short conversational context for <code>/ask</code> is kept temporarily in memory so follow-up questions can make sense.</li>
          <li>Recent official Discord messages fetched for question answering are cached briefly to reduce repeated API requests.</li>
          <li>Game/profile cache data may be held in memory and can reset when the hosting service restarts.</li>
          <li>Question trend data and owner-approved <code>/teach</code> entries may be stored in the bot's assistant-state storage. Trend data is used to identify commonly discussed topics, not to create authoritative facts from ordinary user messages.</li>
          <li>Operational logs may temporarily contain technical request/error information needed to maintain the service.</li>
        </ul>
        <p>Data is retained only for as long as reasonably needed for the feature, security, troubleshooting, or applicable legal/platform requirements.</p>`
      },
      {
        heading: "5. Sharing and service providers",
        body: `<p>TARC Bot does not sell personal data. Data may be processed by service providers required to run the bot, including Discord, Railway (hosting), Google Gemini (AI responses), and Roblox/public Roblox APIs. Information may also be disclosed where required by law or necessary to protect users or the service.</p>`
      },
      {
        heading: "6. Message content",
        body: `<p>TARC Bot uses Discord message-content access for selected official TARC channels so it can answer questions about recent announcements, updates, Chain of Command information, and current-week recruitment. The bot is not intended to continuously ingest ordinary private conversations or general chat for AI training.</p>`
      },
      {
        heading: "7. User corrections and learning",
        body: `<p>Ordinary <code>/ask</code> messages do not automatically become official TARC facts. Normal users cannot permanently teach the assistant through conversation. Permanent approved knowledge can only be added through restricted owner-controlled functionality.</p>`
      },
      {
        heading: "8. Data requests and deletion",
        body: `<p>You may request access, correction, or deletion of data associated with your use of TARC Bot by contacting TARC leadership through the main TARC Discord server at <a href="https://discord.gg/reeYBQDwHm">discord.gg/reeYBQDwHm</a>. Include enough information to identify the relevant Discord or Roblox account and the data you are asking about. Requests will be handled subject to applicable law, platform requirements, and legitimate security needs.</p>`
      },
      {
        heading: "9. Security",
        body: `<p>Reasonable technical measures are used to limit access to secrets and management functions, including environment variables, role/owner restrictions, and restricted command handling. No online service can guarantee absolute security.</p>`
      },
      {
        heading: "10. Changes to this policy",
        body: `<p>This policy may be updated as TARC Bot features or data practices change. The effective date shown at the top will be updated when material changes are made.</p>`
      },
      {
        heading: "11. Contact",
        body: `<p>Privacy questions or requests can be raised with TARC leadership through <a href="https://discord.gg/reeYBQDwHm">the main TARC Discord server</a>.</p>`
      }
    ]
  });

  res.type("html").status(200).send(html);
});



app.get("/control", (req, res) => {
  res.type("html").status(200).send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="dark" />
  <title>TARC Bot Control</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0d1017;
      --panel: #161a24;
      --panel2: #10141c;
      --text: #f3f6fb;
      --muted: #9da8ba;
      --line: #2a3140;
      --accent: #4f9cff;
      --good: #48c78e;
      --bad: #ff6464;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: radial-gradient(circle at top, #172033 0%, var(--bg) 42%);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .wrap {
      width: min(760px, calc(100% - 28px));
      margin: 48px auto;
    }
    .card {
      background: rgba(22, 26, 36, .96);
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 26px;
      box-shadow: 0 18px 60px rgba(0,0,0,.28);
    }
    h1 { margin: 0; font-size: 1.8rem; }
    .sub { color: var(--muted); margin: 6px 0 24px; }
    label { display: block; font-weight: 700; margin: 18px 0 8px; }
    input, textarea, select {
      width: 100%;
      border: 1px solid var(--line);
      background: var(--panel2);
      color: var(--text);
      border-radius: 10px;
      padding: 12px 13px;
      font: inherit;
      outline: none;
    }
    textarea { min-height: 125px; resize: vertical; }
    input:focus, textarea:focus, select:focus { border-color: var(--accent); }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .hidden { display: none; }
    button {
      width: 100%;
      margin-top: 22px;
      padding: 13px 16px;
      border: 0;
      border-radius: 10px;
      background: var(--accent);
      color: white;
      font-weight: 800;
      font-size: 1rem;
      cursor: pointer;
    }
    button:disabled { opacity: .55; cursor: wait; }
    .notice {
      margin-top: 16px;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 12px;
      color: var(--muted);
      background: var(--panel2);
      display: none;
      white-space: pre-wrap;
    }
    .notice.good {
      display: block;
      color: var(--good);
      border-color: rgba(72,199,142,.4);
    }
    .notice.bad {
      display: block;
      color: var(--bad);
      border-color: rgba(255,100,100,.4);
    }
    .tiny { margin-top: 14px; color: var(--muted); font-size: .88rem; }
    code {
      background: #0a0d13;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 2px 6px;
    }
    @media (max-width: 640px) {
      .row { grid-template-columns: 1fr; }
      .card { padding: 20px; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>TARC Bot Control</h1>
      <p class="sub">Private owner broadcast panel for public chat.</p>

      <label for="secret">Owner Broadcast Secret</label>
      <input id="secret" type="password" autocomplete="off" placeholder="Enter your Railway secret" />

      <label for="mode">Message Type</label>
      <select id="mode">
        <option value="message">Normal Message</option>
        <option value="embed">Embed</option>
      </select>

      <div id="normalFields">
        <label for="message">Message</label>
        <textarea id="message" maxlength="2000" placeholder="Type what you want TARC Assistant to send..."></textarea>
      </div>

      <div id="embedFields" class="hidden">
        <label for="embedTitle">Embed Title</label>
        <input id="embedTitle" maxlength="256" placeholder="Optional title" />

        <label for="embedDescription">Embed Description</label>
        <textarea id="embedDescription" maxlength="4000" placeholder="Embed text"></textarea>

        <div class="row">
          <div>
            <label for="embedColor">Embed Color</label>
            <input id="embedColor" value="#2b7fff" placeholder="#2b7fff" />
          </div>
          <div>
            <label for="embedFooter">Footer</label>
            <input id="embedFooter" maxlength="2048" placeholder="Optional footer" />
          </div>
        </div>

        <label for="embedImage">Image URL</label>
        <input id="embedImage" type="url" placeholder="https://..." />

        <label for="embedThumbnail">Thumbnail URL</label>
        <input id="embedThumbnail" type="url" placeholder="https://..." />

        <label for="embedContent">Text Above Embed</label>
        <input id="embedContent" maxlength="2000" placeholder="Optional normal text above the embed" />
      </div>

      <button id="sendButton">Send to Public Chat</button>
      <div id="result" class="notice"></div>

      <p class="tiny">
        Posts only to <code>1380623761778151485</code>. A 10-minute server-side cooldown applies.
        Mentions are disabled.
      </p>
    </div>
  </div>

  <script>
    const mode = document.getElementById("mode");
    const normalFields = document.getElementById("normalFields");
    const embedFields = document.getElementById("embedFields");
    const button = document.getElementById("sendButton");
    const result = document.getElementById("result");

    mode.addEventListener("change", function () {
      const isEmbed = mode.value === "embed";
      normalFields.classList.toggle("hidden", isEmbed);
      embedFields.classList.toggle("hidden", !isEmbed);
      result.className = "notice";
      result.textContent = "";
    });

    function parseHexColor(value) {
      const cleaned = String(value || "").trim().replace(/^#/, "");
      if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return null;
      return parseInt(cleaned, 16);
    }

    button.addEventListener("click", async function () {
      result.className = "notice";
      result.textContent = "";

      const secret = document.getElementById("secret").value.trim();
      if (!secret) {
        result.className = "notice bad";
        result.textContent = "Enter your OWNER_BROADCAST_SECRET first.";
        return;
      }

      const payload = {
        secret: secret,
        channelId: "1380623761778151485"
      };

      if (mode.value === "message") {
        const content = document.getElementById("message").value.trim();
        if (!content) {
          result.className = "notice bad";
          result.textContent = "Type a message first.";
          return;
        }
        payload.content = content;
      } else {
        const description = document.getElementById("embedDescription").value.trim();
        const title = document.getElementById("embedTitle").value.trim();
        const content = document.getElementById("embedContent").value.trim();
        const footer = document.getElementById("embedFooter").value.trim();
        const image = document.getElementById("embedImage").value.trim();
        const thumbnail = document.getElementById("embedThumbnail").value.trim();
        const color = parseHexColor(document.getElementById("embedColor").value);

        if (!description && !title && !content && !image && !thumbnail) {
          result.className = "notice bad";
          result.textContent = "Add some embed content first.";
          return;
        }

        payload.content = content;
        payload.embed = {};
        if (title) payload.embed.title = title;
        if (description) payload.embed.description = description;
        if (footer) payload.embed.footer = footer;
        if (image) payload.embed.image = image;
        if (thumbnail) payload.embed.thumbnail = thumbnail;
        if (color !== null) payload.embed.color = color;
      }

      button.disabled = true;
      button.textContent = "Sending...";

      try {
        const response = await fetch("/owner-broadcast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        let data = {};
        try {
          data = await response.json();
        } catch (_) {}

        if (!response.ok) {
          throw new Error(data.error || ("HTTP " + response.status));
        }

        result.className = "notice good";
        result.textContent = "Sent successfully. Message ID: " + data.messageId;
      } catch (err) {
        result.className = "notice bad";
        result.textContent = String(err.message || err);
      } finally {
        button.disabled = false;
        button.textContent = "Send to Public Chat";
      }
    });
  </script>
</body>
</html>`);
});

app.post("/owner-broadcast", async (req, res) => {
  try {
    if (!OWNER_BROADCAST_SECRET) {
      return res.status(503).json({ error: "OWNER_BROADCAST_SECRET is not configured." });
    }

    const body = req.body || {};
    if (String(body.secret || "") !== OWNER_BROADCAST_SECRET) {
      return res.status(401).json({ error: "Invalid secret." });
    }

    const now = Date.now();
    if (now - lastOwnerBroadcastAt < OWNER_BROADCAST_COOLDOWN_MS) {
      const retryAfterMs = OWNER_BROADCAST_COOLDOWN_MS - (now - lastOwnerBroadcastAt);
      return res.status(429).json({
        error: "Broadcast cooldown active.",
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000)
      });
    }

    const channelId = String(body.channelId || "");
    if (!OWNER_BROADCAST_ALLOWED_CHANNELS.has(channelId)) {
      return res.status(403).json({ error: "That channel is not allowed for owner broadcasts." });
    }

    const content = String(body.content || "").trim().slice(0, 2000);
    const embed = normalizeBroadcastEmbed(body.embed);

    if (!content && !embed) {
      return res.status(400).json({ error: "Provide content and/or a valid embed." });
    }

    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased?.()) {
      return res.status(404).json({ error: "Channel not found or not text-based." });
    }

    const message = await channel.send({
      content: content || undefined,
      embeds: embed ? [embed] : undefined,
      allowedMentions: { parse: [] }
    });

    lastOwnerBroadcastAt = now;

    console.log(`[OWNER BROADCAST] Sent message ${message.id} to ${channelId}`);
    return res.status(200).json({
      ok: true,
      messageId: message.id,
      channelId
    });
  } catch (err) {
    console.error("[OWNER BROADCAST] Failed:", err);
    return res.status(500).json({ error: "Broadcast failed." });
  }
});

app.get("/ingest", (req, res) => {
  res.status(200).json({ ok: true, route: "ingest-get" });
});

app.post("/ingest", (req, res) => {
  try {
    const body = req.body || {};

    if (body.secret !== SHARED_SECRET) {
      console.warn("[INGEST] Invalid secret");
      return res.status(401).json({ error: "Invalid secret" });
    }

    if (body.loaded !== true) {
      return res.status(200).json({ ok: true, skipped: true, reason: "NotLoaded" });
    }

    const userId = Number(body.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ error: "Bad userId" });
    }

    const username = String(body.username || `UserId:${userId}`);
    const now = unixNow();
    const existing = profileCache.get(userId);

    const profile = {
      userId,
      username,
      xp: body.xp !== undefined ? Number(body.xp) : null,
      kills: body.kills !== undefined ? Number(body.kills) : null,
      playTimeSeconds: body.playTimeSeconds !== undefined ? Number(body.playTimeSeconds) : 0,
      cash: body.cash !== undefined ? Number(body.cash) : null,
      mainRankName: String(body.mainRankName || "Unknown"),
      divisions: Array.isArray(body.divisions) ? body.divisions : [],
      punishments: Array.isArray(body.punishments) ? body.punishments : [],
      firstJoinUnix: existing?.firstJoinUnix || (body.firstJoinUnix ? Number(body.firstJoinUnix) : now),
      lastUpdateUnix: now
    };

    profileCache.set(userId, profile);
    usernameToUserId.set(username.toLowerCase(), userId);

    console.log(`[INGEST] Stored ${username} (${userId}) XP=${profile.xp}`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[INGEST] ERROR:", err);
    return res.status(500).json({ error: "Server error", details: String(err?.message || err) });
  }
});


// ==================== ROBLOX ACTION API ====================
// Roblox polls these routes to claim Discord-created XP / Star Creator actions.
app.get("/roblox-actions/health", (req, res) => {
  cleanExpiredActions();

  let queued = 0;
  let claimed = 0;
  let completed = 0;

  for (const action of discordActionQueue.values()) {
    if (action.status === "queued") queued += 1;
    else if (action.status === "claimed") claimed += 1;
    else if (action.status === "completed") completed += 1;
  }

  res.status(200).json({ ok: true, queued, claimed, completed });
});

app.post("/roblox-actions/poll", (req, res) => {
  try {
    const body = req.body || {};

    if (body.secret !== SHARED_SECRET) {
      return res.status(401).json({ error: "Invalid secret" });
    }

    cleanExpiredActions();

    const now = Date.now();
    const limit = Math.max(1, Math.min(20, Number(body.limit) || 10));
    const jobId = String(body.jobId || "unknown");
    const actions = [];

    for (const action of discordActionQueue.values()) {
      if (actions.length >= limit) break;
      if (action.status !== "queued") continue;
      if (action.expiresAt <= now) continue;

      action.status = "claimed";
      action.claimedUntil = now + ACTION_CLAIM_MS;
      action.claimedByJobId = jobId;
      action.claimedAt = now;

      actions.push({
        id: action.id,
        type: action.type,
        operation: action.operation,
        userId: action.userId,
        username: action.username,
        amount: action.amount,
        reason: action.reason
      });
    }

    return res.status(200).json({ ok: true, actions });
  } catch (err) {
    console.error("[ROBLOX ACTIONS] Poll failed:", err);
    return res.status(500).json({ error: "Poll failed" });
  }
});

app.post("/roblox-actions/complete", async (req, res) => {
  try {
    const body = req.body || {};

    if (body.secret !== SHARED_SECRET) {
      return res.status(401).json({ error: "Invalid secret" });
    }

    const actionId = String(body.actionId || "");
    const action = discordActionQueue.get(actionId);

    if (!action) {
      return res.status(404).json({ error: "Action not found or expired" });
    }

    // Ignore duplicate completion reports safely.
    if (action.status === "completed") {
      return res.status(200).json({ ok: true, duplicate: true });
    }

    const reportingJobId = String(body.jobId || "unknown");
    if (action.claimedByJobId && action.claimedByJobId !== reportingJobId) {
      return res.status(409).json({ error: "Action was claimed by another server" });
    }

    action.status = "completed";
    action.completedAt = Date.now();
    action.result = {
      success: body.success === true,
      message: String(body.message || ""),
      oldValue: body.oldValue ?? null,
      newValue: body.newValue ?? null,
      jobId: reportingJobId
    };

    const resultColor = action.result.success ? 0x31c48d : 0xff3b30;
    await sendActionAudit(
      { user: { id: action.requestedByDiscordId } },
      `${action.type === "xp" ? "XP" : "Star Creator"} Action Completed`,
      [
        `**Target:** ${action.username} (${action.userId})`,
        `**Action:** ${action.operation}`,
        action.amount != null ? `**Amount:** ${action.amount}` : null,
        `**Success:** ${action.result.success ? "Yes" : "No"}`,
        action.result.oldValue != null ? `**Old value:** ${action.result.oldValue}` : null,
        action.result.newValue != null ? `**New value:** ${action.result.newValue}` : null,
        `**Message:** ${action.result.message || "No message"}`,
        `**Reason:** ${action.reason}`,
        `**Requested by:** <@${action.requestedByDiscordId}>`
      ].filter(Boolean).join("\n"),
      resultColor
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[ROBLOX ACTIONS] Completion failed:", err);
    return res.status(500).json({ error: "Completion failed" });
  }
});

// ==================== DISCORD ====================
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent]
});

function setBotStatus() {
  if (!client.user) return;

  client.user.setPresence({
    activities: [
      {
        name: BOT_STATUS_NAME,
        type: BOT_STATUS_TYPE
      }
    ],
    status: "online"
  });
}

function getGlobalAskCommand() {
  const command = new SlashCommandBuilder()
    .setName("ask")
    .setDescription("Ask the TARC Assistant a question")
    .addStringOption(option =>
      option
        .setName("question")
        .setDescription("Your TARC-related question")
        .setRequired(true)
        .setMaxLength(1000)
    )
    .toJSON();

  // Discord application integration types:
  // 0 = Guild Install, 1 = User Install.
  command.integration_types = [0, 1];

  // Discord interaction contexts:
  // 0 = Guild, 1 = Bot DM, 2 = Private Channel / Group DM.
  command.contexts = [0, 1, 2];

  return command;
}

function getSlashCommands() {
  return [
    new SlashCommandBuilder()
      .setName("profile")
      .setDescription("Show a user's TARC profile")
      .addStringOption(option => option.setName("username").setDescription("Roblox username").setRequired(true))
      .toJSON(),

    new SlashCommandBuilder()
      .setName("bgc")
      .setDescription("Run a Roblox background check")
      .addStringOption(option => option.setName("username").setDescription("Roblox username").setRequired(true))
      .toJSON(),

    new SlashCommandBuilder()
      .setName("groupstats")
      .setDescription("Show TARC Discord, Roblox group, and game stats")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("ranks")
      .setDescription("Show TARC XP rank requirements")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("quote")
      .setDescription("Generate a random Star Wars quote")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("links")
      .setDescription("Show useful TARC links")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("chainofcommand")
      .setDescription("Show TARC high command from Roblox group roles")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("verify")
      .setDescription("How to verify with RoWifi")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("xp")
      .setDescription("Add or remove up to 2 XP in one random XP progression")
      .addStringOption(option =>
        option
          .setName("action")
          .setDescription("Whether to add or remove XP")
          .setRequired(true)
          .addChoices(
            { name: "Add", value: "add" },
            { name: "Remove", value: "remove" }
          )
      )
      .addStringOption(option =>
        option
          .setName("usernames")
          .setDescription("Roblox usernames separated by commas")
          .setRequired(true)
      )
      .addIntegerOption(option =>
        option
          .setName("amount")
          .setDescription("XP per user (maximum 2)")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(MAX_XP_PER_TARGET)
      )
      .addStringOption(option =>
        option
          .setName("reason")
          .setDescription("Reason for this XP change")
          .setRequired(true)
          .setMaxLength(300)
      )
      .toJSON(),

    new SlashCommandBuilder()
      .setName("starcreator")
      .setDescription("Give or remove the permanent Star Creator tag")
      .addStringOption(option =>
        option
          .setName("action")
          .setDescription("Whether to give or remove the tag")
          .setRequired(true)
          .addChoices(
            { name: "Give", value: "give" },
            { name: "Remove", value: "remove" }
          )
      )
      .addStringOption(option =>
        option
          .setName("usernames")
          .setDescription("Roblox usernames separated by commas")
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName("reason")
          .setDescription("Reason for this change")
          .setRequired(true)
          .setMaxLength(300)
      )
      .toJSON(),

    new SlashCommandBuilder()
      .setName("promote")
      .setDescription("Promote a Roblox user to an exact TARC group rank name")
      .addStringOption(option => option.setName("username").setDescription("Exact Roblox username").setRequired(true))
      .addStringOption(option => option.setName("rank").setDescription("Exact Roblox group rank name").setRequired(true))
      .toJSON(),

    new SlashCommandBuilder()
      .setName("demote")
      .setDescription("Demote a Roblox user to an exact TARC group rank name")
      .addStringOption(option => option.setName("username").setDescription("Exact Roblox username").setRequired(true))
      .addStringOption(option => option.setName("rank").setDescription("Exact Roblox group rank name").setRequired(true))
      .toJSON(),

    new SlashCommandBuilder()
      .setName("rmp")
      .setDescription("Give one Discord member RMP and remove old enlisted roles")
      .addUserOption(option => option.setName("member").setDescription("Discord member to update").setRequired(true))
      .toJSON(),

    new SlashCommandBuilder()
      .setName("rmpall")
      .setDescription("Consolidate all old enlisted Discord roles into RMP")
      .addStringOption(option => option.setName("confirmation").setDescription("Type CONFIRM to run the server-wide update").setRequired(true))
      .toJSON(),


    new SlashCommandBuilder()
      .setName("teach")
      .setDescription("Owner-only: teach the TARC Assistant an approved fact")
      .addStringOption(option =>
        option
          .setName("information")
          .setDescription("The approved information the assistant should know")
          .setRequired(true)
          .setMaxLength(1500)
      )
      .addStringOption(option =>
        option
          .setName("topic")
          .setDescription("Short topic/category for this information")
          .setRequired(false)
          .setMaxLength(80)
      )
      .addStringOption(option =>
        option
          .setName("visibility")
          .setDescription("Whether /ask may use this information")
          .setRequired(false)
          .addChoices(
            { name: "Public / usable by ask", value: "public" },
            { name: "Private note / never exposed by ask", value: "private" }
          )
      )
      .toJSON(),

    new SlashCommandBuilder()
      .setName("help")
      .setDescription("Show all TARC Bot commands")
      .toJSON()
  ];
}

client.once(Events.ClientReady, async () => {
  console.log(`[DISCORD] Logged in as ${client.user.tag}`);

  setBotStatus();
  setInterval(setBotStatus, 5 * 60 * 1000);

  // Chat revive checks run every 6 hours and only post when the channel has been quiet.
  setTimeout(() => {
    maybeSendChatRevive();
    setInterval(maybeSendChatRevive, CHAT_REVIVE_INTERVAL_MS);
  }, 60 * 1000);

  try {
    const commands = getSlashCommands();
    const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

    // Register only /ask globally so it can work through Guild Install
    // and User Install (DMs, group DMs, and supported servers).
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: [getGlobalAskCommand()] }
    );
    console.log("[DISCORD] Global /ask command registered");

    // Existing management/community commands remain guild-only.
    for (const guildId of GUILD_IDS) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: commands });
      console.log(`[DISCORD] Guild slash commands registered for ${guildId}`);
    }

    if (!GUILD_IDS.length) {
      console.warn("[DISCORD] No GUILD_ID or GUILD_IDS configured.");
    }
  } catch (err) {
    console.error("[DISCORD] Command registration failed:", err);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ask") {
    try {
      const question = interaction.options.getString("question", true).trim();

      await interaction.deferReply();

      const answer = await askTarcAssistant({
        question,
        interaction,
        client
      });

      return interaction.editReply({
        content: answer,
        allowedMentions: { parse: [] }
      });
    } catch (err) {
      console.error("[DISCORD] /ask failed:", err);

      const message =
        "I couldn't reach the TARC Assistant right now. Please try again shortly.";

      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({ content: message });
      }

      return interaction.reply({ content: message, ephemeral: interaction.inGuild() });
    }
  }



  if (interaction.commandName === "teach") {
    try {
      if (!interaction.inGuild() || !interaction.guild) {
        return interaction.reply({ content: "This command can only be used in the main TARC server.", ephemeral: true });
      }

      if (interaction.guild.ownerId !== interaction.user.id) {
        return interaction.reply({ content: "Only the server owner can teach the TARC Assistant.", ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });

      const information = interaction.options.getString("information", true).trim();
      const topic = interaction.options.getString("topic")?.trim() || "general";
      const visibility = interaction.options.getString("visibility") || "public";

      const entry = await teachTarcAssistant({
        information,
        topic,
        visibility,
        interaction
      });

      return interaction.editReply(
        `✅ Taught the assistant under **${entry.topic}** (${entry.visibility}).\n` +
        `ID: \`${entry.id}\`\n\n` +
        `${entry.visibility === "public"
          ? "This information can now be used by /ask."
          : "This was saved as a private note and will not be exposed through /ask."}`
      );
    } catch (err) {
      console.error("[DISCORD] /teach failed:", err);
      const message = `❌ ${err.message || "The teaching could not be saved."}`;
      return interaction.deferred
        ? interaction.editReply(message)
        : interaction.reply({ content: message, ephemeral: true });
    }
  }

  if (interaction.commandName === "xp") {
    try {
      if (!memberHasRole(interaction, OFFICER_PERMISSION_ROLE_ID)) {
        return interaction.reply({
          content: "You need the **Officer Permission** role to use this command.",
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const operation = interaction.options.getString("action", true);
      const amount = interaction.options.getInteger("amount", true);
      const reason = interaction.options.getString("reason", true).trim();
      const usernames = parseUsernameList(interaction.options.getString("usernames", true));

      if (amount < 1 || amount > MAX_XP_PER_TARGET) {
        return interaction.editReply(`Amount must be between 1 and ${MAX_XP_PER_TARGET} XP.`);
      }
      if (!reason) return interaction.editReply("A reason is required.");
      if (!usernames.length) return interaction.editReply("Enter at least one Roblox username.");
      if (usernames.length > MAX_TARGETS_PER_COMMAND) {
        return interaction.editReply(`You can target a maximum of ${MAX_TARGETS_PER_COMMAND} users at once.`);
      }

      const results = await resolveRobloxUsers(usernames);
      const lines = [];
      const queued = [];

      for (const result of results) {
        if (!result.resolved) {
          lines.push(`❌ **${result.input}** — Roblox user not found`);
          continue;
        }

        const action = queueDiscordAction({
          type: "xp",
          operation,
          target: result.resolved,
          amount,
          reason,
          interaction
        });

        queued.push(action);
        lines.push(`✅ **${result.resolved.username}** — queued ${operation === "add" ? "+" : "-"}${amount} XP`);
      }

      const embed = new EmbedBuilder()
        .setColor(queued.length ? 0x2b7fff : 0xff3b30)
        .setTitle("XP Management")
        .setDescription([
          ...lines,
          "",
          `**Reason:** ${reason}`,
          `**Requested by:** <@${interaction.user.id}>`,
          "**Delivery:** Roblox randomly selects one XP progression for each target, then applies the queued change within several seconds."
        ].join("\n"))
        .setTimestamp();

      await sendActionAudit(
        interaction,
        "XP Management Request",
        [`**Action:** ${operation}`, `**Amount:** ${amount}`, `**Targets:** ${queued.map(a => a.username).join(", ") || "None"}`, `**Reason:** ${reason}`, `**Staff:** <@${interaction.user.id}>`].join("\n")
      );

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error("[DISCORD] /xp failed:", err);
      const message = "Something went wrong while queueing the XP action.";
      return interaction.deferred ? interaction.editReply(message) : interaction.reply({ content: message, ephemeral: true });
    }
  }

  if (interaction.commandName === "starcreator") {
    try {
      if (!memberHasRole(interaction, CONTENT_CREATOR_MANAGER_ROLE_ID)) {
        return interaction.reply({
          content: "You need the **Content Creator Manager** role to use this command.",
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const operation = interaction.options.getString("action", true);
      const reason = interaction.options.getString("reason", true).trim();
      const usernames = parseUsernameList(interaction.options.getString("usernames", true));

      if (!reason) return interaction.editReply("A reason is required.");
      if (!usernames.length) return interaction.editReply("Enter at least one Roblox username.");
      if (usernames.length > MAX_TARGETS_PER_COMMAND) {
        return interaction.editReply(`You can target a maximum of ${MAX_TARGETS_PER_COMMAND} users at once.`);
      }

      const results = await resolveRobloxUsers(usernames);
      const lines = [];
      const queued = [];

      for (const result of results) {
        if (!result.resolved) {
          lines.push(`❌ **${result.input}** — Roblox user not found`);
          continue;
        }

        const action = queueDiscordAction({
          type: "starcreator",
          operation,
          target: result.resolved,
          reason,
          interaction
        });

        queued.push(action);
        lines.push(`✅ **${result.resolved.username}** — queued Star Creator ${operation}`);
      }

      const embed = new EmbedBuilder()
        .setColor(queued.length ? 0xffcc00 : 0xff3b30)
        .setTitle("Star Creator Management")
        .setDescription([
          ...lines,
          "",
          `**Reason:** ${reason}`,
          `**Requested by:** <@${interaction.user.id}>`,
          "**Delivery:** Online users update immediately after Roblox applies it; offline users update on their next join."
        ].join("\n"))
        .setTimestamp();

      await sendActionAudit(
        interaction,
        "Star Creator Request",
        [`**Action:** ${operation}`, `**Targets:** ${queued.map(a => a.username).join(", ") || "None"}`, `**Reason:** ${reason}`, `**Staff:** <@${interaction.user.id}>`].join("\n"),
        0xffcc00
      );

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error("[DISCORD] /starcreator failed:", err);
      const message = "Something went wrong while queueing the Star Creator action.";
      return interaction.deferred ? interaction.editReply(message) : interaction.reply({ content: message, ephemeral: true });
    }
  }

  if (interaction.commandName === "promote" || interaction.commandName === "demote") {
    const direction = interaction.commandName;
    try {
      if (!(await hasRankManagementAccess(interaction))) {
        return interaction.reply({
          content: "You must be **Marshal Commander or higher** to use this command.",
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: true });
      const username = interaction.options.getString("username", true).trim();
      const rankName = interaction.options.getString("rank", true).trim();
      const result = await setRobloxGroupRoleByExactName(username, rankName, direction);

      await sendActionAudit(
        interaction,
        `Roblox ${direction === "promote" ? "Promotion" : "Demotion"}`,
        [
          `**User:** ${result.resolved.username} (${result.resolved.userId})`,
          `**Old rank:** ${result.oldRole} (${result.oldRank})`,
          `**New rank:** ${result.newRole} (${result.newRank})`,
          `**Staff:** <@${interaction.user.id}>`
        ].join("\n"),
        direction === "promote" ? 0x31c48d : 0xff9500
      );

      return interaction.editReply(
        `✅ **${result.resolved.username}** was ${direction === "promote" ? "promoted" : "demoted"} from **${result.oldRole}** to **${result.newRole}**.`
      );
    } catch (err) {
      console.error(`[DISCORD] /${direction} failed:`, err);
      const message = `❌ ${err.message || "The Roblox rank change failed."}`;
      return interaction.deferred ? interaction.editReply(message) : interaction.reply({ content: message, ephemeral: true });
    }
  }

  if (interaction.commandName === "rmp") {
    try {
      if (!(await hasRankManagementAccess(interaction))) {
        return interaction.reply({ content: "You must be **Marshal Commander or higher** to use this command.", ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      const user = interaction.options.getUser("member", true);
      const member = await interaction.guild.members.fetch(user.id);
      const result = await applyRmpDiscordRoles(member);

      if (!result.removed && !result.addedRmp) {
        return interaction.editReply(`ℹ️ ${member} already has RMP and has no old enlisted roles.`);
      }

      return interaction.editReply(
        `✅ Updated ${member}: ${result.addedRmp ? "added RMP" : "kept RMP"}; removed ${result.removed} old enlisted role(s).`
      );
    } catch (err) {
      console.error("[DISCORD] /rmp failed:", err);
      const message = `❌ ${err.message || "The Discord role update failed."}`;
      return interaction.deferred ? interaction.editReply(message) : interaction.reply({ content: message, ephemeral: true });
    }
  }

  if (interaction.commandName === "rmpall") {
    try {
      if (!(await hasAdministratorAccess(interaction))) {
        return interaction.reply({ content: "You need the **Administrator** role to use the mass RMP command.", ephemeral: true });
      }

      const confirmation = interaction.options.getString("confirmation", true).trim();
      if (confirmation !== "CONFIRM") {
        return interaction.reply({ content: "Cancelled. Enter **CONFIRM** exactly to run the server-wide role cleanup.", ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      await interaction.guild.members.fetch();

      const candidates = interaction.guild.members.cache.filter((member) =>
        !member.user.bot && (
          member.roles.cache.has(RMP_ROLE_ID) ||
          OLD_ENLISTED_ROLE_IDS.some((roleId) => member.roles.cache.has(roleId))
        )
      );

      let changed = 0;
      let unchanged = 0;
      let failed = 0;
      let processed = 0;

      for (const member of candidates.values()) {
        try {
          const result = await applyRmpDiscordRoles(member);
          if (result.removed || result.addedRmp) changed += 1;
          else unchanged += 1;
        } catch (err) {
          failed += 1;
          console.error(`[RMPALL] Failed for ${member.user.tag} (${member.id}):`, err);
        }

        processed += 1;
        if (processed % 25 === 0) {
          await interaction.editReply(`Processing RMP cleanup… ${processed}/${candidates.size}`);
        }
      }

      await sendActionAudit(
        interaction,
        "Discord RMP Bulk Cleanup",
        [
          `**Candidates:** ${candidates.size}`,
          `**Changed:** ${changed}`,
          `**Already clean:** ${unchanged}`,
          `**Failed:** ${failed}`,
          `**Staff:** <@${interaction.user.id}>`
        ].join("\n"),
        failed ? 0xff9500 : 0x31c48d
      );

      return interaction.editReply(
        `✅ RMP cleanup complete. **Candidates:** ${candidates.size} | **Changed:** ${changed} | **Already clean:** ${unchanged} | **Failed:** ${failed}`
      );
    } catch (err) {
      console.error("[DISCORD] /rmpall failed:", err);
      const message = `❌ ${err.message || "The bulk Discord role update failed."}`;
      return interaction.deferred ? interaction.editReply(message) : interaction.reply({ content: message, ephemeral: true });
    }
  }

  if (interaction.commandName === "profile") {
    const usernameInput = interaction.options.getString("username", true);
    try {
      await interaction.deferReply();
      const resolved = await resolveRobloxUser(usernameInput);
      if (!resolved) return interaction.editReply("Couldn’t find that Roblox user.");

      const profile = getCachedProfileByResolvedUser(resolved);
      if (!profile) {
        return interaction.editReply("Player has no set data yet (they may have never joined the game, or the game hasn’t sent data yet).");
      }

      return interaction.editReply({ embeds: [buildProfileEmbed(profile)] });
    } catch (err) {
      console.error("[DISCORD] /profile failed:", err);
      return interaction.editReply("Something went wrong fetching that profile.");
    }
  }

  if (interaction.commandName === "bgc") {
    const usernameInput = interaction.options.getString("username", true);
    try {
      await interaction.deferReply();
      const result = await buildBGCEmbed(usernameInput);
      if (result.error) return interaction.editReply(result.error);
      return interaction.editReply({ embeds: [result.embed] });
    } catch (err) {
      console.error("[DISCORD] /bgc failed:", err);
      return interaction.editReply("Something went wrong running that background check.");
    }
  }

  if (interaction.commandName === "groupstats") {
    try {
      await interaction.deferReply();

      const robloxGroup = await getRobloxGroupStats();
      const gameStats = await getRobloxGameStats();

      let discordMembers = 0;
      try {
        const guild = await client.guilds.fetch(interaction.guildId || GUILD_ID);
        const fullGuild = await guild.fetch();
        discordMembers = fullGuild.memberCount || 0;
      } catch {
        discordMembers = interaction.guild?.memberCount || 0;
      }

      const embed = applyCommandImage(
        new EmbedBuilder()
          .setColor(0x2b7fff)
          .setTitle("TARC Group Stats")
          .setDescription([
            `**Discord**`,
            `Members: ${formatNumber(discordMembers)}`,
            ``,
            `**Roblox Group**`,
            `Members: ${formatNumber(robloxGroup.memberCount || 0)}`,
            ``,
            `**Game**`,
            `Current Players: ${formatNumber(gameStats?.playing || 0)}`,
            `Visits: ${formatNumber(gameStats?.visits || 0)}`,
            ``,
            `Last Updated: <t:${unixNow()}:R>`
          ].join("\n"))
      );

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error("[DISCORD] /groupstats failed:", err);
      return interaction.editReply("Something went wrong fetching group stats.");
    }
  }

  if (interaction.commandName === "quote") {
    const quote = STAR_WARS_QUOTES[Math.floor(Math.random() * STAR_WARS_QUOTES.length)];
    const embed = applyCommandImage(
      new EmbedBuilder()
        .setColor(0x2b7fff)
        .setTitle("Star Wars Quote")
        .setDescription(`“${quote}”`)
    );

    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === "ranks") {
    const lines = XP_RANKS.map((rank) => `• **${rank.name}** — ${rank.xp} XP`).join("\n");
    const embed = applyCommandImage(
      new EmbedBuilder()
        .setColor(0x2b7fff)
        .setTitle("TARC XP Rank Requirements")
        .setDescription(lines)
    );
    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === "links") {
    const embed = applyCommandImage(
      new EmbedBuilder()
        .setColor(0x2b7fff)
        .setTitle("TARC Links")
        .setDescription([
          `**[Roblox Group](${TARC_GROUP_LINK})**`,
          `**[TARC Game](${TARC_GAME_LINK})**`,
          `**[Reports & Appeals Server](${REPORTS_APPEALS_LINK})**`,
          `**[Republic Lawbook Trello](${LAWBOOK_LINK})**`
        ].join("\n"))
    );
    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === "chainofcommand") {
    try {
      await interaction.deferReply();
      const embed = await buildChainOfCommandEmbed();
      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error("[DISCORD] /chainofcommand failed:", err);
      return interaction.editReply("Something went wrong fetching chain of command.");
    }
  }

  if (interaction.commandName === "verify") {
    const embed = applyCommandImage(
      new EmbedBuilder()
        .setColor(0x2b7fff)
        .setTitle("How To Verify")
        .setDescription([
          `**1. Join the TARC Roblox group**`,
          `[Click here to join the group](${TARC_GROUP_LINK})`,
          ``,
          `**2. Go to <#${BOT_CMDS_CHANNEL_ID}>**`,
          `Run \`/verify\` with RoWifi. If you are already connected, run \`/update\`.`,
          ``,
          `**3. Your roles should update**`,
          `You can always run \`/update\` after ranking up in-game or in the group.`
        ].join("\n"))
    );
    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === "help") {
    const embed = applyCommandImage(
      new EmbedBuilder()
        .setColor(0x2b7fff)
        .setTitle("TARC Bot Commands")
        .setDescription([
          `**/profile** — Show a player's TARC profile from game data`,
          `**/bgc** — Run a Roblox background check`,
          `**/groupstats** — Show Discord, group, and game stats`,
          `**/ranks** — Show XP rank requirements`,
          `**/quote** — Generate a random Star Wars quote`,
          `**/links** — Show useful TARC links`,
          `**/chainofcommand** — Show current high command`,
          `**/verify** — Show RoWifi verification steps`,
          `**/xp** — Add or remove up to 2 XP in one random progression (Officer Permission)`,
          `**/starcreator** — Give or remove the creator tag (Content Creator Manager)`,
          `**/promote** — Promote a Roblox user to an exact rank name (Marshal Commander+)`,
          `**/demote** — Demote a Roblox user to an exact rank name (Marshal Commander+)`,
          `**/rmp** — Clean one member’s enlisted Discord roles (Marshal Commander+)`,
          `**/rmpall** — Clean all enlisted Discord roles into RMP (Marshal Commander+)`,
          `**/ask** — Ask the TARC Assistant (also available through user install / DMs)`,
          `**/teach** — Owner-only: add approved assistant knowledge`,
          `**/help** — Show this command list`
        ].join("\n"))
    );
    return interaction.reply({ embeds: [embed] });
  }
});

client.login(DISCORD_TOKEN).catch(err => {
  console.error("[DISCORD] Login failed:", err);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[HTTP] Listening on port ${PORT}`);
});
