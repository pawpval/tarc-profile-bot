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

// Optional image for non-BGC command embeds. Must be a real https:// image URL.
// file:///C:/Users/... will NOT work on Railway/Discord.
const COMMAND_IMAGE_URL = String(process.env.COMMAND_IMAGE_URL || "");

// ==================== CONFIG ====================
const BOT_STATUS_TEXT = "discord.gg/tarcs 🔥";
const BOT_STATUS_TYPE = 3; // 3 = Watching

const TARC_GROUP_LINK = `https://www.roblox.com/groups/${ROBLOX_GROUP_ID}/TARC`;
const TARC_GAME_LINK = "https://www.roblox.com/games/79834733161236";
const REPORTS_APPEALS_LINK = "https://discord.gg/TsvyxSav43";
const LAWBOOK_LINK = "https://trello.com/b/25mjJPCy/tarc-regulations-punishments";
const BOT_CMDS_CHANNEL_ID = "1318201600908460089";

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
  { xp: 3, name: "Trooper" },
  { xp: 6, name: "Specialist" },
  { xp: 12, name: "Corporal" },
  { xp: 18, name: "Sergeant" },
  { xp: 28, name: "Staff Sergeant" },
  { xp: 35, name: "Master Sergeant" },
  { xp: 50, name: "Sergeant Major" },
  { xp: 75, name: "Warrant Officer" },
  { xp: 100, name: "Upper Warrant Officer" },
  { xp: 125, name: "Command Warrant Officer" },
  { xp: 200, name: "Chief Warrant Officer" },
  { xp: 300, name: "Elite Recruit" },
  { xp: 335, name: "Elite Sergeant" },
  { xp: 380, name: "Elite Lieutenant" },
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

// ==================== EMBEDS ====================
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
      `XP: ${profile.xp ?? "N/A"}`,
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

// ==================== ROUTES ====================
app.get("/", (req, res) => res.status(200).send("TARC profile bot running"));

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    cacheSize: profileCache.size
  });
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

// ==================== DISCORD ====================
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

function setBotStatus() {
  if (!client.user) return;
  client.user.setPresence({
    activities: [{ name: BOT_STATUS_TEXT, type: BOT_STATUS_TYPE }],
    status: "online"
  });
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
      .setName("xpleaderboard")
      .setDescription("Show top 10 cached XP users")
      .toJSON(),

    new SlashCommandBuilder()
      .setName("viewxp")
      .setDescription("Show your own cached XP using your Discord nickname")
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
      .setName("help")
      .setDescription("Show all TARC Bot commands")
      .toJSON()
  ];
}

client.once(Events.ClientReady, async () => {
  console.log(`[DISCORD] Logged in as ${client.user.tag}`);

  setBotStatus();
  setInterval(setBotStatus, 5 * 60 * 1000);

  try {
    const commands = getSlashCommands();
    const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

    // Main server commands update fast.
    if (GUILD_ID) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log("[DISCORD] Guild slash commands registered");
    }

    // Global commands allow the bot to work in division servers too.
    // These can take some time to appear.
        // DUPLICATE COMMAND FIX:
    // Clear GLOBAL commands and register GUILD commands only.
    // This stops Discord from showing 2 copies of every command.
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
    console.log("[DISCORD] Global slash commands cleared");

    for (const guildId of GUILD_IDS) {
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body: commands });
      console.log(`[DISCORD] Guild slash commands registered for ${guildId}`);
    }

    if (!GUILD_IDS.length) {
      console.warn("[DISCORD] No GUILD_ID or GUILD_IDS set, so no slash commands were registered.");
    }
  } catch (err) {
    console.error("[DISCORD] Command registration failed:", err);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

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

  if (interaction.commandName === "xpleaderboard") {
    try {
      await interaction.deferReply();
      const top = Array.from(profileCache.values())
        .filter((p) => typeof p.xp === "number" && !Number.isNaN(p.xp))
        .sort((a, b) => b.xp - a.xp)
        .slice(0, 10);

      const lines = top.length
        ? top.map((p, i) => `**${i + 1}.** ${p.username} — ${formatNumber(p.xp)} XP`).join("\n")
        : "No cached XP data yet. Players need to join the game first.";

      const embed = applyCommandImage(
        new EmbedBuilder()
          .setColor(0x2b7fff)
          .setTitle("TARC XP Leaderboard")
          .setDescription(lines)
          .setFooter({ text: "Cached data resets if the Railway service restarts." })
      );

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error("[DISCORD] /xpleaderboard failed:", err);
      return interaction.editReply("Something went wrong fetching the XP leaderboard.");
    }
  }

  if (interaction.commandName === "viewxp") {
    try {
      await interaction.deferReply({ ephemeral: true });

      const possibleUsername = extractPossibleUsernameFromMember(interaction.member);
      if (!possibleUsername) {
        return interaction.editReply("I couldn’t detect your Roblox username from your Discord nickname.");
      }

      const resolved = await resolveRobloxUser(possibleUsername);
      if (!resolved) {
        return interaction.editReply("I found a possible name in your nickname, but it was not a valid Roblox username.");
      }

      const profile = getCachedProfileByResolvedUser(resolved);
      if (!profile) {
        return interaction.editReply("I found your Roblox user, but I do not have cached game data for you yet. Join the game first.");
      }

      const embed = new EmbedBuilder()
        .setColor(0x2b7fff)
        .setTitle(`${profile.username} | XP`)
        .setDescription([
          `**XP:** ${profile.xp ?? "N/A"}`,
          `**Kills:** ${profile.kills ?? "N/A"}`,
          `**Playtime:** ${formatCompactTime(profile.playTimeSeconds)}`
        ].join("\n"));

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error("[DISCORD] /viewxp failed:", err);
      return interaction.editReply("Something went wrong checking your XP.");
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
          `**/xpleaderboard** — Show top cached XP users`,
          `**/viewxp** — Show your own cached XP`,
          `**/ranks** — Show XP rank requirements`,
          `**/quote** — Generate a random Star Wars quote`,
          `**/links** — Show useful TARC links`,
          `**/chainofcommand** — Show current high command`,
          `**/verify** — Show RoWifi verification steps`,
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
