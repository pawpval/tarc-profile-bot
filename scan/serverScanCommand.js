import { AttachmentBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { buildServerSnapshot, isAuthorizedScan, splitSnapshot } from './serverScanCore.js';

// Trust exactly one TARC owner identity across servers, not every guild's
// owner. The optional Railway user ID pins access to the desired account.
// Otherwise the main TARC server's actual owner is the trusted account.
export function serverScanConfiguration(env = process.env) {
  const ids = String(env.GUILD_IDS || '').split(',').map(x => x.trim()).filter(Boolean);
  return {
    mainGuildId: String(env.TARC_MAIN_GUILD_ID || env.GUILD_ID || ids[0] || '').trim(),
    ownerId: String(env.TARC_SCAN_OWNER_ID || '').trim()
  };
}

export function getServerScanCommand() {
  // Global guild-install command: available wherever the existing bot is
  // installed, but never in DMs or as a user-installed application command.
  const command = new SlashCommandBuilder()
    .setName('server-scan')
    .setDescription('Owner: privately export read-only Discord server configuration')
    .setDMPermission(false)
    .setDefaultMemberPermissions(0n)
    .toJSON();
  command.integration_types = [0]; // Guild install only
  command.contexts = [0]; // Guild interactions only
  return command;
}

function errorSummary(error) {
  // Never log arbitrary API response bodies: they may contain channel names.
  const code = typeof error?.code === 'number' || typeof error?.code === 'string' ? String(error.code) : 'unknown';
  return 'api_or_permission_error:' + code;
}

export async function collectServerConfiguration(guild) {
  const omissions = [];
  let freshGuild = guild;
  let roles = [];
  let channels = [];
  let botMember = null;

  // Guild, role, and channel configuration plus only the bot's own member.
  // No member-list enumeration, messages, invites, or webhook reads.
  try { freshGuild = await guild.fetch(); }
  catch (error) { omissions.push({ section: 'guild_settings', issue: errorSummary(error), fallback: 'cached_guild_metadata' }); }
  try { roles = await guild.roles.fetch(); }
  catch (error) { omissions.push({ section: 'roles', issue: errorSummary(error), status: 'unknown' }); }
  try { channels = await guild.channels.fetch(); }
  catch (error) { omissions.push({ section: 'channels', issue: errorSummary(error), status: 'unknown' }); }
  try { botMember = await guild.members.fetchMe(); }
  catch (error) { omissions.push({ section: 'bot_permission_validation', issue: errorSummary(error), status: 'unknown' }); }

  if (!Array.isArray(channels) && channels?.size !== undefined && channels.size === 0) {
    omissions.push({ section: 'channels', issue: 'no_channels_returned; confirm_bot_guild_access' });
  }
  if (botMember?.permissions?.has && !botMember.permissions.has(PermissionFlagsBits.ViewChannel)) {
    omissions.push({ section: 'bot_permissions', issue: 'bot_has_no_guild_wide_view_channel; private_channel_coverage_unverifiable' });
  }
  return buildServerSnapshot({ guild: freshGuild, roles, channels, botMember, omissions });
}

export async function handleServerScanInteraction(interaction, config = serverScanConfiguration()) {
  if (!interaction.isChatInputCommand?.() || interaction.commandName !== 'server-scan') return false;
  const privateMessage = content => ({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  const denied = 'Only the authorized TARC owner can scan servers they own or administer.';

  // Discord guild ownership or Administrator by itself is not sufficient:
  // the invoking user must ALSO be the uniquely trusted TARC owner.
  if (!interaction.guildId) {
    await interaction.reply(privateMessage(denied));
    return true;
  }
  try {
    // Acknowledge before any API call, without publishing anything publicly.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guild = interaction.guild ? await interaction.guild.fetch() : await interaction.client.guilds.fetch(interaction.guildId);
    if (String(guild.id) !== String(interaction.guildId)) throw new Error('Guild mismatch');

    let trustedOwnerId = config.ownerId;
    if (!trustedOwnerId && config.mainGuildId) {
      const mainGuild = String(config.mainGuildId) === String(guild.id)
        ? guild
        : await interaction.client.guilds.fetch(config.mainGuildId);
      trustedOwnerId = String(mainGuild.ownerId || '');
    }

    const hasAdministrator = interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator) === true;
    if (!isAuthorizedScan(
      { guildId: interaction.guildId, userId: interaction.user?.id, hasAdministrator },
      { guildId: guild.id, ownerId: guild.ownerId, trustedOwnerId }
    )) {
      await interaction.editReply({ content: denied, allowedMentions: { parse: [] } });
      return true;
    }

    const snapshot = await collectServerConfiguration(guild);
    const attachmentLimit = Number(interaction.attachmentSizeLimit);
    const maxBytes = Number.isFinite(attachmentLimit) && attachmentLimit > 4096
      ? Math.min(6 * 1024 * 1024, Math.floor(attachmentLimit - 2048))
      : 6 * 1024 * 1024;
    const parts = splitSnapshot(snapshot, maxBytes);
    const timestamp = snapshot.generatedAt.replace(/[:.]/g, '-');
    const files = parts.map((buffer, i) => new AttachmentBuilder(buffer, {
      name: 'discord-server-scan-' + timestamp + '-part-' + String(i+1).padStart(3,'0') + '-of-' + String(parts.length).padStart(3,'0') + '.json'
    }));
    const summary = 'Private Discord server configuration export. ' + snapshot.roles.length + ' roles, ' +
      snapshot.categories.length + ' categories, ' + snapshot.channels.length + ' channels. ' +
      snapshot.omissions.length + ' coverage warning(s). ' + parts.length +
      ' JSON file(s). Keep these attachments private. No messages, member lists, invites or webhooks were fetched.';

    // Discord allows 10 attachments per message. Batch at 8 and use private followups.
    for (let offset = 0; offset < files.length; offset += 8) {
      const payload = {
        content: offset === 0 ? summary : 'Configuration export continued (batch ' + (Math.floor(offset / 8) + 1) + ').',
        files: files.slice(offset, offset + 8),
        allowedMentions: { parse: [] }
      };
      if (offset === 0) await interaction.editReply(payload);
      else await interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral });
    }
  } catch (error) {
    console.error('[SERVER SCAN] Export failed; code=', errorSummary(error));
    const message = 'The private server scan could not finish. Check bot permissions and Railway logs. No server settings were changed.';
    try {
      if (interaction.deferred || interaction.replied) await interaction.editReply({ content: message, files: [], allowedMentions: { parse: [] } });
      else await interaction.reply(privateMessage(message));
    } catch { /* Interaction may have expired. Never fall back to a public message. */ }
  }
  return true;
}
