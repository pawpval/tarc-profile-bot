import express from "express";
import { Client, GatewayIntentBits, EmbedBuilder } from "discord.js";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const SHARED_SECRET = process.env.SHARED_SECRET;

if (!DISCORD_TOKEN) throw new Error("Missing DISCORD_TOKEN env var");
if (!SHARED_SECRET) throw new Error("Missing SHARED_SECRET env var");

// ----------------------------------------------------
// Simple in-memory cache (safe + low memory)
// userId -> { username, xp, kills, playTimeSeconds, divisions, mainRankName, firstJoinUnix, lastUpdateUnix }
// ----------------------------------------------------
const profileCache = new Map();

// ----------------------------------------------------
// Your medals mapping (same as your Lua module)
// ----------------------------------------------------
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

// ----------------------------------------------------
// Helpers
// ----------------------------------------------------
function formatCompactTime(seconds) {
  seconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const d = Math.floor(seconds / 86400);
  seconds %= 86400;
  const h = Math.floor(seconds / 3600);
  seconds %= 3600;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;

  // Don’t show 0d / 0h if empty, but always show something
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0 || parts.length) parts.push(`${h}h`);
  if (m > 0 || parts.length) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}

async function resolveRobloxUserId(username) {
  // Use Roblox usernames endpoint
  const res = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
  });

  if (!res.ok) return null;
  const data = await res.json();
  const found = data?.data?.[0];
  if (!found?.id) return null;
  return { userId: found.id, username: found.name };
}

function buildEmbed(profile) {
  const medalsText = getMedals(profile.userId);

  const divisionsLines = (profile.divisions && profile.divisions.length > 0)
    ? profile.divisions.map(d => `🔹 **${d.name}:** ${d.role}`).join("\n")
    : "None";

  const joinedGameLine = profile.firstJoinUnix
    ? `<t:${profile.firstJoinUnix}:D> (<t:${profile.firstJoinUnix}:R>)`
    : "N/A";

  const embed = new EmbedBuilder()
    .setTitle(`${profile.username} | TARC PROFILE`)
    .setDescription(
      [
        `**Users info:**`,
        ``,
        `🪖 **Rank:** ${profile.mainRankName || "Unknown"}`,
        `🪖 **Division(s):**`,
        divisionsLines,
        ``,
        `⏱️ **Time Played:** ${formatCompactTime(profile.playTimeSeconds)}`,
        `🎯 **XP:** ${profile.xp ?? "N/A"}`,
        `🔫 **Kills:** ${profile.kills ?? "N/A"}`,
        `🏅 **Medals:** ${medalsText}`,
        ``,
        `📌 **First joined game:** ${joinedGameLine}`,
        `🕒 **Last update:** ${profile.lastUpdateUnix ? `<t:${profile.lastUpdateUnix}:R>` : "N/A"}`
      ].join("\n")
    );

  return embed;
}

// ----------------------------------------------------
// ROBLOX -> BOT ingest endpoint
// ----------------------------------------------------
app.post("/ingest", (req, res) => {
  try {
    const body = req.body || {};
    if (body.secret !== SHARED_SECRET) {
      return res.status(401).json({ error: "Invalid secret" });
    }

    const userId = Number(body.userId);
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    const nowUnix = Math.floor(Date.now() / 1000);

    // Keep only what we need (low memory)
    profileCache.set(userId, {
      userId,
      username: String(body.username || `UserId:${userId}`),
      xp: (body.xp !== undefined ? Number(body.xp) : null),
      kills: (body.kills !== undefined ? Number(body.kills) : null),
      playTimeSeconds: (body.playTimeSeconds !== undefined ? Number(body.playTimeSeconds) : 0),
      mainRankName: String(body.mainRankName || "Unknown"),
      divisions: Array.isArray(body.divisions) ? body.divisions : [],
      firstJoinUnix: body.firstJoinUnix ? Number(body.firstJoinUnix) : null,
      lastUpdateUnix: nowUnix
    });

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/", (req, res) => res.send("TARC profile bot running"));

// ----------------------------------------------------
// DISCORD BOT
// ----------------------------------------------------
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// !profile <username>
client.on("messageCreate", async (msg) => {
  try {
    if (msg.author.bot) return;
    const content = msg.content.trim();
    if (!content.toLowerCase().startsWith("!profile")) return;

    const parts = content.split(/\s+/);
    const username = parts[1];
    if (!username) {
      return msg.reply("Usage: `!profile <robloxUsername>`");
    }

    const resolved = await resolveRobloxUserId(username);
    if (!resolved) return msg.reply("Couldn’t find that Roblox user.");

    const profile = profileCache.get(resolved.userId);
    if (!profile) {
      return msg.reply("Player has no set data yet (they may have never joined the game).");
    }

    const embed = buildEmbed(profile);
    return msg.reply({ embeds: [embed] });
  } catch (e) {
    console.error(e);
    return msg.reply("Something went wrong fetching that profile.");
  }
});

// Optional slash command handling later (kept simple for now)

client.login(DISCORD_TOKEN);

// ----------------------------------------------------
// Start HTTP server (Railway needs this)
// ----------------------------------------------------
app.listen(PORT, () => {
  console.log(`HTTP server listening on ${PORT}`);
});
