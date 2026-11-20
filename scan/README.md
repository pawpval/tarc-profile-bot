# TARC Server Configuration Scanner

This is an **owner-only, read-only** export of the main TARC Discord server configuration. It uses the **existing bot and discord.js v14**. It cannot create, change, delete or apply server settings.

## Railway configuration

- Main guild: existing TARC_MAIN_GUILD_ID or GUILD_ID. If only GUILD_IDS is set, its single entry is accepted; for multiple guilds specify TARC_MAIN_GUILD_ID.
- Optional TARC_SCAN_OWNER_ID: exact Discord user ID allowed to run the scan. If omitted, only the current Discord guild owner can run it. Access is checked server-side; Administrator roles do not bypass it.
- No additional Discord bot application or new secret is required. The existing bot must be in that guild.

After Railway redeploys and registers the guild command, run **/server-scan** in the main TARC server. The bot acknowledges privately, reads metadata and returns numbered JSON attachments in an ephemeral response. Download every part if there is more than one. Treat the exports as sensitive.

## Snapshot format

Schema: tarc.discord.guild-configuration. Schema version: 1.

Every part is valid JSON containing guild, roles, categories, channels, coverage, omissions and part metadata. Permission allow/deny and role permission bitfields use strings to avoid precision loss. Each child channel preserves its own raw overwrite list and parent-category sync state; unsynchronised children are **not** assigned invented inherited overwrites.

Channel type, position, parent, topic, NSFW, slowmode, forum tags/configuration and voice/stage settings are included wherever supported. Unknown values are marked explicitly. Failed metadata reads appear under omissions.

The scanner does **not** fetch channel messages, member lists, DMs, invites, webhooks, tokens, forum posts or thread content. It reads only the bot's own member record to check channel visibility. Discord may hide inaccessible channels or fields; the scanner cannot enumerate what Discord never returns.

Topics and descriptions have common secrets, invite links and webhook URLs redacted. Free-form text can contain unfamiliar secrets, so review the export before sharing it.

Attachments are held in memory. They are not saved to disk, logged, or posted publicly. There are no build or apply functions.

## Tests

Run npm test. The scanner tests exercise owner/guild restrictions, raw bitfields, category synchronization, redaction, file splitting, and private attachment responses.
