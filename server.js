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
  const entry = groupRoles.find((item) => String(item?.group?.id) === String(ROBLOX_GROUP_ID));
  return entry?.role?.name || "Not in group";
}

function getDivisionsFromGroupRoles(groupRoles) {
  return groupRoles
    .filter((item) => String(item?.group?.id) !== String(ROBLOX_GROUP_ID))
    .filter((item) => item?.group?.name && item?.role?.name)
    .map((item) => ({
      name: String(item.group.name),
      role: String(item.role.name)
    }));
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
  const mainRank = cachedProfile?.mainRankName || getMainGroupRoleFromGroupRoles(groupRoles);
  const divisions = cachedProfile?.divisions?.length ? cachedProfile.divisions : getDivisionsFromGroupRoles(groupRoles);

  const divisionsText = divisions.length > 0
    ? divisions.slice(0, 8).map((d) => `• ${d.name} — **${d.role}**`).join("\n")
    : "None";

  const createdUnix = Math.floor(new Date(userDetails.created).getTime() / 1000);
  const firstSeenText = cachedProfile?.firstJoinUnix ? `<t:${cachedProfile.firstJoinUnix}:R>` : "No game data";
  const punishmentText = userDetails.isBanned ? "Roblox account is banned" : "None found";

  const embed = new EmbedBuilder()
    .setColor(userDetails.isBanned ? 0xff3b30 : 0x2b7fff)
    .setTitle(`${resolved.username} | Background Check`)
    .setDescription([
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
      safeTrim(divisionsText, 900),
      ``,
      `**Punishments**`,
      punishmentText
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
      .setName("ranks")
      .setDescription("Show TARC XP rank requirements")
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
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("[DISCORD] Global slash commands registered");
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
          `**/ranks** — Show XP rank requirements`,
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
