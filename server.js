import express from "express";
import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ENV VARS (Railway Variables)
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;     // Discord App ID
const GUILD_ID = process.env.GUILD_ID;       // Your server ID (for fast command update)
const SHARED_SECRET = process.env.SHARED_SECRET;

if (!DISCORD_TOKEN) throw new Error("Missing DISCORD_TOKEN env var");
if (!CLIENT_ID) throw new Error("Missing CLIENT_ID env var");
if (!GUILD_ID) throw new Error("Missing GUILD_ID env var");
if (!SHARED_SECRET) throw new Error("Missing SHARED_SECRET env var");

// ----------------------------
// In-memory profile cache
// userId -> { userId, username, xp, kills, playTimeSeconds, divisions, mainRankName, firstJoinUnix, lastUpdateUnix }
// ----------------------------
const profileCache = new Map();

// ----------------------------
// Helpers
// ----------------------------
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

async function resolveRobloxUserId(username) {
  // Node 22 has global fetch
  const res = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const found = data?.data?.[0];
  if (!found?.id) return null;
  return { userId: found.id, username: found.name };
}

function buildEmbed(profile) {
  const divisionsLines =
    profile.divisions && profile.divisions.length > 0
      ? profile.divisions.map((d) => `• **${d.name}:** ${d.role}`).join("\n")
      : "None";

  const joinedGameLine = profile.firstJoinUnix
    ? `<t:${profile.firstJoinUnix}:D> (<t:${profile.firstJoinUnix}:R>)`
    : "N/A";

  const embed = new EmbedBuilder()
    .setTitle(`${profile.username} | TARC PROFILE`)
    .setDescription(
      [
        "**Users info:**",
        "",
        `🪖 **Rank:** ${profile.mainRankName || "Unknown"}`,
        `🎖️ **Division(s):**`,
        divisionsLines,
        "",
        `⏱️ **Time Played:** ${formatCompactTime(profile.playTimeSeconds)}`,
        `🧪 **XP:** ${profile.xp ?? "N/A"}`,
        `🔫 **Kills:** ${profile.kills ?? "N/A"}`,
        "",
        `📌 **First joined game:** ${joinedGameLine}`,
        `🕒 **Last update:** ${
          profile.lastUpdateUnix ? `<t:${profile.lastUpdateUnix}:R>` : "N/A"
        }`,
      ].join("\n")
    );

  return embed;
}

// ----------------------------
// ROBLOX -> BOT ingest endpoint
// ----------------------------
app.post("/ingest", (req, res) => {
  try {
    const body = req.body || {};

    if (body.secret !== SHARED_SECRET) {
      return res.status(401).json({ error: "Invalid secret" });
    }

    const userId = Number(body.userId);
    if (!userId) return res.status(400).json({ error: "Missing userId" });

    const nowUnix = Math.floor(Date.now() / 1000);

    profileCache.set(userId, {
      userId,
      username: String(body.username || `UserId:${userId}`),
      xp: body.xp !== undefined ? Number(body.xp) : null,
      kills: body.kills !== undefined ? Number(body.kills) : null,
      playTimeSeconds: body.playTimeSeconds !== undefined ? Number(body.playTimeSeconds) : 0,
      mainRankName: String(body.mainRankName || "Unknown"),
      divisions: Array.isArray(body.divisions) ? body.divisions : [],
      firstJoinUnix: body.firstJoinUnix ? Number(body.firstJoinUnix) : null,
      lastUpdateUnix: nowUnix,
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Server error" });
  }
});

app.get("/", (_, res) => res.send("TARC profile bot running"));

// ----------------------------
// DISCORD BOT (slash command)
// ----------------------------
const client = new Client({
  intents: [GatewayIntentBits.Guilds], // NO MessageContent needed
});

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("profile")
      .setDescription("Show a TARC profile for a Roblox username")
      .addStringOption((opt) =>
        opt
          .setName("username")
          .setDescription("Roblox username")
          .setRequired(true)
      )
      .toJSON(),
  ];

  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

  // Guild-scoped registration updates instantly (best while testing)
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
    body: commands,
  });

  console.log("✅ Slash commands registered for this guild.");
}

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  try {
    await registerCommands();
  } catch (e) {
    console.error("❌ Failed to register commands:", e);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "profile") return;

  try {
    const username = interaction.options.getString("username", true);
    await interaction.deferReply();

    const resolved = await resolveRobloxUserId(username);
    if (!resolved) return interaction.editReply("Couldn’t find that Roblox user.");

    const profile = profileCache.get(resolved.userId);
    if (!profile) {
      return interaction.editReply(
        "Player has no set data yet (they may have never joined the game)."
      );
    }

    const embed = buildEmbed(profile);
    return interaction.editReply({ embeds: [embed] });
  } catch (e) {
    console.error(e);
    return interaction.reply({
      content: "Something went wrong fetching that profile.",
      ephemeral: true,
    });
  }
});

client.login(DISCORD_TOKEN);

// ----------------------------
// Start HTTP server (Railway needs this)
// ----------------------------
app.listen(PORT, () => {
  console.log(`HTTP server listening on ${PORT}`);
});
