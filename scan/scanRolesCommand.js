import { AttachmentBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { isAuthorizedScan } from "./serverScanCore.js";
import { serverScanConfiguration } from "./serverScanCommand.js";

export function getScanRolesCommand() {
  const command = new SlashCommandBuilder()
    .setName("scan")
    .setDescription("Export server configuration")
    .addSubcommand(sub => sub.setName("roles").setDescription("Owner: export all role names and IDs"))
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON();
  command.integration_types = [0];
  command.contexts = [0];
  return command;
}

export async function handleScanRolesInteraction(interaction, config = serverScanConfiguration()) {
  if (!interaction.isChatInputCommand?.() || (interaction.commandName !== "scan" || interaction.options?.getSubcommand?.(false) !== "roles")) return false;
  const privateOptions = { flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } };
  if (!interaction.guildId) {
    await interaction.reply({ content: "This command only works in a server.", ...privateOptions });
    return true;
  }
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guild = await interaction.client.guilds.fetch(interaction.guildId);
    let trustedOwnerId = config.ownerId;
    if (!trustedOwnerId && config.mainGuildId) {
      const mainGuild = String(config.mainGuildId) === String(guild.id)
        ? guild : await interaction.client.guilds.fetch(config.mainGuildId);
      trustedOwnerId = String(mainGuild.ownerId || "");
    }
    const hasAdministrator = interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator) === true;
    if (!isAuthorizedScan(
      { guildId: interaction.guildId, userId: interaction.user?.id, hasAdministrator },
      { guildId: guild.id, ownerId: guild.ownerId, trustedOwnerId }
    )) {
      await interaction.editReply({ content: "Only the authorised TARC owner can export roles from servers they own or administer." });
      return true;
    }
    const roles = await guild.roles.fetch();
    const entries = [...roles.values()].sort((a, b) => b.position - a.position || a.name.localeCompare(b.name));
    const exportData = {
      serverName: guild.name,
      serverId: guild.id,
      exportedAt: new Date().toISOString(),
      roles: entries.map(role => ({
        name: role.name,
        id: role.id,
        position: role.position,
        managed: role.managed,
        permissions: role.permissions.bitfield.toString()
      }))
    };
    const buffer = Buffer.from(JSON.stringify(exportData, null, 2), "utf8");
    await interaction.editReply({
      content: `Private role export for **${guild.name}**: ${entries.length} roles. No server changes were made.`,
      files: [new AttachmentBuilder(buffer, { name: `discord-roles-${guild.id}.json` })],
      allowedMentions: { parse: [] }
    });
  } catch (error) {
    console.error("[SCAN ROLES] Export failed:", String(error?.code || error?.status || "unknown"));
    const content = "Role export failed. Check bot access and Railway logs; no server settings were changed.";
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content, files: [] });
    else await interaction.reply({ content, ...privateOptions });
  }
  return true;
}
