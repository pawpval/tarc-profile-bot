// Versioned, read-only Discord guild configuration snapshot helpers.
// No network calls, side effects, member enumeration, or message access here.
export const SCAN_SCHEMA = 'tarc.discord.guild-configuration';
export const SCAN_VERSION = 1;
export const UNKNOWN = (reason = 'not_exposed_by_discord_api') => ({ status: 'unknown', reason });
const field = (obj, key) => obj && obj[key] !== undefined ? obj[key] : UNKNOWN();
const bitfield = value => value?.bitfield === undefined && typeof value !== 'bigint' && typeof value !== 'number' && typeof value !== 'string'
  ? UNKNOWN() : String(value?.bitfield ?? value);
const names = value => typeof value?.toArray === 'function' ? value.toArray() : UNKNOWN('permission_names_unavailable');
const validSnowflake = value => /^\d{17,20}$/.test(String(value || ''));

// The same trusted TARC account must hold real server ownership or the
// Administrator permission in the target guild. Discord's server-side
// interaction memberPermissions is authoritative; role names are never used.
export function isAuthorizedScan({ guildId, userId, hasAdministrator = false }, { guildId: requiredGuildId, ownerId, trustedOwnerId }) {
  return validSnowflake(requiredGuildId) && validSnowflake(ownerId) && validSnowflake(trustedOwnerId)
    && validSnowflake(guildId) && validSnowflake(userId)
    && String(guildId) === String(requiredGuildId)
    && String(userId) === String(trustedOwnerId)
    && (String(userId) === String(ownerId) || hasAdministrator === true);
}

// Topics and descriptions are server settings but can contain pasted secrets.
// Preserve ordinary text while removing sensitive URLs and credential values.
export function redactText(input) {
  if (input === null || input === undefined) return input;
  return String(input)
    .replace(/https?:\/\/(?:www\.)?(?:discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks)\/\d+\/[^\s<>"']+/gi, '[REDACTED_WEBHOOK]')
    .replace(/https?:\/\/(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[^\s<>"']+/gi, '[REDACTED_INVITE]')
    .replace(/\b(?:mfa\.)?[\w-]{20,}\.[\w-]{5,}\.[\w-]{20,}\b/g, '[REDACTED_TOKEN]')
    .replace(/\b((?:secret|token|api[_ -]?key|password|client[_ -]?secret|authorization)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/([?&](?:token|key|secret|access_token|api_key)=)[^\s&#]+/gi, '$1[REDACTED]');
}

const safeText = (obj, key) => obj?.[key] === undefined ? UNKNOWN() : redactText(obj[key]);
const sorted = (values, fn) => [...values].sort(fn);
const asItems = coll => coll?.values ? [...coll.values()].filter(Boolean) : Array.isArray(coll) ? coll.filter(Boolean) : [];
const CHANNEL_TYPES = { 0:'GuildText',2:'GuildVoice',4:'GuildCategory',5:'GuildAnnouncement',10:'AnnouncementThread',11:'PublicThread',12:'PrivateThread',13:'GuildStageVoice',14:'GuildDirectory',15:'GuildForum',16:'GuildMedia' };
const sortedByPosition = (a, b) => (Number(a.rawPosition ?? a.position ?? 0) - Number(b.rawPosition ?? b.position ?? 0)) || String(a.id).localeCompare(String(b.id));

function permissions(value) {
  return { bitfield: bitfield(value), names: names(value) };
}

function overwriteSnapshot(overwrite) {
  return {
    targetId: String(overwrite.id),
    targetType: overwrite.type === 0 ? 'role' : overwrite.type === 1 ? 'member' : UNKNOWN('unrecognized_overwrite_type'),
    rawTargetType: field(overwrite, 'type'),
    allow: permissions(overwrite.allow),
    deny: permissions(overwrite.deny)
  };
}

function overwritten(channel) {
  if (!channel.permissionOverwrites?.cache?.values) return UNKNOWN('channel_permission_overwrites_unavailable');
  return sorted(asItems(channel.permissionOverwrites.cache), (a, b) => String(a.id).localeCompare(String(b.id)))
    .map(overwriteSnapshot);
}

function channelFields(channel, parentIds, botMember, botAccessWarnings) {
  const parentId = channel.parentId ?? null;
  const isCategory = channel.type === 4;
  const isVoice = channel.type === 2 || channel.type === 13;
  const isForum = channel.type === 15 || channel.type === 16;
  const validParent = parentId && parentIds.has(String(parentId));
  let permissionSync = 'not_applicable';
  if (!isCategory && parentId) {
    if (!validParent) permissionSync = 'unknown_parent_unavailable';
    else if (channel.permissionsLocked === true) permissionSync = 'synced';
    else if (channel.permissionsLocked === false) permissionSync = 'independent';
    else permissionSync = 'unknown';
  }
  let botVisibility = UNKNOWN('bot_member_unavailable');
  if (botMember && typeof channel.permissionsFor === 'function') {
    try {
      const effective = channel.permissionsFor(botMember);
      botVisibility = effective?.has?.('ViewChannel') ?? UNKNOWN('permission_resolution_unavailable');
      if (botVisibility === false) botAccessWarnings.push({ channelId: String(channel.id), issue: 'bot_cannot_view_channel; metadata_may_be_incomplete' });
    } catch {
      botVisibility = UNKNOWN('permission_resolution_failed');
    }
  }
  const obj = {
    id: String(channel.id),
    name: safeText(channel, 'name'),
    type: field(channel, 'type'),
    typeName: CHANNEL_TYPES[channel.type] || UNKNOWN('unrecognized_channel_type'),
    position: field(channel, 'position'),
    rawPosition: field(channel, 'rawPosition'),
    parentId,
    topic: 'topic' in channel ? safeText(channel, 'topic') : null,
    nsfw: 'nsfw' in channel ? field(channel, 'nsfw') : null,
    slowmodeSeconds: 'rateLimitPerUser' in channel ? field(channel, 'rateLimitPerUser') : null,
    flags: channel.flags ? bitfield(channel.flags) : UNKNOWN('channel_flags_unavailable'),
    permissionOverwrites: overwritten(channel),
    categoryPermissions: {
      parentCategoryId: parentId,
      synchronization: permissionSync,
      // Discord stores actual overwrites on each child. Do not incorrectly
      // combine unsynced children with parent overwrites as if inherited.
      interpretation: 'child_permission_overwrites_are_authoritative; category_overwrites_not_implicitly_merged'
    },
    botCanView: botVisibility,
    voice: isVoice ? {
      bitrate: field(channel, 'bitrate'),
      userLimit: field(channel, 'userLimit'),
      rtcRegion: field(channel, 'rtcRegion'),
      videoQualityMode: field(channel, 'videoQualityMode'),
      // Stage instance topic is dynamic and not channel configuration.
      stageInstance: channel.type === 13 ? UNKNOWN('dynamic_stage_instances_not_fetched') : null
    } : null,
    forum: isForum ? {
      availableTags: Array.isArray(channel.availableTags)
        ? channel.availableTags.map(tag => ({
          id: String(tag.id), name: redactText(tag.name), moderated: field(tag, 'moderated'),
          emojiId: field(tag, 'emojiId'), emojiName: field(tag, 'emojiName')
        })) : UNKNOWN('forum_tags_unavailable'),
      defaultReactionEmoji: field(channel, 'defaultReactionEmoji'),
      defaultSortOrder: field(channel, 'defaultSortOrder'),
      defaultForumLayout: field(channel, 'defaultForumLayout'),
      defaultAutoArchiveDuration: field(channel, 'defaultAutoArchiveDuration'),
      defaultThreadRateLimitPerUser: field(channel, 'defaultThreadRateLimitPerUser'),
      rateLimitPerUser: field(channel, 'rateLimitPerUser')
    } : null
  };
  return obj;
}

function guildSettings(guild) {
  return {
    id: String(guild.id),
    name: safeText(guild, 'name'),
    description: safeText(guild, 'description'),
    ownerId: field(guild, 'ownerId'),
    features: field(guild, 'features'),
    verificationLevel: field(guild, 'verificationLevel'),
    explicitContentFilter: field(guild, 'explicitContentFilter'),
    defaultMessageNotifications: field(guild, 'defaultMessageNotifications'),
    mfaLevel: field(guild, 'mfaLevel'),
    nsfwLevel: field(guild, 'nsfwLevel'),
    preferredLocale: field(guild, 'preferredLocale'),
    afkChannelId: field(guild, 'afkChannelId'),
    afkTimeout: field(guild, 'afkTimeout'),
    systemChannelId: field(guild, 'systemChannelId'),
    systemChannelFlags: guild.systemChannelFlags ? bitfield(guild.systemChannelFlags) : UNKNOWN(),
    rulesChannelId: field(guild, 'rulesChannelId'),
    publicUpdatesChannelId: field(guild, 'publicUpdatesChannelId'),
    safetyAlertsChannelId: field(guild, 'safetyAlertsChannelId'),
    widgetEnabled: field(guild, 'widgetEnabled'),
    widgetChannelId: field(guild, 'widgetChannelId'),
    premiumTier: field(guild, 'premiumTier'),
    premiumProgressBarEnabled: field(guild, 'premiumProgressBarEnabled'),
    iconHash: field(guild, 'icon'),
    bannerHash: field(guild, 'banner'),
    splashHash: field(guild, 'splash'),
    discoverySplashHash: field(guild, 'discoverySplash'),
    // Vanity codes, invite links, webhooks and integrations are deliberately excluded.
  };
}

export function buildServerSnapshot({ guild, roles, channels, botMember = null, omissions = [], generatedAt = new Date().toISOString() }) {
  const roleItems = sorted(asItems(roles), (a,b) => (Number(a.position) - Number(b.position)) || String(a.id).localeCompare(String(b.id)));
  const channelItems = sorted(asItems(channels), sortedByPosition);
  const categories = channelItems.filter(c => c.type === 4);
  const otherChannels = channelItems.filter(c => c.type !== 4);
  const parentIds = new Set(categories.map(c => String(c.id)));
  const warnings = [...omissions];
  const allCategories = categories.map(c => channelFields(c, parentIds, botMember, warnings));
  const allChannels = otherChannels.map(c => channelFields(c, parentIds, botMember, warnings));
  if (!botMember) warnings.push({ issue: 'bot_own_member_unavailable; per_channel_view_checks_unknown' });
  const coverage = {
    roleCount: roleItems.length,
    categoryCount: allCategories.length,
    channelCount: allChannels.length,
    memberListsFetched: false,
    messagesFetched: false,
    privateDMsFetched: false,
    webhooksFetched: false,
    invitesFetched: false,
    threadsFetched: false,
    note: 'Channels returned by the Guild Channels API only. Threads and forum posts were not enumerated. If bot access obscures channels, unreturned channels cannot be counted.'
  };
  return {
    schema: SCAN_SCHEMA, schemaVersion: SCAN_VERSION, generatedAt,
    guild: guildSettings(guild),
    roles: roleItems.map(r => ({
      id: String(r.id), name: safeText(r, 'name'), position: field(r, 'position'),
      rawPosition: field(r, 'rawPosition'), color: field(r, 'color'), hexColor: field(r, 'hexColor'),
      permissions: permissions(r.permissions), hoist: field(r, 'hoist'), mentionable: field(r, 'mentionable'),
      managed: field(r, 'managed'), flags: r.flags ? bitfield(r.flags) : UNKNOWN()
    })),
    categories: allCategories, channels: allChannels, coverage, omissions: warnings
  };
}

// Each attachment is a complete, parseable JSON document. Large snapshots
// are split on role/category/channel boundaries, never in the middle of JSON.
export function splitSnapshot(snapshot, maxBytes = 6 * 1024 * 1024) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 2048) throw new Error('Attachment byte limit too small');
  const metadata = {
    schema: snapshot.schema, schemaVersion: snapshot.schemaVersion, generatedAt: snapshot.generatedAt,
    guild: snapshot.guild, coverage: snapshot.coverage, omissions: snapshot.omissions
  };
  const size = obj => Buffer.byteLength(JSON.stringify(obj, null, 2), 'utf8');
  const makePart = () => ({ ...metadata, part: { index: 1, total: 1 }, roles: [], categories: [], channels: [] });
  const results = [makePart()];
  for (const key of ['roles', 'categories', 'channels']) {
    for (const item of snapshot[key] || []) {
      let target = results.at(-1);
      target[key].push(item);
      if (size(target) > maxBytes) {
        target[key].pop();
        if (!target.roles.length && !target.categories.length && !target.channels.length) throw new Error('A single configuration object exceeds attachment limit');
        target = makePart();
        target[key].push(item);
        if (size(target) > maxBytes) throw new Error('A single configuration object exceeds attachment limit');
        results.push(target);
      }
    }
  }
  const total = results.length;
  return results.map((result, i) => {
    result.part = { index: i + 1, total };
    const text = JSON.stringify(result, null, 2);
    if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error('Attachment exceeds byte limit after numbering');
    return Buffer.from(text, 'utf8');
  });
}
