import { SlashCommandBuilder, ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";

const pending = new Map();
const command = new SlashCommandBuilder().setName("formatchannels").setDescription("Format all channel emoji prefixes (owner only)").toJSON();
const PREFIX = /^【([^】\r\n]+)】/u;
function replacement(name) {
  const match = name.match(PREFIX);
  if (!match) return null;
  const next = match[1] + "│" + name.slice(match[0].length).replace(/^│/u, "");
  return next !== name && next.length <= 100 ? next : null;
}
function isOwner(i) { return Boolean(process.env.TARC_OWNER_DISCORD_ID) && i.user.id === process.env.TARC_OWNER_DISCORD_ID; }
function eligible(channel, guild) {
  return channel.type !== ChannelType.GuildCategory &&
    channel.type !== ChannelType.PublicThread &&
    channel.type !== ChannelType.PrivateThread &&
    channel.type !== ChannelType.AnnouncementThread &&
    channel.manageable &&
    guild.members.me?.permissionsIn(channel).has(PermissionFlagsBits.ManageChannels);
}
export function getChannelFormatCommands() { return [command]; }
export async function handleChannelFormatInteraction(i) {
  const isCommand = i.isChatInputCommand() && i.commandName === "formatchannels";
  const isButton = i.isButton() && i.customId.startsWith("tarc:format:");
  if (!isCommand && !isButton) return false;
  try {
    if (!i.inGuild() || !isOwner(i)) {
      await i.reply({ content: "Only the TARC bot owner can use this command in the server.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (isCommand) {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const guild = i.guild;
      await guild.members.fetchMe();
      const channels = await guild.channels.fetch();
      const changes = [...channels.values()].filter(c => c && eligible(c, guild)).map(c => ({ id: c.id, before: c.name, after: replacement(c.name) })).filter(c => c.after);
      if (!changes.length) {
        await i.editReply("No accessible channels need formatting. Categories and threads are untouched.");
        return true;
      }
      const token = i.id;
      pending.set(token, { owner: i.user.id, guildId: guild.id, changes, expires: Date.now() + 5 * 60_000, running: false });
      const sample = changes.slice(0, 12).map(c => "\`" + c.before + "\` → \`" + c.after + "\`").join("\n");
      await i.editReply({
        content: "**Channel format preview**\n" + changes.length + " channels will change.\n\n" + sample + (changes.length > 12 ? "\n…and " + (changes.length - 12) + " more." : "") + "\n\nOnly the emoji prefix changes. Confirm within 5 minutes.",
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("tarc:format:apply:" + token).setLabel("Apply changes").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId("tarc:format:cancel:" + token).setLabel("Cancel").setStyle(ButtonStyle.Secondary)
        )]
      });
      return true;
    }
    const [, , action, token] = i.customId.split(":");
    const job = pending.get(token);
    if (!job || job.owner !== i.user.id || job.guildId !== i.guildId || Date.now() > job.expires) {
      await i.reply({ content: "This preview has expired. Run /formatchannels again.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (job.running) {
      await i.reply({ content: "Channel formatting is already running.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (action === "cancel") {
      pending.delete(token);
      await i.update({ content: "Channel formatting cancelled. Nothing changed.", components: [] });
      return true;
    }
    if (action !== "apply") return true;
    job.running = true;
    await i.update({ content: "Updating " + job.changes.length + " channels. This may take a few minutes…", components: [] });
    let updated = 0, skipped = 0, failed = 0;
    for (const change of job.changes) {
      try {
        const channel = await i.guild.channels.fetch(change.id).catch(() => null);
        if (!channel || !eligible(channel, i.guild) || channel.name !== change.before) { skipped++; continue; }
        await channel.setName(change.after, "TARC emoji channel prefix format update");
        updated++;
      } catch (error) {
        failed++;
        console.error("[FORMAT CHANNELS]", change.id, error);
      }
    }
    pending.delete(token);
    await i.editReply({ content: "Channel formatting finished. **Updated:** " + updated + " | **Skipped:** " + skipped + " | **Failed:** " + failed, components: [] }).catch(() => {});
    return true;
  } catch (error) {
    console.error("[FORMAT CHANNELS]", error);
    const message = "Couldn't format channels: " + String(error.message || "Unknown error").slice(0, 250);
    if (i.deferred || i.replied) await i.editReply({ content: message, components: [] }).catch(() => {});
    else await i.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
    return true;
  }
}
