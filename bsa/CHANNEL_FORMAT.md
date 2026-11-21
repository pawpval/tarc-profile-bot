# Temporary BSA channel formatter

The /bsa-format command is temporary and operates ONLY in the new BSA Discord server. It renames existing channels, never creates, deletes, moves, reparents or alters permissions, role hierarchy, messages, webhooks or integrations.

## Exact approved mapping

The complete 100-channel mapping is in bsa/channelFormatMap.js and matches the supplied names. Format: emoji│original-name, using Unicode U+2502 (not ASCII pipe). It covers 89 text channels, 8 voice channels, 2 forum channels, 1 Stage channel, and both top-level channels.

The 16 existing category names are untouched. Channel lookup matches the exact original name OR exact target name in the exact parent category ID. Repeated names such as bot-cmds, documents, discharge-request and inactivity-request are scoped to their own categories.

Unknown names, wrong types, missing parents or ambiguous duplicates are never guessed or renamed. All appear in the private report. Already correctly formatted channels are skipped.

## Safety

Reuse existing Railway variables: BSA_GUILD_ID, BSA_OWNER_DISCORD_ID (or TARC_SCAN_OWNER_ID fallback), and TARC_MAIN_GUILD_ID (or the protected existing GUILD_ID).

The command verifies exact BSA guild ID, trusted Discord user ID, a valid and DIFFERENT protected TARC guild ID, and the target guild's actual owner. It does not require an exact BSA server name, since the exact verified guild ID is the security boundary.

The bot must have Manage Channels at guild level and for every channel it renames. All command and button responses are ephemeral.

## Workflow

1. Run /bsa-format in BSA.
2. Review the private preview and downloadable bsa-channel-format-preview.json containing IDs, parents, old names, targets and all issues.
3. Confirm with Apply renames within ten minutes, or Cancel without changes.
4. Review bsa-channel-format-results.json.

Confirmations are single-use, bound to the owner, guild and a hash of the template and preview state. If the layout changes between preview and confirmation, the command stops before edits and requests another preview. Immediately before every rename, the bot fetches the channel by ID and checks name, parent, type and permissions. Only channel.setName is called.

Renames happen sequentially. Discord.js handles rate limits. The operation stops before the Discord interaction timeout. Rerun after interrupted operations; correctly formatted channels are skipped.

## Compatibility and cleanup

The BSA builder and audit recognise BOTH plain names and precisely formatted names in their correct parent categories, so rerunning /bsa-build does not create duplicates after formatting. Existing generic /formatchannels is untouched.

To remove the temporary commands later, remove their import/registration/router entries. If keeping the BSA builder, preserve channelFormatMap.js because the builder relies on its alias helper; otherwise remove the temporary BSA modules together. Removing commands never reverts Discord names.
