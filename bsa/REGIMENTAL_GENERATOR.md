# Temporary BSA regimental Discord server generator

The ten source templates come from the uploaded BSA_Regimental_Planning_Pack.zip. The bot stores their complete *_PROPOSED_CONFIG.json contents in bsa/regimental-proposals.b64 (compressed losslessly with Brotli). Legacy *_SOURCE_AUDIT.json scans and review files are REFERENCE MATERIAL, NOT permission instructions. The app never touches their source Discord guilds.

## Commands

- /bsa-generate server:<preset>: chooses from RMP, ETS, RGG, RTR, UKSF, GR, RIC, OCA, RICA and RA. Read-only preview includes the exact proposed roles, categories, channels, types, unresolved questions and required permissions as a downloadable JSON file. Confirm on the private button only after reviewing the PREVIEW. Confirmation expires in ten minutes and is bound to the account, exact guild ID, preset and current layout.
- /bsa-regiment-audit: read-only structural audit that automatically detects the preset's BSA Builder lock role.

The bot must already be invited to each NEW server and given Manage Roles and Manage Channels. Enable Community in each new server that needs Forum channels. Move its highest role above the roles it will manage. The new server name is NOT used as a security check.

The slash commands register globally, and the bot also POST-upserts the TWO commands immediately in each owner-controlled new guild after invite and on startup. It never bulk-overwrites guild slash commands.

## Protected guilds and configuration

Reuse the existing Railway BSA_OWNER_DISCORD_ID, BSA_GUILD_ID (the main BSA), and TARC_MAIN_GUILD_ID (original TARC), or optionally set BSA_BUILDER_OWNER_ID to the same account. Do NOT change GUILD_ID/GUILD_IDS to new regiment IDs and do NOT change BSA_GUILD_ID. The bot automatically derives the destination guild ID from whichever NEW server you run the command inside.

Before a read or write, the command checks the user is the configured owner AND the actual Discord guild owner. It blocks all historical TARC source guild IDs in the ZIP, the original TARC guild ID, every GUILD_IDS entry, and the main BSA guild ID. Guild NAME is intentionally irrelevant.

To avoid modifying a developed or wrong server, an unclaimed target still refuses arbitrary unmanaged custom roles; any existing unmatched channel/category is instead **reported in the private preview under extraObjects and kept completely unchanged**. This includes extra Discord starter, onboarding or system channels: they do not block generation merely because they are absent from a selected proposal. Duplicate matching category/channel names, wrong channel types, conflicting roles and selecting another preset in an already claimed server remain blockers. No existing channel or role is overwritten. On first confirmation the bot adds a neutral zero-permission role named "BSA Builder | RMP" (or the selected code) to lock the guild to exactly one preset and support safe partial retries. Keep this lock role until the rollout is audited. Selecting a different preset in the same guild fails closed.

No existing roles or channels are deleted, moved or repurposed; existing objects are reused only if they match the locked preset and expected parent/category/type. A time-limited partially completed build can be continued by running the same command again.

## Important source limitations and permission safety

ALL ten source proposals are explicitly PROPOSAL_NOT_APPROVED. This is a structural generator, NOT proof of final policy approval.

The proposals provide names, category access labels, ranks ordered lowest-to-highest, channel types and descriptions, but DO NOT provide final exact Discord permission overwrites or role colours. The bot will NOT fabricate staff/instructor/agent/department access or make every role Administrator.

- Every proposed role is created without guild privileges and with Discord's default colour.
- PUBLIC sections have @everyone view, but posting/threads are read-only until intentionally configured.
- ALL other categories, including personnel, command, intelligence departments, mixed voice, application support and moderation, deny @everyone ViewChannel and do not create speculative role grants. The owner or an Administrator can review access and manually set it after approval.
- Ticket handling, webhook destinations, Roblox sync, messages, flight/tank privileges, automations and bot integrations are NOT created.
- Reports & Appeals (RA): the unchanged source proposal lists 13 rank entries but only 10 unique names, repeating Guest, RIC | Royal Intelligence Corps and Headquarters. The owner explicitly approved skipping duplicate role entries only when their creation settings are identical. These entries are plain strings with no individual role colours or permission grants, and the generator creates each with identical zero-permission defaults, so exactly one of each name is created. The LAST occurrence in the source lowest-to-highest array determines each duplicated role's final hierarchy position (highest priority). The private preview displays the three skipped entries and the 10-role result. If a future proposal contains per-role permission/colour objects, the generator rejects them until they are explicitly reviewed; source Discord permissions are NOT assumed equal.
- Some other category access labels are undefined or vague (for example RMP provost/operations and UKSF candidates). Those categories remain private and explicitly flagged in previews.

The manual approval of role visibility, ranked hierarchy, department policies and channel access is a separate step. The audit checks presence/types, not whether unspecified final policies are approved.

## Cleanup after all new guilds are built

Do NOT remove regimental-proposals.b64 or the helper files while a server is mid-build. Once your final audits are complete, remove the getRegimentalCommands registration and handleRegimentalInteraction hook in server.js and remove the GuildCreate/readiness guild-command registration. Remove the TWO global application commands on redeployment, AND remove the guild-specific command registrations from each new server through Discord's application command API. The existing /server-scan, /bsa-build, /bsa-format and other TARC features are independent.

Removing the temporary builder code does not remove any generated Discord channels or roles. Keep the builder-lock role only as long as needed to document which preset was built; removing it later does not delete other roles/channels.
