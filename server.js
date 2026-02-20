import express from "express";
import crypto from "crypto";
import process from "process";
import { Client, GatewayIntentBits, EmbedBuilder, REST, Routes } from "discord.js";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// === REQUIRED ENV ===
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const GROUP_ID = String(process.env.GROUP_ID || "35324584");
const SHARED_SECRET = String(process.env.SHARED_SECRET || "");

// Optional (not required for reads, but you already added it)
const ROBLOX_API_KEY = process.env.ROBLOX_API_KEY || "";

// ===============================
// DIVISIONS (your exact mapping)
// ===============================
const divisionGroups = {
  35324584: "Republic Army",
  35326817: "91st Reconnaissance Corps",
  35328710: "41st Elite Corps",
  35326823: "327th Legion",
  35326812: "Advanced Recon Commandos",
  35326815: "Coruscant Guard",
  35326827: "Red Guards",
  12658410: "Republic Commandos",
  35326830: "Republic Intelligence",
  33943342: "Galactic Senate",
  16060314: "Senate Guard",
  16282238: "The Jedi Order",
};

const divisionOrder = [
  35324584, 35326817, 35326823, 35326812, 35326815,
  35326827, 12658410, 35326830, 33943342, 16060314,
  16282238, 35328710,
];

// ===============================
// MEDALS (ported from your module)
// ===============================
const medalAssignments = {
  621243206:  ["Medal Of Honor", "Distinguished Service", "Achivement Of Activity", "Medal Of Stars Honesty", "Leaderships Medal Of Honour", "Invaluted's Bravery"],
  2808148032: ["Achivement Of Activity"],
  1439310935: ["Medal Of Honor", "Achivement Of Activity"],
  2411349338: ["Medal Of Stars Honesty"],
  4278897258: ["Medal Of Dedication"],
  1301506053: ["Distinguished Service", "Medal Of Dedication"],
  3799212924: ["Leaderships Medal Of Honour", "Achivement Of Activity"],
  2493429350: ["Medal Of Stars Honesty"],
  4981240382: ["Medal Of Honor", "Distinguished Service", "Achivement Of Activity", "Medal Of Stars Honesty"],
  1120715283: ["Medal Of Honor", "Distinguished Service", "Medal Of Stars Honesty", "Leaderships Medal Of Honour", "Medal Of Dedication", "Achivement Of Activity"],
  1208840794: ["Medal Of Honor", "Distinguished Service", "Medal Of Stars Honesty", "Leaderships Medal Of Honour"],
};

// ===============================
// IN-MEMORY CACHE (stats from Roblox)
// Roblox will POST to /ingest
// ===============================
/**
 * statsCache[userId] = {
 *   xp: number,
 *   kills: number,
 *   playTimeSeconds: number,  // total seconds
 *   firstSeenISO: string,     // first time we saw data
 *   lastUpdatedISO: string
 * }
 */
const statsCache = new Map();

// ---- helpers ----
async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* ignore */ }

  if (!res.ok) {
    const msg = data ? JSON.stringify(data) : text;
    throw new Error(`HTTP ${res.status} @ ${url} :: ${msg}`);
  }
  return data;
}

function formatDurationCompact(totalSeconds) {
  totalSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  // Your rule: don’t show 0d or 0h if they’re zero
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0 || d > 0) parts.push(`${h}h`); // if days shown, show hours too
  if (m > 0 || h > 0 || d > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

async function usernameToUserId(username) {
  const body = {
    usernames: [username],
    excludeBannedUsers: false
  };
  const data = await fetchJson("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const hit = data?.data?.[0];
  return hit?.id ? Number(hit.id) : null;
}

async function userIdToUsername(userId) {
  const data = await fetchJson(`https://users.roblox.com/v1/users/${userId}`);
  return data?.name || `UserId:${userId}`;
}

async function getGroupRole(groupId, userId) {
  // This endpoint returns the user’s role in that group if they’re a member.
  // If not a member, it errors; we handle that.
  try {
    const data = await fetchJson(`https://groups.roblox.com/v2/users/${userId}/groups/roles`);
    const groups = data?.data || [];
    const match = groups.find(g => Number(g.group?.id) === Number(groupId));
    if (!match) return null;
    return {
      groupId: Number(groupId),
      groupName: match.group?.name || divisionGroups[groupId] || `Group ${groupId}`,
      roleName: match.role?.name || "Member",
      roleRank: match.role?.rank ?? null,
    };
  } catch {
    return null;
  }
}

async function getMainRank(userId) {
  const res = await getGroupRole(Number(GROUP_ID), userId);
  if (!res) return { name: "Not in group", role: "N/A" };
  return { name: res.groupName, role: res.roleName };
}

async function getDivisions(userId) {
  // Pull all group roles once (fast), then map in your order.
  let data;
  try {
    data = await fetchJson(`https://groups.roblox.com/v2/users/${userId}/groups/roles`);
  } catch {
    return [];
  }

  const list = data?.data || [];
  const byGroupId = new Map();
  for (const item of list) {
    const gid = Number(item.group?.id);
    byGroupId.set(gid, {
      groupId: gid,
      groupName: item.group?.name || divisionGroups[gid] || `Group ${gid}`,
      roleName: item.role?.name || "Member",
      roleRank: item.role?.rank ?? null,
    });
  }

  const divisions = [];
  for (const gid of divisionOrder) {
    const info = byGroupId.get(Number(gid));
    if (!info) continue;
    const displayName = divisionGroups[gid] || info.groupName;
    divisions.push(`${displayName}: **${info.roleName}**`);
  }
  return divisions;
}

async function getOnDuty(userId) {
  try {
    const data = await fetchJson("https://presence.roblox.com/v1/presence/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: [Number(userId)] }),
    });

    const p = data?.userPresences?.[0];
    // 2 = InGame, 1 = Online, 0 = Offline (Roblox presence types)
    const inGame = p?.userPresenceType === 2;
    return inGame;
  } catch {
    return false;
  }
}

function getMedals(userId) {
  const medals = medalAssignments[Number(userId)];
  if (!medals || medals.length === 0) return "None";
  // Keep it readable in Discord
  return medals.map(m => `• ${m}`).join("\n");
}

// ===============================
// Roblox -> Bot Stats Ingest API
// ===============================
// Roblox will POST { secret, userId, xp, kills, playTimeSeconds }
app.post("/ingest", (req, res) => {
  try {
    const { secret, userId, xp, kills, playTimeSeconds } = req.body || {};
    if (!SHARED_SECRET || secret !== SHARED_SECRET) {
      return res.status(401).json({ ok: false, error: "Invalid secret" });
    }

    const id = Number(userId);
    if (!id || !Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: "Bad userId" });
    }

    const nowISO = new Date().toISOString();
    const existing = statsCache.get(id);

    const record = {
      xp: Math.max(0, Number(xp) || 0),
      kills: Math.max(0, Number(kills) || 0),
      playTimeSeconds: Math.max(0, Math.floor(Number(playTimeSeconds) || 0)),
      firstSeenISO: existing?.firstSeenISO || nowISO,
      lastUpdatedISO: nowISO,
    };

    statsCache.set(id, record);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false });
  }
});

app.get("/", (req, res) => {
  res.send("TARC Profile Bot running ✅");
});

// ===============================
// DISCORD BOT
// ===============================
if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.warn("[BOOT] Missing DISCORD_TOKEN / CLIENT_ID / GUILD_ID in Railway Variables.");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

async function registerSlashCommands() {
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

  const commands = [
    {
      name: "profile",
      description: "Show a Roblox user's TARC profile",
      options: [
        {
          name: "username",
          description: "Roblox username",
          type: 3, // STRING
          required: true,
        },
      ],
    },
  ];

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );

  console.log("[Discord] Slash commands registered.");
}

async function buildProfileEmbed(username) {
  const userId = await usernameToUserId(username);
  if (!userId) {
    return { error: `Couldn’t find Roblox user **${username}**.` };
  }

  const displayName = await userIdToUsername(userId);

  const mainRank = await getMainRank(userId);
  const divisions = await getDivisions(userId);
  const onDuty = await getOnDuty(userId);

  const stats = statsCache.get(userId);
  if (!stats) {
    // They exist on Roblox but you don’t have game stats cached yet
    return {
      error:
        `**${displayName}** exists, but has **no saved game data** yet.\n` +
        `They need to **join the game once** so the server can send stats.`,
      userId,
    };
  }

  const medalsText = getMedals(userId);

  const embed = new EmbedBuilder()
    .setTitle(`${displayName} | TARC PROFILE`)
    .setDescription("**Users info:**")
    .addFields(
      { name: "🪖 Rank", value: `**${mainRank.role}**`, inline: false },

      {
        name: "🟦 Division(s)",
        value: divisions.length ? divisions.join("\n") : "None",
        inline: false,
      },

      {
        name: "⏱ Time Played",
        value: formatDurationCompact(stats.playTimeSeconds),
        inline: true,
      },
      { name: "🎯 XP", value: String(stats.xp), inline: true },
      { name: "☠ Kills", value: String(stats.kills), inline: true },

      { name: "🏅 Medals", value: medalsText, inline: false },

      {
        name: "On duty",
        value: onDuty ? "🟢 In game" : "🔴 Not in game",
        inline: true,
      },
      {
        name: "Joined game (first seen by bot)",
        value: stats.firstSeenISO ? `<t:${Math.floor(new Date(stats.firstSeenISO).getTime() / 1000)}:F>` : "N/A",
        inline: true,
      }
    )
    .setFooter({ text: `UserId: ${userId} • Last update: ${stats.lastUpdatedISO}` });

  return { embed };
}

client.on("ready", async () => {
  console.log(`[Discord] Logged in as ${client.user.tag}`);
  try {
    await registerSlashCommands();
  } catch (e) {
    console.log("[Discord] Slash command register failed:", String(e?.message || e));
  }
});

// Slash command
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "profile") return;

  const username = interaction.options.getString("username", true);

  await interaction.deferReply({ ephemeral: false });

  try {
    const result = await buildProfileEmbed(username);
    if (result.error) {
      return interaction.editReply(result.error);
    }
    return interaction.editReply({ embeds: [result.embed] });
  } catch (e) {
    return interaction.editReply("Profile failed (internal error).");
  }
});

// Prefix command: !profile username
client.on("messageCreate", async (msg) => {
  if (!msg.guild) return;
  if (msg.author.bot) return;

  const content = msg.content.trim();
  if (!content.toLowerCase().startsWith("!profile")) return;

  const parts = content.split(/\s+/);
  const username = parts[1];
  if (!username) {
    return msg.reply("Use: `!profile robloxUsername`");
  }

  try {
    const result = await buildProfileEmbed(username);
    if (result.error) return msg.reply(result.error);
    return msg.reply({ embeds: [result.embed] });
  } catch {
    return msg.reply("Profile failed (internal error).");
  }
});

// Start both Discord + Express
client.login(DISCORD_TOKEN);
app.listen(PORT, () => console.log(`HTTP server running on port ${PORT}`));
