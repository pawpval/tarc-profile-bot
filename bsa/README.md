# Temporary British Sandhurst Army Discord builder

This is a **temporary, opt-in, BSA-guild-only** module for the existing TARC Discord bot. It does **not** touch TARC roles, channels, members, server settings, messages or permissions. No new bot application is needed.

## Configuration (Railway environment)

Required:

- `BSA_GUILD_ID` - exact numeric Discord Guild ID of **British Sandhurst Army | BSA**, the fresh destination server.
- `BSA_OWNER_DISCORD_ID` - your exact numeric Discord user ID. `TARC_SCAN_OWNER_ID` is accepted as a fallback if already configured.
- `TARC_MAIN_GUILD_ID` or existing `GUILD_ID` - actual protected TARC Guild ID. This must remain set correctly. The builder fails closed if the protected ID is missing or equals BSA_GUILD_ID.

The bot must be invited to the BSA server with **Manage Roles** and **Manage Channels**. Place the bot's highest role above the roles that will be managed. Keep the owner account as the BSA guild's actual owner. For Forum and Stage channels, enable Discord's **Community** server feature before building.

BSA commands are **global Guild Install commands** so the bot does not need BSA_GUILD_ID added to its existing `GUILD_IDS` registration loop. The commands may take a little time to become visible after the bot is deployed. They are denied in every guild other than the one whose ID matches BSA_GUILD_ID. They cannot be used in DMs.

## Commands

`/bsa-preview` is read-only. It returns a concise private Discord summary and a **full JSON attachment** containing the ordered 55-role, 16-category, 100-channel V4 template and a report of any errors, warnings, existing-name conflicts and required bot permissions. The attachment includes all role colours and all individual channel view/post role lists.

`/bsa-build` validates the template and the current bot/guild permissions before offering an owner-only confirmation button. **No changes happen before that button is clicked.** Confirmation is bound to one user, one guild, one template hash and ten minutes. The builder checks everything again on confirmation and creates missing roles, categories and text/voice/forum/Stage channels. Existing matching roles and channels are reused, not duplicated or deleted. The specified legacy `dyno-logs` name is renamed to `server-logs` only if it exists in the BSA logging sector and no server-logs channel exists.

`/bsa-audit` is read-only. It compares names, role colours, Administrator permissions, role hierarchy, channel types, per-parent order, and explicit role/member overwrites. It returns a private downloadable JSON discrepancy report.

No webhook destinations are configured, no messages are fetched, and no existing BSA roles or channels are automatically deleted. The builder does not rename or overwrite unrelated existing BSA objects.

## Current V4 template has two permission blockers

The **original owner-provided V4 JSON** is included unchanged as `bsa/BSA_Server_Template_V4.json`. It describes 55 roles, 16 categories and 100 channels.

The V4 notes say `OFFICER STAFF SECTOR/supervision-request` is for **Officer Cadets on Trial**, but it has **no trial-cadet role definition** and its `access.post` currently includes the general `OF-0 | Officer Cadet` role. For safety, the builder refuses to create any server objects until you:

1. Add the actual **Officer Cadet on Trial** role, including its intended name, colour and `administrator:false`, to `roles`. It must have an unambiguous name containing Officer Cadet and Trial.
2. Include that exact role name in `supervision-request.access.view` and `supervision-request.access.post`.
3. Remove general `OF-0 | Officer Cadet` from both `supervision-request.access.view` and `supervision-request.access.post`. Viewing and requesting supervision are limited to the explicit trial-cadet role and the named supervising staff.

Several V4 category `default_view` lists also contain outdated role labels such as `Moderation Department`, `QA Team`, and rank aliases without the `|` separator. Those are **warnings**, not silent grants: every channel has its own explicit valid `access.view` and `access.post`, which are authoritative. Category visibility is derived conservatively from the channel view lists, and aliases are never invented.

Keep the V4 file updated in GitHub before retrying `/bsa-preview`. A new deployment is required to load edited template contents.

## Safety and cleanup

The BSA command router first checks exact BSA_GUILD_ID, exact BSA_OWNER_DISCORD_ID, protected TARC guild inequality, target guild name and target guild owner identity, all on the server. Every message and report is ephemeral. Build errors can leave **partial objects only in BSA**; rerunning is designed to reuse exact matching objects. The builder never deletes anything.

To remove these temporary commands after auditing BSA, remove `getBsaCommands()` from the global command registration, remove `handleBsaInteraction()` from the interaction router, remove its import from `server.js`, and remove the `bsa/` folder. Redeploy so Discord command registration removes the three commands. Existing BSA roles, channels and permissions **remain**.

Run `npm test` to execute the existing game/scanner tests and the BSA regression suite. A GitHub Actions test workflow also runs on relevant pull requests.
