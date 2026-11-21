# Temporary British Sandhurst Army Discord builder

This is a **temporary, opt-in, BSA-guild-only** module for the existing TARC Discord bot. It does **not** touch TARC roles, channels, members, server settings, messages or permissions. No new bot application is needed.

## Configuration (Railway environment)

Required:

- `BSA_GUILD_ID` - exact numeric Discord Guild ID of **British Sandhurst Army | BSA**, the fresh destination server.
- `BSA_OWNER_DISCORD_ID` - your exact numeric Discord user ID. `TARC_SCAN_OWNER_ID` is accepted as a fallback if already configured.
- `TARC_MAIN_GUILD_ID` or existing `GUILD_ID` - actual protected TARC Guild ID. This must remain set correctly. The builder fails closed if the protected ID is missing or equals BSA_GUILD_ID.

If Discord replies with a configuration/access error, the command now identifies the missing or conflicting Railway setting without revealing the stored ID values. The most common cause is a missing `TARC_MAIN_GUILD_ID`, or mistakenly pointing `GUILD_ID` at the new BSA server. Keep the original TARC `GUILD_ID` and `GUILD_IDS` unchanged, and configure `BSA_GUILD_ID` separately. After editing Railway variables, deploy the updated service. The server's owner account must match `BSA_OWNER_DISCORD_ID` and the guild name must match exactly.

The bot must be invited to the BSA server with **Manage Roles** and **Manage Channels**. Place the bot's highest role above the roles that will be managed. Keep the owner account as the BSA guild's actual owner. For Forum and Stage channels, enable Discord's **Community** server feature before building.

BSA commands are **global Guild Install commands** so the bot does not need BSA_GUILD_ID added to its existing `GUILD_IDS` registration loop. The commands may take a little time to become visible after the bot is deployed. They are denied in every guild other than the one whose ID matches BSA_GUILD_ID. They cannot be used in DMs.

## Commands

`/bsa-preview` is read-only. It returns a concise private Discord summary and a **full JSON attachment** containing the ordered 56-role, 16-category, 100-channel V4 template and a report of any errors, warnings, existing-name conflicts and required bot permissions. The attachment includes all role colours and all individual channel view/post role lists.

`/bsa-build` validates the template and the current bot/guild permissions before offering an owner-only confirmation button. **No changes happen before that button is clicked.** Confirmation is bound to one user, one guild, one template hash and ten minutes. The builder checks everything again on confirmation and creates missing roles, categories and text/voice/forum/Stage channels. Existing matching roles and channels are reused, not duplicated or deleted. The specified legacy `dyno-logs` name is renamed to `server-logs` only if it exists in the BSA logging sector and no server-logs channel exists.

`/bsa-audit` is read-only. It compares names, role colours, Administrator permissions, role hierarchy, channel types, per-parent order, and explicit role/member overwrites. It returns a private downloadable JSON discrepancy report.

No webhook destinations are configured, no messages are fetched, and no existing BSA roles or channels are automatically deleted. The builder does not rename or overwrite unrelated existing BSA objects.

## Trial-cadet permissions corrected in V4

The owner-approved Officer Cadet supervision requirement has been applied to the bundled `bsa/BSA_Server_Template_V4.json`. The role **Officer Cadet on Trial** now appears alongside the other officer ranks, with the same `#6284AA` colour as `OF-0 | Officer Cadet` and no Administrator permission.

In `OFFICER STAFF SECTOR/supervision-request`, the ordinary `OF-0 | Officer Cadet` role was removed from both `access.view` and `access.post`. The new trial-cadet role was added to both. Existing explicitly named supervising staff remain allowed. This resolves the blocking template errors without inventing broad private-sector access.

The live build should now pass template validation. Remaining preflight requirements include Manage Roles/Channels, Community enabled, bot role hierarchy and accurate Railway IDs.

Several category `default_view` lists contain old role aliases. The builder warns about these, never grants access for them, and uses each channel's explicit `access.view` and `access.post` lists instead.

## Safety and cleanup

The BSA command router first checks exact BSA_GUILD_ID, exact BSA_OWNER_DISCORD_ID, protected TARC guild inequality, target guild name and target guild owner identity, all on the server. Every message and report is ephemeral. Build errors can leave **partial objects only in BSA**; rerunning is designed to reuse exact matching objects. The builder never deletes anything.

To remove these temporary commands after auditing BSA, remove `getBsaCommands()` from the global command registration, remove `handleBsaInteraction()` from the interaction router, remove its import from `server.js`, and remove the `bsa/` folder. Redeploy so Discord command registration removes the three commands. Existing BSA roles, channels and permissions **remain**.

Run `npm test` to execute the existing game/scanner tests and the BSA regression suite. A GitHub Actions test workflow also runs on relevant pull requests.
