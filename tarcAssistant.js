import {
  loadAssistantState,
  recordQuestionTrend,
  getDynamicTrendContext,
  addTeaching,
  getPublicTeachingContext
} from "./assistantState.js";
import { buildExternalGroupContext, findRelevantExternalGroups } from "./externalGroups.js";
import {
  TARC_KNOWLEDGE,
  CONTENT_CREATOR_MANAGER_ROLE_ID,
  buildKnowledgeText
} from "./tarcKnowledge.js";

const GEMINI_API_KEY = String(process.env.GEMINI_API_KEY || "");
const GEMINI_MODEL = String(process.env.GEMINI_MODEL || "gemini-2.5-flash-lite");
const ASSISTANT_MAX_OUTPUT_TOKENS = Math.max(200, Math.min(1200, Number(process.env.ASSISTANT_MAX_OUTPUT_TOKENS || 700)));
const MAIN_GUILD_ID = String(process.env.TARC_MAIN_GUILD_ID || process.env.GUILD_ID || "");

const ROBLOX_USERS_URL = "https://users.roblox.com/v1/usernames/users";
const ROBLOX_GROUPS_BASE = "https://groups.roblox.com/v1/groups";
const ROBLOX_USER_GROUPS_BASE = "https://groups.roblox.com/v2/users";

const OFFICIAL_CHANNELS = {
  publicAnnouncements: { id: "1318201600216666240", name: "Public Announcements", kind: "announcement" },
  communityUpdates: { id: "1516871720731152475", name: "Community Updates", kind: "announcement" },
  developmentUpdates: { id: "1318201600216666241", name: "Development Updates", kind: "announcement" },
  militaryAnnouncements: { id: "1318201965871628360", name: "Military Announcements", kind: "announcement" },
  chainOfCommand: { id: "1474991452051345408", name: "Chain of Command", kind: "announcement" },
  divisionalRecruitment: { id: "1366895817482305586", name: "Divisional Recruitment", kind: "weekly_recruitment" }
};

const announcementCache = new Map();
const ANNOUNCEMENT_CACHE_MS = 2 * 60 * 1000;
const ANNOUNCEMENT_FETCH_LIMIT = 30;


// Conversation continuity is deliberately short-lived and in-memory.
// It makes follow-up /ask questions natural without treating user claims as official facts.
const userConversationHistory = new Map();
const topicCounts = new Map();
const rateLimits = new Map();
const discordMemberCache = { fetchedAt: 0, guildId: null };

const HISTORY_TTL_MS = 30 * 60 * 1000;
const HISTORY_TURNS = 4;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 8;
const GUILD_MEMBER_CACHE_MS = 5 * 60 * 1000;

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9_\-\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
  return data;
}

function enforceRateLimit(userId) {
  const now = Date.now();
  const current = rateLimits.get(userId) || [];
  const fresh = current.filter((t) => now - t < RATE_WINDOW_MS);
  if (fresh.length >= RATE_MAX) return false;
  fresh.push(now);
  rateLimits.set(userId, fresh);
  return true;
}

function inferTopic(question) {
  const q = normalize(question);
  const topics = [
    ["division", ["division", "tryout", "academy", "transfer", "212", "41st", "501", "cg", "rg", "sg", "ri", "arc", "rc"]],
    ["chain_of_command", ["chancellor", "commander", "marshal", "coc", "chain of command", "hicom", "co", "xo", "ao"]],
    ["support", ["report", "appeal", "help", "support", "question", "bug", "ticket"]],
    ["rules", ["rule", "lawbook", "advertis", "ping", "oos", "tk", "blacklist", "punish"]],
    ["programme", ["investor", "content creator", "cc", "cs", "partnership", "sponsor"]],
    ["rank", ["rank", "rmp", "xp", "officer"]]
  ];
  for (const [topic, words] of topics) {
    if (words.some((word) => q.includes(word))) return topic;
  }
  return "general";
}

function noteTopic(question) {
  const topic = inferTopic(question);
  topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1);
}

function getTrendContext() {
  return Array.from(topicCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic, count]) => `${topic}:${count}`)
    .join(", ");
}

function getConversationContext(userId) {
  const entry = userConversationHistory.get(userId);
  if (!entry || Date.now() - entry.updatedAt > HISTORY_TTL_MS) {
    userConversationHistory.delete(userId);
    return "No recent conversation.";
  }
  return entry.turns
    .slice(-HISTORY_TURNS)
    .map((turn) => `User: ${turn.question}\nAssistant: ${turn.answer}`)
    .join("\n\n");
}

function saveConversationTurn(userId, question, answer) {
  const existing = userConversationHistory.get(userId) || { turns: [], updatedAt: 0 };
  existing.turns.push({ question, answer });
  existing.turns = existing.turns.slice(-HISTORY_TURNS);
  existing.updatedAt = Date.now();
  userConversationHistory.set(userId, existing);
}

async function getMainGuild(client) {
  if (!MAIN_GUILD_ID) return null;
  try {
    return await client.guilds.fetch(MAIN_GUILD_ID);
  } catch {
    return null;
  }
}

async function getCallerDiscordContext(client, discordUserId) {
  const guild = await getMainGuild(client);
  if (!guild) return "The main TARC Discord guild could not be loaded.";

  try {
    const member = await guild.members.fetch(discordUserId);
    const roleNames = member.roles.cache
      .filter((role) => role.id !== guild.id)
      .sort((a, b) => b.position - a.position)
      .map((role) => role.name)
      .slice(0, 30);

    return [
      `TARC Discord display name: ${member.displayName}`,
      `Discord username: ${member.user.username}`,
      `TARC Discord roles: ${roleNames.length ? roleNames.join(", ") : "none found"}`
    ].join("\n");
  } catch {
    return "The caller is not currently resolvable as a member of the main TARC Discord, or member lookup failed.";
  }
}

async function ensureGuildMembersFetched(guild) {
  const now = Date.now();
  if (discordMemberCache.guildId === guild.id && now - discordMemberCache.fetchedAt < GUILD_MEMBER_CACHE_MS) return;
  await guild.members.fetch();
  discordMemberCache.guildId = guild.id;
  discordMemberCache.fetchedAt = now;
}

function roleQuestionNeedsDiscordLookup(question) {
  const q = normalize(question);
  const phrases = [
    "partnership officer", "staff team", "content creator manager", "cc manager",
    "chief executive", "studio director", "quality assurance", "developer",
    "marshal commander", "sector marshal", "rif marshal", "rsf marshal",
    "supreme chancellor", "vice chancellor", "supreme commander", "grand marshal",
    "office of the chancellor", "chief of staff", "ootc"
  ];
  return phrases.some((p) => q.includes(p));
}

async function buildDiscordRoleSnapshot(question, client) {
  if (!roleQuestionNeedsDiscordLookup(question)) return "No Discord-role live lookup was required.";
  const guild = await getMainGuild(client);
  if (!guild) return "Live Discord role lookup unavailable.";

  try {
    await ensureGuildMembersFetched(guild);
    const q = normalize(question);
    const knownQueries = [
      "partnership officer", "staff team", "content creator manager", "chief executive",
      "studio director", "quality assurance", "developer", "marshal commander",
      "supreme chancellor", "vice chancellor", "supreme commander", "grand marshal",
      "office of the chancellor", "chief of staff", "ootc", "rif", "rsf"
    ];

    const targetTerms = knownQueries.filter((term) => q.includes(term));
    const roles = guild.roles.cache
      .filter((role) => role.id !== guild.id)
      .filter((role) => {
        const rn = normalize(role.name);
        if (role.id === CONTENT_CREATOR_MANAGER_ROLE_ID && (q.includes("content creator") || q.includes("cc manager"))) return true;
        return targetTerms.some((term) => rn.includes(term) || term.includes(rn));
      })
      .sort((a, b) => b.position - a.position)
      .first(20);

    if (!roles.length) return "No matching live Discord role was found for the wording in the question.";

    return roles.map((role) => {
      const members = Array.from(role.members.values())
        .slice(0, 12)
        .map((m) => `${m.displayName} (@${m.user.username})`);
      return `${role.name}: ${members.length ? members.join(", ") : "no cached holders found"}`;
    }).join("\n");
  } catch (err) {
    return `Live Discord role lookup failed: ${String(err?.message || err)}`;
  }
}

function findRelevantGroups(question) {
  const q = normalize(question);
  const groups = [];
  for (const group of Object.values(TARC_KNOWLEDGE.groups)) {
    if (group.aliases.some((alias) => {
      const a = normalize(alias);
      if (a.length <= 2) return new RegExp(`(^|\\s)${a.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}(?=\\s|$)`).test(q);
      return q.includes(a);
    })) groups.push(group);
  }

  if (["chancellor", "grand marshal", "supreme commander", "marshal commander", "ootc", "rmp", "main rank", "chain of command"].some((x) => q.includes(x))) {
    if (!groups.some((g) => g.id === TARC_KNOWLEDGE.groups.main.id)) groups.push(TARC_KNOWLEDGE.groups.main);
  }

  if (["archived studios", "chief executive", "studio director", "quality assurance", "lead developer", "staff team"].some((x) => q.includes(x))) {
    if (!groups.some((g) => g.id === TARC_KNOWLEDGE.groups.archivedStudios.id)) groups.push(TARC_KNOWLEDGE.groups.archivedStudios);
  }

  return groups.slice(0, 3);
}

function isLeadershipRoleName(name) {
  const n = normalize(name);
  return [
    "supreme chancellor", "vice chancellor", "supreme commander", "acting supreme commander",
    "grand marshal", "marshal commander", "regimental commander", "battalion commander",
    "commanding officer", "executive officer", "administrative officer", "administrative",
    "lord commandant", "commander", "company commander", "squad commander", "riot commander",
    "shock commander", "supervisor", "captain", "director", "directorate", "chief",
    "studio director", "chief executive", "staff team", "developer", "quality assurance"
  ].some((term) => n.includes(term));
}

async function getGroupLeadershipSnapshot(group, question) {
  try {
    const rolesData = await fetchJson(`${ROBLOX_GROUPS_BASE}/${group.id}/roles`);
    const roles = rolesData?.roles || [];
    const q = normalize(question);

    const selected = roles
      .filter((role) => isLeadershipRoleName(role.name) || q.includes(normalize(role.name)))
      .sort((a, b) => Number(b.rank || 0) - Number(a.rank || 0))
      .slice(0, 24);

    const lines = [];
    for (const role of selected) {
      const memberCount = Number(role.memberCount || 0);
      const directMention = q.includes(normalize(role.name));
      if (memberCount > 15 && !directMention) {
        lines.push(`${role.name} (rank ${role.rank}, ${memberCount} members)`);
        continue;
      }

      try {
        const users = await fetchJson(`${ROBLOX_GROUPS_BASE}/${group.id}/roles/${role.id}/users?limit=100&sortOrder=Asc`);
        const names = (users?.data || []).map((u) => u.username || u.name).filter(Boolean).slice(0, 15);
        lines.push(`${role.name} (rank ${role.rank}): ${names.length ? names.join(", ") : "vacant"}`);
      } catch {
        lines.push(`${role.name} (rank ${role.rank}): holders could not be fetched`);
      }
    }

    return `Roblox group ${group.name} (${group.id}) live leadership roles:\n${lines.length ? lines.join("\n") : "No relevant leadership roles matched."}`;
  } catch (err) {
    return `Roblox group ${group.name} live lookup failed: ${String(err?.message || err)}`;
  }
}

function extractLikelyUsernameCandidates(question) {
  const q = String(question || "");
  const candidates = new Set();
  const patterns = [
    /what\s+rank\s+(?:is|does)\s+@?([A-Za-z0-9_]{3,20})/i,
    /is\s+@?([A-Za-z0-9_]{3,20})\s+still\b/i,
    /is\s+@?([A-Za-z0-9_]{3,20})\s+(?:the|an?\s+)?(?:sc|vc|ootc|commander|marshal|developer|staff|co|xo|ao)\b/i,
    /about\s+@?([A-Za-z0-9_]{3,20})\b/i,
    /username\s*[:=]?\s*@?([A-Za-z0-9_]{3,20})\b/i
  ];
  for (const pattern of patterns) {
    const match = q.match(pattern);
    if (match?.[1]) candidates.add(match[1]);
  }
  for (const token of q.match(/\b[A-Za-z][A-Za-z0-9_]{2,19}\b/g) || []) {
    if (/[0-9_]/.test(token)) candidates.add(token);
  }

  const blocked = new Set(["the", "this", "that", "still", "rank", "commander", "marshal", "developer", "officer", "member", "supreme"]);
  return Array.from(candidates).filter((c) => !blocked.has(c.toLowerCase())).slice(0, 3);
}

async function resolveRobloxUsername(username) {
  const data = await fetchJson(ROBLOX_USERS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false })
  });
  const user = data?.data?.[0];
  if (!user?.id) return null;
  return { id: Number(user.id), username: String(user.name), displayName: String(user.displayName || user.name) };
}

async function buildRobloxUserSnapshot(question) {
  const candidates = extractLikelyUsernameCandidates(question);
  if (!candidates.length) return "No clear Roblox username was detected for a user-specific lookup.";

  for (const candidate of candidates) {
    try {
      const user = await resolveRobloxUsername(candidate);
      if (!user) continue;
      const groupData = await fetchJson(`${ROBLOX_USER_GROUPS_BASE}/${user.id}/groups/roles`);
      const memberships = (groupData?.data || [])
        .filter((entry) => Object.values(TARC_KNOWLEDGE.groups).some((g) => g.id === Number(entry?.group?.id)))
        .map((entry) => `${entry.group.name}: ${entry.role.name} (rank ${entry.role.rank})`);

      return [
        `Resolved Roblox user: ${user.username} (display name: ${user.displayName}, user ID: ${user.id})`,
        `Relevant TARC/AS memberships: ${memberships.length ? memberships.join(" | ") : "none found in the tracked TARC/AS groups"}`
      ].join("\n");
    } catch {
      // Try next candidate.
    }
  }

  return `Possible username(s) detected (${candidates.join(", ")}), but none could be confidently resolved. Ask for the exact Roblox username if identity matters.`;
}

function questionNeedsExternalGroupLiveCheck(question, groups) {
  if (!groups.length) return false;
  const q = normalize(question);
  return [
    "owner", "owns", "current owner", "leader", "leadership", "who runs",
    "member count", "members", "how big", "group size", "current status"
  ].some((term) => q.includes(term));
}

async function getExternalGroupLiveSnapshot(group, question) {
  if (!group?.groupId) return `No live Roblox group ID is stored for ${group?.name || "that group"}.`;

  try {
    const data = await fetchJson(`${ROBLOX_GROUPS_BASE}/${group.groupId}`);
    const lines = [
      `External Roblox group live snapshot: ${group.name} (${group.groupId})`,
      data?.name ? `Current Roblox group name: ${data.name}` : null,
      Number.isFinite(Number(data?.memberCount)) ? `Current member count: ${Number(data.memberCount)}` : null,
      data?.owner?.username ? `Current Roblox group owner: ${data.owner.username}` : null,
      data?.owner?.userId ? `Owner user ID: ${data.owner.userId}` : null,
      data?.isLocked === true ? "Group is currently locked." : null
    ].filter(Boolean);

    return lines.join("\n");
  } catch (err) {
    return `Live external Roblox lookup failed for ${group.name}: ${String(err?.message || err)}`;
  }
}

async function buildExternalLiveContext(question) {
  const groups = findRelevantExternalGroups(question, 3);
  if (!questionNeedsExternalGroupLiveCheck(question, groups)) {
    return "No external-group live lookup was required.";
  }

  const snapshots = [];
  for (const group of groups) {
    snapshots.push(await getExternalGroupLiveSnapshot(group, question));
  }
  return snapshots.join("\n\n");
}

async function buildLiveContext(question, client) {
  const groups = findRelevantGroups(question);
  const groupSnapshots = [];
  for (const group of groups) {
    groupSnapshots.push(await getGroupLeadershipSnapshot(group, question));
  }

  const [discordRoles, robloxUser, externalLive, exactRoles] = await Promise.all([
    buildDiscordRoleSnapshot(question, client),
    buildRobloxUserSnapshot(question),
    buildExternalLiveContext(question),
    getExactRoleHolderSnapshot(question)
  ]);

  return [
    exactRoles,
    groupSnapshots.length ? groupSnapshots.join("\n\n") : "No Roblox group leadership lookup was required.",
    `\nDISCORD LIVE ROLE CONTEXT\n${discordRoles}`,
    `\nROBLOX USER-SPECIFIC CONTEXT\n${robloxUser}`,
    `\nEXTERNAL GROUP LIVE CONTEXT\n${externalLive}`
  ].join("\n");
}


function startOfCurrentWeekUtc() {
  const now = new Date();
  const day = now.getUTCDay(); // 0 Sun, 1 Mon...
  const daysSinceMonday = (day + 6) % 7;
  const start = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysSinceMonday,
    0, 0, 0, 0
  ));
  return start.getTime();
}

function announcementQuestionTargets(question) {
  const q = normalize(question);
  const targets = new Set();

  const add = (key) => targets.add(key);

  if (["public announcement", "public announcements"].some((x) => q.includes(x))) add("publicAnnouncements");
  if (["community update", "community updates", "community announcement"].some((x) => q.includes(x))) add("communityUpdates");
  if (["development update", "development updates", "dev update", "dev updates", "development announcement"].some((x) => q.includes(x))) add("developmentUpdates");
  if (["military announcement", "military announcements", "military broadcast", "military broadcasts"].some((x) => q.includes(x))) add("militaryAnnouncements");
  if (["chain of command", "coc update", "leadership announcement", "command update"].some((x) => q.includes(x))) add("chainOfCommand");

  const recruitmentTerms = [
    "application", "applications", "academy", "academies", "recruitment",
    "open right now", "currently open", "what is open", "what's open", "join ri",
    "join cg", "join rg", "join sg", "join arc", "join 212", "join 501", "join 41"
  ];
  if (recruitmentTerms.some((x) => q.includes(x))) add("divisionalRecruitment");

  const generalRecent = [
    "announcement", "announcements", "what changed", "what's new", "whats new",
    "latest update", "recent update", "recently announced", "today", "yesterday",
    "this week", "most recent"
  ].some((x) => q.includes(x));

  if (generalRecent && targets.size === 0) {
    add("publicAnnouncements");
    add("communityUpdates");
    add("developmentUpdates");
    add("militaryAnnouncements");
  }

  return Array.from(targets);
}

function renderMessageForKnowledge(message) {
  const pieces = [];
  if (message.content?.trim()) pieces.push(message.content.trim());

  for (const embed of message.embeds || []) {
    if (embed?.title) pieces.push(`[Embed title] ${embed.title}`);
    if (embed?.description) pieces.push(`[Embed] ${embed.description}`);
    for (const field of embed?.fields || []) {
      pieces.push(`[${field.name}] ${field.value}`);
    }
  }

  for (const attachment of message.attachments?.values?.() || []) {
    pieces.push(`[Attachment] ${attachment.name || attachment.url}`);
  }

  return pieces.join("\n").trim().slice(0, 5000);
}

async function fetchOfficialChannelMessages(client, channelKey) {
  const config = OFFICIAL_CHANNELS[channelKey];
  if (!config) return [];

  const cached = announcementCache.get(channelKey);
  if (cached && Date.now() - cached.fetchedAt < ANNOUNCEMENT_CACHE_MS) {
    return cached.messages;
  }

  try {
    const channel = await client.channels.fetch(config.id);
    if (!channel?.isTextBased?.() || !channel.messages?.fetch) {
      return [];
    }

    const collection = await channel.messages.fetch({ limit: ANNOUNCEMENT_FETCH_LIMIT });
    let messages = Array.from(collection.values())
      .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
      .map((message) => ({
        id: message.id,
        channelId: config.id,
        channelName: config.name,
        createdTimestamp: message.createdTimestamp,
        author: message.author?.username || "Unknown",
        text: renderMessageForKnowledge(message)
      }))
      .filter((message) => message.text);

    if (config.kind === "weekly_recruitment") {
      const weekStart = startOfCurrentWeekUtc();
      messages = messages.filter((message) => message.createdTimestamp >= weekStart);
    } else {
      // Keep the latest official material. Older messages are still excluded so stale
      // announcements do not dominate current questions.
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const recent = messages.filter((message) => message.createdTimestamp >= cutoff);
      messages = recent.length ? recent : messages.slice(0, 8);
    }

    messages = messages.slice(0, 12);
    announcementCache.set(channelKey, { fetchedAt: Date.now(), messages });
    return messages;
  } catch (err) {
    console.error(`[TARC ANNOUNCEMENTS] Failed to fetch ${config.name}:`, err);
    return [];
  }
}

async function buildOfficialAnnouncementContext(question, client) {
  const targets = announcementQuestionTargets(question);
  if (!targets.length) return "No official-announcement lookup was required for this question.";

  const blocks = [];

  for (const key of targets) {
    const config = OFFICIAL_CHANNELS[key];
    const messages = await fetchOfficialChannelMessages(client, key);

    if (!messages.length) {
      blocks.push(`${config.name} (<#${config.id}>): no readable recent messages were available.`);
      continue;
    }

    blocks.push([
      `${config.name} (<#${config.id}>)`,
      key === "divisionalRecruitment"
        ? "Scope: messages from the current week only."
        : "Scope: recent official messages; prefer the newest relevant item.",
      ...messages.map((message) => {
        const unix = Math.floor(message.createdTimestamp / 1000);
        return `- Message ${message.id} | <t:${unix}:F> | ${message.author}\n${message.text}`;
      })
    ].join("\n"));
  }

  return [
    "OFFICIAL DISCORD ANNOUNCEMENT CONTEXT",
    "This content is fresher than static knowledge for announcements, openings, applications and recently announced changes.",
    ...blocks
  ].join("\n\n");
}

const EXACT_ROLE_QUERIES = [
  "studio director",
  "chief executive",
  "supreme chancellor",
  "vice chancellor",
  "supreme commander",
  "grand marshal",
  "marshal commander",
  "regimental commander",
  "battalion commander",
  "chief of staff",
  "office of the chancellor"
];

async function getExactRoleHolderSnapshot(question) {
  const q = normalize(question);
  const terms = EXACT_ROLE_QUERIES.filter((term) => q.includes(term));
  if (!terms.length) return "No exact-role authoritative lookup was required.";

  const groups = [TARC_KNOWLEDGE.groups.main, TARC_KNOWLEDGE.groups.archivedStudios];
  const lines = [];

  for (const group of groups) {
    try {
      const rolesData = await fetchJson(`${ROBLOX_GROUPS_BASE}/${group.id}/roles`);
      const roles = rolesData?.roles || [];

      for (const term of terms) {
        const exact = roles.filter((role) => normalize(role.name) === term);
        for (const role of exact) {
          try {
            const users = await fetchJson(
              `${ROBLOX_GROUPS_BASE}/${group.id}/roles/${role.id}/users?limit=100&sortOrder=Asc`
            );
            const names = (users?.data || [])
              .map((u) => u.username || u.name)
              .filter(Boolean);

            lines.push(
              `${group.name}: EXACT role "${role.name}" (rank ${role.rank}) -> ${names.length ? names.join(", ") : "vacant"}`
            );
          } catch (err) {
            lines.push(`${group.name}: EXACT role "${role.name}" -> holders could not be fetched (${String(err?.message || err)})`);
          }
        }
      }
    } catch (err) {
      lines.push(`${group.name}: exact-role lookup failed (${String(err?.message || err)})`);
    }
  }

  if (!lines.length) {
    return `Exact role term(s) detected (${terms.join(", ")}), but no exact matching role was found in the main TARC or Archived Studios groups.`;
  }

  return [
    "AUTHORITATIVE EXACT-ROLE LOOKUP",
    "For the exact role names below, prefer these live Roblox holders over fuzzy Discord matches, old stored names, or user corrections.",
    ...lines
  ].join("\n");
}

function buildDeterministicFallback(question, {
  callerContext,
  liveContext,
  officialAnnouncements,
  externalGroupContext,
  taughtKnowledge
}) {
  const q = normalize(question);

  if (q.includes("xp rank") || q.includes("rank tree") || q.includes("xp tree") || q.includes("in game rank")) {
    const ranks = TARC_KNOWLEDGE.xpRankTree?.ranks || [];
    if (ranks.length) {
      return [
        "The XP rank tree is the in-game Republic progression system; it is separate from the Chain of Command.",
        ranks.map((rank) => `${rank.name} — ${rank.xp} XP`).join("\n")
      ].join("\n\n");
    }
  }

  const channelAnswers = [
    [["bug", "report bug"], `Submit development/game bugs in <#${TARC_KNOWLEDGE.channels.bugReports}>.`],
    [["question channel", "where ask", "questions channel"], `Use <#${TARC_KNOWLEDGE.channels.questions}> for questions and follow its Q: / A: / R: format.`],
    [["appeal", "reports and appeals"], `Use the TARC Reports & Appeals server: ${TARC_KNOWLEDGE.identity.reportsAppealsDiscord}`],
    [["tryout request"], `Use <#${TARC_KNOWLEDGE.channels.tryoutRequests}> and follow the channel format. Do not spam-ping divisional staff.`],
    [["event request"], `Use <#${TARC_KNOWLEDGE.channels.eventRequests}> for SSUs, trainings and other event requests.`],
    [["divisional recruitment", "applications channel", "academy channel"], `Divisional academies/applications are posted in <#${TARC_KNOWLEDGE.channels.divisionalRecruitment}>.`]
  ];

  for (const [terms, answer] of channelAnswers) {
    if (terms.some((term) => q.includes(term))) return answer;
  }

  if (officialAnnouncements && !officialAnnouncements.startsWith("No official-announcement")) {
    return [
      "Gemini is temporarily unavailable, but I can still show the official context I found:",
      officialAnnouncements.slice(0, 1700)
    ].join("\n\n");
  }

  if (liveContext && (
    liveContext.includes("AUTHORITATIVE EXACT-ROLE LOOKUP") ||
    liveContext.includes("Roblox group") ||
    liveContext.includes("Resolved Roblox user:")
  )) {
    return [
      "Gemini is temporarily unavailable, but I was still able to retrieve live TARC data:",
      liveContext.slice(0, 1700)
    ].join("\n\n");
  }

  if (taughtKnowledge && !taughtKnowledge.startsWith("No owner-taught")) {
    return taughtKnowledge.slice(0, 1900);
  }

  if (externalGroupContext && !externalGroupContext.startsWith("No relevant external")) {
    return [
      "Gemini is temporarily unavailable. Here is the relevant stored group context:",
      externalGroupContext.slice(0, 1700)
    ].join("\n\n");
  }

  return "The AI provider is temporarily unavailable. I can still help with common TARC links, channels, the XP rank tree and live role lookups; try asking the question more specifically.";
}

function extractGeminiResponseText(data) {
  const parts = [];

  for (const candidate of data?.candidates || []) {
    for (const part of candidate?.content?.parts || []) {
      if (typeof part?.text === "string" && part.text.trim()) {
        parts.push(part.text.trim());
      }
    }
  }

  return parts.join("\n").trim();
}

async function callGemini({ question, callerContext, liveContext, officialAnnouncements, taughtKnowledge, dynamicTrends, externalGroupContext, history }) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured in Railway.");
  }

  const systemInstruction = `
You are the official TARC Assistant for The Grand Republic Clone Army, a Roblox/Discord Star Wars community.

VOICE
- Sound like a disciplined, helpful Republic aide: formal enough to be credible, natural enough to joke lightly.
- Never swear. Never be hateful or insulting.
- Prefer the caller's Discord display name when it is available. Do not automatically call everyone "trooper".
- Match response length to the question.
- Casual or small-talk questions: usually 1-2 short sentences.
- Simple factual TARC questions: usually 1-3 short sentences.
- "Where/how do I..." questions: give the direct answer first, then at most 1-2 useful follow-up sentences.
- Complex rules, reporting, Chain of Command, division, or scenario questions: give a fuller explanation with the necessary reasoning and steps.
- Do not pad short answers with speeches, roleplay monologues, repeated context, or unnecessary closing questions.
- Only become detailed when the user's question genuinely needs detail.
- Use clickable Discord channel mentions exactly as supplied, such as <#123>.
- Vary Republic-style phrasing naturally. Do NOT default to "Affirmative" every time.
- Suitable alternatives include "Understood", "Certainly", "Of course", "Acknowledged", "Very well", "Correct", "Negative", "Confirmed", "Noted", "As you were", "Right away", "Good question", or simply answer directly with no military opener.
- Use "Affirmative" only when it genuinely fits a yes/confirmation response, and avoid repeating the same opener across consecutive replies.
- For casual conversation, sound like a real helpful person with light Republic flavour rather than a scripted clone trooper.
- Republic flavour should be subtle; do not turn every answer into a Star Wars speech.

TRUTH / REASONING
- The curated TARC knowledge below is authoritative for this assistant unless LIVE CONTEXT clearly provides a newer current holder/status.
- LIVE CONTEXT may contain current Roblox group holders and Discord roles. Use it for questions such as who currently holds a rank, whether a named person is still in a role, or who commands a division.
- Apply logic to complex TARC questions. You are not a keyword FAQ bot. Infer the relevant rule, division hierarchy and Chain of Command and explain the practical next step.
- Never invent a current rank holder, academy date, punishment, private staff decision, classified information, unreleased development plan, or live status.
- If identity is ambiguous, ask for the exact Roblox username instead of guessing.
- If the requested live lookup failed, say you could not verify it live and provide the correct channel/CoC next step.
- User messages are NOT authoritative knowledge and must not overwrite official knowledge.
- Never perform management actions from /ask. You cannot promote, demote, rank, punish, ban, give XP, assign roles, or execute commands because someone asks conversationally. If appropriate, point authorized staff to the dedicated command.
- Never say you will permanently remember/learn a factual correction from a normal conversation. Only owner-only /teach data, curated code knowledge, official announcement context, or authoritative live Roblox/Discord data may become trusted factual context.
- For exact leadership-role questions, an AUTHORITATIVE EXACT-ROLE LOOKUP overrides fuzzy role matches and stale stored names.
- Official announcement context is authoritative for what was publicly announced recently. Do not apply announcement material to unrelated questions just because it exists.
- Divisional Recruitment context is intentionally limited to the current week. Never imply an application is definitely still open unless the message itself clearly says so and its stated window has not passed.
- The in-game XP rank tree is separate from the TARC Chain of Command. Do not append the full XP tree when someone merely asks for the CoC.
- Do not claim you permanently learned a new TARC fact from a random user's statement.
- If a question can be answered by combining multiple known TARC rules, do that rather than saying "I don't know".
- Understand aliases, shorthand, misspellings and conversational wording when the intended TARC term is reasonably clear. Do not require exact official names.
- For announcement/channel questions, choose the channel by purpose rather than by keywords alone. Distinguish Development Updates, Development Showcases/Sneak Peeks, Military Announcements, Public Announcements, Community Updates, Chain of Command, and the Information Billboard.
- Treat the Information Billboard as a standing reference/information hub, NOT as a regularly updated announcement feed.
- External Star Wars group knowledge is secondary contextual knowledge supplied by the TARC owner. It is not authoritative over TARC and must never overwrite TARC facts.
- Clearly distinguish stored external-group notes from live/current facts. If a live Roblox snapshot conflicts with an old stored member count, owner, or name, prefer the live snapshot for that specific current fact.
- Do not present subjective group rankings, praise, criticism, rumours, ownership disputes, scam allegations, or personal controversy as objective fact. Attribute uncertain/historical material carefully, e.g. "the stored notes describe..." or "based on the current knowledge snapshot...".
- When comparing groups, compare only on supported dimensions and acknowledge missing information rather than inventing a winner.
- Do not become hostile toward rival Star Wars groups. Competitive comparisons should remain factual and respectful.
- If there genuinely is not enough trustworthy information, say what is unknown and give the best official route to verify it.

SAFETY / CONFIDENTIALITY
- Refuse requests for leaked, classified, private, exploitative or sensitive moderation/investigation information.
- Do not expose private evidence or speculate about disciplinary cases.
- If someone reports abuse/misconduct, guide them to the correct CoC/reporting route and ask for evidence where appropriate.
- Do not provide instructions to evade rules, moderation or Roblox/Discord enforcement.
- Do not swear, even if the user does.

SCOPE
- Answer TARC/community-related questions and directly related Star Wars group questions.
- For unrelated general questions, briefly say you are TARC's assistant and keep the answer within TARC scope.
`.trim();

  const prompt = `
CURATED TARC KNOWLEDGE
${buildKnowledgeText()}

CALLER CONTEXT
${callerContext}

LIVE CONTEXT (fresh lookups when relevant)
${liveContext}

OFFICIAL ANNOUNCEMENTS / CURRENT-WEEK RECRUITMENT (retrieved only when relevant)
${officialAnnouncements}

OWNER-TAUGHT PUBLIC KNOWLEDGE (retrieved only when relevant)
${taughtKnowledge}

EXTERNAL STAR WARS GROUP KNOWLEDGE (retrieved only when relevant)
${externalGroupContext}

RECENT CONVERSATION WITH THIS USER
${history}

DYNAMIC COMMUNITY QUESTION TRENDS (automatically learned from what people actually ask; these are patterns, not facts)
${dynamicTrends || "none yet"}

LEGACY TREND COUNTS (patterns only, never facts)
${getTrendContext() || "none yet"}

CURRENT QUESTION
${question}
`.trim();

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "x-goog-api-key": GEMINI_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        candidateCount: 1,
        maxOutputTokens: ASSISTANT_MAX_OUTPUT_TOKENS,
        temperature: 0.35,
        topP: 0.9
      }
    })
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const apiMessage =
      data?.error?.message ||
      data?.promptFeedback?.blockReason ||
      text ||
      response.statusText;

    throw new Error(`Gemini HTTP ${response.status}: ${apiMessage}`);
  }

  const answer = extractGeminiResponseText(data);

  if (!answer) {
    const blockReason = data?.promptFeedback?.blockReason;
    const finishReason = data?.candidates?.[0]?.finishReason;

    if (blockReason) {
      return "I can't answer that request. If you need legitimate TARC support, use the appropriate Chain of Command or support channel.";
    }

    throw new Error(
      `Gemini returned no text response${finishReason ? ` (finish reason: ${finishReason})` : ""}.`
    );
  }

  return answer;
}

export async function teachTarcAssistant({ information, topic = "general", visibility = "public", interaction }) {
  const clean = String(information || "").trim();
  if (!clean) throw new Error("Teaching information cannot be empty.");

  return await addTeaching({
    text: clean,
    topic,
    visibility,
    taughtByDiscordId: interaction?.user?.id || ""
  });
}

export async function askTarcAssistant({ question, interaction, client }) {
  const cleanQuestion = String(question || "").trim();
  if (!cleanQuestion) return "Ask me a TARC-related question and I'll do my best to help.";
  if (!enforceRateLimit(interaction.user.id)) {
    return "You're sending questions a little too quickly. Give me a moment, then try again.";
  }

  await loadAssistantState();
  noteTopic(cleanQuestion);
  await recordQuestionTrend(cleanQuestion);

  const [
    callerContext,
    liveContext,
    officialAnnouncements,
    taughtKnowledge,
    dynamicTrends
  ] = await Promise.all([
    getCallerDiscordContext(client, interaction.user.id),
    buildLiveContext(cleanQuestion, client),
    buildOfficialAnnouncementContext(cleanQuestion, client),
    getPublicTeachingContext(cleanQuestion, 12),
    getDynamicTrendContext()
  ]);

  const externalGroupContext = buildExternalGroupContext(cleanQuestion, 4);
  const history = getConversationContext(interaction.user.id);

  try {
    const answer = await callGemini({
      question: cleanQuestion,
      callerContext,
      liveContext,
      officialAnnouncements,
      taughtKnowledge,
      dynamicTrends,
      externalGroupContext,
      history
    });

    const safeAnswer = answer.length > 1950 ? `${answer.slice(0, 1947)}...` : answer;
    saveConversationTurn(interaction.user.id, cleanQuestion, safeAnswer);
    return safeAnswer;
  } catch (err) {
    console.error("[TARC ASSISTANT] Gemini unavailable, using fallback:", err);

    const fallback = buildDeterministicFallback(cleanQuestion, {
      callerContext,
      liveContext,
      officialAnnouncements,
      externalGroupContext,
      taughtKnowledge
    });

    const safeFallback = fallback.length > 1950 ? `${fallback.slice(0, 1947)}...` : fallback;
    saveConversationTurn(interaction.user.id, cleanQuestion, safeFallback);
    return safeFallback;
  }
}
