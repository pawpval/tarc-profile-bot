# Discord Server Configuration Scanner

This command uses the existing TARC bot (Node.js / discord.js v14) and works in **any Discord guild where the bot is installed**, not just the main TARC guild. It is **read-only**: it cannot create, change, delete or apply server settings.

## Authorization

The same specific, trusted TARC owner account must meet **both** checks:

1. **Identity:** The invoking Discord user ID must match `TARC_SCAN_OWNER_ID`, when configured. Otherwise the scanner uses the actual owner ID of the configured main TARC server (`TARC_MAIN_GUILD_ID`, then `GUILD_ID`, then the first `GUILD_IDS` entry).
2. **Target server rights:** In the server being scanned, that account must either be the actual Discord server owner or have Discord's **Administrator** permission. A role merely named “Owner” does not count unless it grants Administrator.

Other servers' owners and administrators cannot use the command unless they are also the specific trusted TARC account. If the main TARC server is unavailable for verification and no owner ID is configured, access fails closed.

The command is registered **globally with Guild Install and Guild context only**, not in DMs or user-install contexts. Its default Discord command permissions are disabled for ordinary members; the server-side checks remain authoritative. Remove the old main-TARC guild-specific registration to avoid duplicate slash-command entries. Global command propagation can take some time.

## Railway configuration

- **Recommended:** `TARC_SCAN_OWNER_ID` = your Discord user ID. This guarantees the intended account is the trusted identity even if another person owns the main TARC guild.
- Existing `TARC_MAIN_GUILD_ID` / `GUILD_ID` and `GUILD_IDS` continue to apply to the rest of the bot unchanged.
- No new bot application, bot token, special privileged member intent, or new database is required.
- The existing bot must already be invited to each server you want to scan. It needs access to metadata for the channels you wish to include.

Use `/server-scan` in each server. The bot returns an **ephemeral** response with one or more JSON attachments. Download every part if split. Keep the exports private and review the text before sharing.

## Exported snapshot

Schema: `tarc.discord.guild-configuration`. Version: `1`.

Each JSON part contains guild settings, roles, categories, channels, coverage, omissions and part metadata. Permission allow/deny and role permission bitfields are strings to avoid losing integer precision. Channel metadata preserves raw overwrite sets and parent-category sync state. Unknown or inaccessible settings are labelled explicitly.

The scanner never fetches channel messages, member lists, DMs, invites, webhooks, tokens, forum posts or thread content. It fetches only the bot's own membership for permission diagnostics. Attachments are generated in memory and are neither saved nor logged.

## Validation

Run `npm test`. Scanner tests cover trusted-user verification, another owned guild, Administrator access in a division guild, unauthorized user/guild scenarios, private attachments, permission overwrites, forum/voice metadata and bounded JSON splitting.
