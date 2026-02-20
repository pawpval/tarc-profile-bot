import express from "express";
import fetch from "node-fetch";
import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder
} from "discord.js";

// --------------------
// ENV
// --------------------
const PORT = Number(process.env.PORT || 3000); // Railway provides PORT automatically
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const SHARED_SECRET = process.env.SHARED_SECRET;

// Required for slash command registration
const CLIENT_ID = process.env.CLIENT_ID;   // Discord Application ID
const GUILD_ID = process.env.GUILD_ID;     // Your Discord server ID (for fast testing)

if (!DISCORD_TOKEN) throw new Error("Missing DISCORD_TOKEN env var");
if (!SHARED_SECRET) throw new Error("Missing SHARED_SECRET env var");
if (!CLIENT_ID) throw new Error("Missing CLIENT_ID env var");
if (!GUILD_ID) throw new Error("Missing GUILD_ID env var");

// --------------------
// EXPRESS (HTTP)
// --------------------
const app = express();
app.use(express.json());

// Simple in-memory cache (userId -> profile object)
const profileCache = new Map();

// Optional medals mapping (keep/extend if you want)
const MedalAssignments = {
  621243206: ["Medal Of Honor", "Distinguished Service", "Achivement Of Activity", "Medal Of Stars Honesty", "Leaderships Medal Of Honour", "Invaluted's Bravery"],
  2808148032: ["Achivement Of Activity"],
  1439310935: ["Medal Of Honor", "Achivement Of Activity"],
  2411349338: ["Medal Of Stars Honesty"],
  4278897258: ["Medal Of Dedication"],
  1301506035: ["Distinguished Service", "Medal Of Dedication"],
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

// Roblox username -> userId (so /profile can accept usernames)
async function resolveRobloxUserId(username) {
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

// --------------------
// ROBLOX -> BOT ingest endpoint
// --------------------
app.post("/ingest", (req, res) => {
  try {
    const body = req.body || {};

    if (body.secret !== SHARED_SECRET) {
      return res.status(401).json({ error: "Invalid secret" });
    }

    const userId = Number(body.userId);
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    const nowUnix = Math.floor(Date.now() / 1000);

    // Store only what we need
    profileCache.set(userId, {
      userId,
      username: String(body.username || `UserId:${userId}`),
      xp: body.xp !== undefined ? Number(body.xp) : null,
      kills: body.kills !== undefined ? Number(body.kills) : null,
      playTimeSeconds: body.playTimeSeconds !== undefined ? Number(body.playTimeSeconds) : 0,
      mainRankName: String(body.mainRankName || "Unknown"),
      divisions: Array.isArray(body.divisions) ? body.divisions : [],
      firstJoinUnix: body.firstJoinUnix ? Number(body.firstJoinUnix) : null,
      lastUpdateUnix: nowUnix
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error("INGEST ERROR:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// Simple health page
app.get("/", (req, res) => res.send("TARC profile bot running"));

// IMPORTANT: Visiting /ingest in browser = GET -> will not work (only POST).
app.get("/ingest", (req, res) => {
  res.status(405).send("Use POST /ingest (this endpoint is for Roblox server -> bot).");
});

// Start HTTP server (Railway needs this)
app.listen(PORT, () => {
  console.log(`HTTP server listening on ${PORT}`);
});

// --------------------
// DISCORD BOT (Slash commands)
// --------------------
const client = new Client({
  intents: [GatewayIntentBits.Guilds] // ONLY THIS (prevents disallowed intents crash)
});

function buildEmbed(profile) {
  const medalsText = getMedals(profile.userId);

  const divisionsLines =
    profile.divisions && profile.divisions.length > 0
      ? profile.divisions.map((d) => `> ◆ **${d.name}**: ${d.role}`).join("\n")
      : "None";

  const joinedGameLine =
    profile.firstJoinUnix
      ? `<t:${profile.firstJoinUnix}:D> (<t:${profile.firstJoinUnix}:R>)`
      : "N/A";

  const lastUpdateLine =
    profile.lastUpdateUnix
      ? `<t:${profile.lastUpdateUnix}:R>`
      : "N/A";

  const embed = new EmbedBuilder()
    .setTitle(`${profile.username} | TARC PROFILE`)
    .setDescription(
      [
        "**Users info:**",
        "",
        `🪖 **Rank:** ${profile.mainRankName || "Unknown"}`,
        `🧩 **Division(s):**`,
        divisionsLines,
        "",
        `⏱️ **Time Played:** ${formatCompactTime(profile.playTimeSeconds)}`,
        `🎯 **XP:** ${profile.xp ?? "N/A"}`,
        `🔫 **Kills:** ${profile.kills ?? "N/A"}`,
        `🏅 **Medals:** ${medalsText}`,
        "",
        `📌 **First joined game:** ${joinedGameLine}`,
        `🕒 **Last update:** ${lastUpdateLine}`
      ].join("\n")
    );

  return embed;
}

async function registerGuildCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("profile")
      .setDescription("Show a TARC profile by Roblox username")
      .addStringOption((opt) =>
        opt
          .setName("username")
          .setDescription("Roblox username (exact)")
          .setRequired(true)
      )
      .toJSON()
  ];

  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
    body: commands
  });

  console.log("✅ Slash commands registered (guild).");
}

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  try {
    await registerGuildCommands();
  } catch (e) {
    console.error("❌ Failed to register commands:", e);
  }
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "profile") {
      const username = interaction.options.getString("username", true);

      await interaction.deferReply({ ephemeral: false });

      const resolved = await resolveRobloxUserId(username);
      if (!resolved) {
        return interaction.editReply("Couldn’t find that Roblox user.");
      }

      const profile = profileCache.get(resolved.userId);
      if (!profile) {
        return interaction.editReply(
          "Player has no set data yet (they may have never joined the game, or the game hasn’t sent data yet)."
        );
      }

      // If Roblox returns proper casing, keep embed consistent
      profile.username = resolved.username;

      const embed = buildEmbed(profile);
      return interaction.editReply({ embeds: [embed] });
    }
  } catch (e) {
    console.error("INTERACTION ERROR:", e);
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply("Something went wrong fetching that profile.");
    } else {
      return interaction.reply({ content: "Something went wrong.", ephemeral: true });
    }
  }
});

client.login(DISCORD_TOKEN);
