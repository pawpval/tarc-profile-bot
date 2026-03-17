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

// ===== ENV =====
const PORT = Number(process.env.PORT || 8080);
const DISCORD_TOKEN = String(process.env.DISCORD_TOKEN || "");
const SHARED_SECRET = String(process.env.SHARED_SECRET || "");
const CLIENT_ID = String(process.env.CLIENT_ID || "");
const GUILD_ID = String(process.env.GUILD_ID || "");

// ===== HARD LOGGING / SAFETY =====
process.on("uncaughtException", (err) => {
  console.error("[FATAL] uncaughtException:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] unhandledRejection:", reason);
});

app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);
  next();
});

app.use(express.json({ limit: "1mb" }));

app.use((err, req, res, next) => {
  console.error("[HTTP] JSON parse error:", err);
  res.status(400).json({ error: "Bad JSON body" });
});

// ===== CACHE =====
const profileCache = new Map();
const usernameToUserId = new Map();

// ===== MEDALS =====
const MedalAssignments = {
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

async function resolveRobloxUser(username) {
  const res = await fetch("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      usernames: [username],
      excludeBannedUsers: false
    })
  });

  const data = await res.json().catch(() => null);
  const found = data?.data?.[0];
  if (!found?.id) return null;

  return {
    userId: Number(found.id),
    username: String(found.name)
  };
}

function buildEmbed(profile) {
  const divisionsText =
    Array.isArray(profile.divisions) && profile.divisions.length > 0
      ? profile.divisions.map(d => `🔹 ${d.name}: **${d.role}**`).join("\n")
      : "None";

  const joinedText = profile.firstJoinUnix
    ? `<t:${profile.firstJoinUnix}:D> (<t:${profile.firstJoinUnix}:R>)`
    : "N/A";

  const updatedText = profile.lastUpdateUnix
    ? `<t:${profile.lastUpdateUnix}:R>`
    : "N/A";

  return new EmbedBuilder()
    .setColor(0x2b7fff)
    .setTitle(`🪖 ${profile.username} | TARC PROFILE`)
    .setDescription([
      `**Users info:**`,
      ``,
      `🎖️ **Rank:** ${profile.mainRankName || "Unknown"}`,
      `🪖 **Division(s):**`,
      `${divisionsText}`,
      ``,
      `⏱️ **Time Played:** ${formatCompactTime(profile.playTimeSeconds)}`,
      `🎯 **XP:** ${profile.xp ?? "N/A"}`,
      `💥 **Kills:** ${profile.kills ?? "N/A"}`,
      `🏅 **Medals:** ${getMedals(profile.userId)}`,
      ``,
      `📌 **First joined game:** ${joinedText}`,
      `🕒 **Last update:** ${updatedText}`
    ].join("\n"));
}

// ===== HTTP ROUTES =====
app.get("/", (req, res) => {
  res.status(200).send("TARC profile bot running");
});

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
    console.log("[INGEST] Body received:", JSON.stringify(req.body));

    const body = req.body || {};

    if (body.secret !== SHARED_SECRET) {
      console.warn("[INGEST] Invalid secret");
      return res.status(401).json({ error: "Invalid secret" });
    }

    if (body.loaded !== true) {
      console.log("[INGEST] Skipped: loaded != true");
      return res.status(200).json({ ok: true, skipped: true, reason: "NotLoaded" });
    }

    const userId = Number(body.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      console.warn("[INGEST] Bad userId:", body.userId);
      return res.status(400).json({ error: "Bad userId" });
    }

    const username = String(body.username || `UserId:${userId}`);
    const nowUnix = Math.floor(Date.now() / 1000);

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
      firstJoinUnix: existing?.firstJoinUnix || (body.firstJoinUnix ? Number(body.firstJoinUnix) : nowUnix),
      lastUpdateUnix: nowUnix
    };

    profileCache.set(userId, profile);
    usernameToUserId.set(username.toLowerCase(), userId);

    console.log(`[INGEST] Stored ${username} (${userId}) XP=${profile.xp} Kills=${profile.kills} Time=${profile.playTimeSeconds}`);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[INGEST] ERROR:", err);
    return res.status(500).json({ error: "Server error", details: String(err?.message || err) });
  }
});

// ===== DISCORD =====
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once(Events.ClientReady, async () => {
  console.log(`[DISCORD] Logged in as ${client.user.tag}`);

  try {
    const commands = [
      new SlashCommandBuilder()
        .setName("profile")
        .setDescription("Show a user's TARC profile")
        .addStringOption(option =>
          option
            .setName("username")
            .setDescription("Roblox username")
            .setRequired(true)
        )
        .toJSON()
    ];

    const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log("[DISCORD] Slash command registered");
  } catch (err) {
    console.error("[DISCORD] Command registration failed:", err);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "profile") return;

  const usernameInput = interaction.options.getString("username", true);

  try {
    await interaction.deferReply();

    const resolved = await resolveRobloxUser(usernameInput);
    if (!resolved) {
      return interaction.editReply("Couldn’t find that Roblox user.");
    }

    let profile = profileCache.get(resolved.userId);

    if (!profile) {
      const cachedId = usernameToUserId.get(resolved.username.toLowerCase());
      if (cachedId) {
        profile = profileCache.get(cachedId);
      }
    }

    if (!profile) {
      return interaction.editReply("Player has no set data yet (they may have never joined the game, or the game hasn’t sent data yet).");
    }

    const embed = buildEmbed(profile);
    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error("[DISCORD] /profile failed:", err);
    return interaction.editReply("Something went wrong fetching that profile.");
  }
});

client.login(DISCORD_TOKEN).catch(err => {
  console.error("[DISCORD] Login failed:", err);
});

// ===== START =====
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[HTTP] Listening on port ${PORT}`);
});
