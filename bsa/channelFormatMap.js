// Exact owner-provided BSA channel-name mapping (2026-11-21).
// The category is a lookup key, NOT a rename target. Only channels are renamed.
// Do not normalize, lowercase, translate or substitute any of these strings.
export const BSA_FORMAT_VERSION = 1;
export const TOP_LEVEL = "TOP LEVEL";
export const SEPARATOR = "│"; // U+2502, not ASCII "|".

export const BSA_CHANNEL_EMOJIS = Object.freeze({
  [TOP_LEVEL]: {
    "welcome": "👋",
    "rules": "📜"
  },
  "INFORMATION BOARD": {
    "announcements": "📣",
    "army-broadcasts": "📯",
    "information-board": "📌",
    "chain-of-command": "🧭",
    "regimental-information": "🪖",
    "promotions": "🎖️",
    "polls": "📊",
    "role-pings": "🔔",
    "blacklists": "🚩"
  },
  "DEVELOPMENT BOARD": {
    "development-updates": "🛠️",
    "showcases": "👁️",
    "roadmap": "🚧",
    "bug-reports": "🐛"
  },
  "COMMUNITY BOARD": {
    "community-notices": "📢",
    "question-of-the-day": "💭",
    "gamenights": "🎮",
    "giveaways": "🎉",
    "official-content": "📸"
  },
  "EVENTS SECTOR": {
    "event-shouts": "📢",
    "event-checks": "📋",
    "bmt-events": "🎓",
    "tryout-posts": "📯",
    "regimental-recruitment": "🪖"
  },
  "MAIN COMMS": {
    "public-chat": "💬",
    "bot-cmds": "🤖",
    "bsa-media": "📷",
    "memes": "😂",
    "counting": "🔢",
    "questions": "❓",
    "propaganda": "📌",
    "suggestions": "💡"
  },
  "EXTRA / REQUESTS": {
    "event-request": "📋",
    "tryout-request": "📝"
  },
  "MODERATION SECTOR": {
    "mod-announcements": "📣",
    "mod-regulations": "📜",
    "mod-chat": "💬",
    "incident-reports": "🚨",
    "ban-logs": "🛡️",
    "global-logs": "📂"
  },
  "SUPPORTER PROGRAMME": {
    "supporter-updates": "📣",
    "supporter-perks": "💰",
    "sneak-peeks": "👀",
    "supporter-chat": "💬"
  },
  "DEVELOPMENT OPERATIONS": {
    "dev-announcements": "📣",
    "dev-documents": "📄",
    "dev-roadmap": "🗺️",
    "to-do-list": "📋",
    "dev-logging": "📑",
    "dev-chat": "💬",
    "qa-announcements": "🧪",
    "qa-regulations": "📜",
    "qa-feedback": "📝",
    "qa-confirmed-bugs": "🐛"
  },
  "CREATOR PROGRAMME": {
    "creator-announcements": "⭐",
    "video-requirements": "📋",
    "creators-chat": "💬",
    "tag-request": "🏷️"
  },
  "VOICE CHANNELS": {
    "BSA Assembly": "🎙️",
    "General VC": "🔊",
    "Private VC": "🔒",
    "Tryout VC": "🎓",
    "Staff VC": "🛡️",
    "Development VC": "🛠️"
  },
  "OFFICER STAFF SECTOR": {
    "officer-announcements": "📣",
    "documents": "📄",
    "officer-cmds": "🤖",
    "officer-chat": "💬",
    "event-strikes": "⚠️",
    "event-logs": "📝",
    "discharge-request": "❗",
    "inactivity-request": "📅",
    "supervision-request": "👋",
    "promotion-request": "📈",
    "Officer Comms": "🔊"
  },
  "GENERAL STAFF SECTOR": {
    "general-announcements": "📣",
    "documents": "📄",
    "general-chat": "💬",
    "regimental-oversight": "📊",
    "discharge-request": "❗",
    "inactivity-request": "📅",
    "punishments": "🔒",
    "disciplinary-reviews": "⚖️",
    "General Staff Comms": "🔊"
  },
  "ARMY HEADQUARTERS": {
    "headquarters-announcements": "📣",
    "headquarters-information": "📄",
    "operations": "📋",
    "decision-reviews": "📊",
    "headquarters-chat": "💬",
    "dump-yard": "🗑️",
    "bot-cmds": "🤖",
    "Headquarters VC": "🔊"
  },
  "LOGGING SECTOR": {
    "automated-event-logs": "📡",
    "game-command-logs": "⌨️",
    "game-logs": "🎮",
    "discord-command-logs": "🤖",
    "server-logs": "🛡️",
    "rowifi-logs": "🔗"
  },
  "TICKETS / SUPPORT": {
    "open-ticket": "🎫"
  }
});

export function formatTargetName(categoryName, originalName) {
  const emojis = BSA_CHANNEL_EMOJIS[categoryName];
  if (!emojis || !Object.hasOwn(emojis, originalName)) return null;
  return emojis[originalName] + SEPARATOR + originalName;
}

export function channelAliases(categoryName, originalName) {
  const formatted = formatTargetName(categoryName, originalName);
  return formatted === null ? [originalName] : [originalName, formatted];
}

export function validateBsaFormatMap(template) {
  const errors = [];
  const expected = new Map();
  const add = (section, channel) => {
    const key = section + "\u0000" + channel.name;
    if (expected.has(key)) errors.push("Duplicate template channel: " + section + "/" + channel.name);
    expected.set(key, channel);
    const desired = formatTargetName(section, channel.name);
    if (!desired) errors.push("Mapping missing: " + section + "/" + channel.name);
    else if (desired.length > 100 || !desired.includes(SEPARATOR) || desired.includes("|"))
      errors.push("Invalid formatted channel name: " + section + "/" + channel.name);
  };
  for (const ch of template.top_level_channels || []) add(TOP_LEVEL, ch);
  for (const cat of template.categories || []) for (const ch of cat.channels || []) add(cat.name, ch);
  for (const [section, entries] of Object.entries(BSA_CHANNEL_EMOJIS)) {
    for (const original of Object.keys(entries)) {
      const key = section + "\u0000" + original;
      if (!expected.has(key)) errors.push("Mapping not in approved V4: " + section + "/" + original);
    }
  }
  const mapped = Object.values(BSA_CHANNEL_EMOJIS).reduce((n, group) => n + Object.keys(group).length, 0);
  if (mapped !== 100 || expected.size !== 100)
    errors.push("Mapping and template must contain exactly 100 channels (mapped=" + mapped + ", template=" + expected.size + ").");
  return {ok: errors.length === 0, errors, mapped, templateChannels: expected.size};
}
