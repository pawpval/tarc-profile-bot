# Temporary BSA Royal Tank Regiment role-only rework

**Source:** The owner-uploaded `BSA_Regiment_Ranks_and_RTR_Bot_Instructions.md`. This implementation is intentionally **not** the ten-server `/bsa-generate` revamp: its specific request is to change only the existing RTR server's roles.

## Before use

Set `BSA_RTR_GUILD_ID` in Railway Variables to the **exact Discord Server ID of the already-generated RTR server**. Do not substitute the BSA main server ID or the original TARC ID. All existing `BSA_OWNER_DISCORD_ID`, `BSA_GUILD_ID` and `TARC_MAIN_GUILD_ID` settings remain unchanged. The bot does not guess the RTR guild ID from a server name or a historical template reference.

The command is `/bsa-rtr-rework`. It is registered globally so the owner can see it, and upserted only to the configured RTR guild for immediate visibility. It will *never execute* in any different guild. It requires the actual Discord owner to invoke it, the exact configured server ID, one `BSA Builder | RTR` marker, zero other BSA builder markers, and TARC Assistant's Manage Roles permission and position above existing target ranks.

## Role changes

- Top HQ ranks, highest to lowest: Field Marshal → Chief of General Staff → Deputy Chief of General Staff → Assistant Chief of General Staff → Army Sergeant Major.
- Regimental command: Commanding Officer → Executive Officer → Head of Armour → Regimental Sergeant Major → Squadron Commander → Squadron Officer.
- Functional (not a rank promotion ladder): Training Instructor and Recruiting Staff, placed adjacent and retaining their current relative order when already present.
- Tank Sergeant replaces **Armoured Vehicle Specialist** using the existing role ID, permissions, colour and member assignments if the role has an unambiguous exact-name match and **Tank Sergeant is not already present**.
- Peer specialist qualifications: Tank Gunner and Tank Driver, side by side. They are **not sequential promotions** and receive no extra server permissions from the generator.
- Crew/training: Advanced Crewman → Crewman → Armoured Training School.
- Newly created roles get **zero base permissions**, normal default colour, no hoist and no mentionability. Existing role permissions/colours are never rewritten. No automatic new Administrator grants.

Other roles, channels, category layout, channel overwrites, webhooks, tickets, member assignments and content are not edited, deleted or recreated. If old and new Tank Sergeant names both exist, neither role is merged/deleted or assigned to members; the old role is reported as unmatched for manual review.

## Safety and flow

1. Run `/bsa-rtr-rework` in the real RTR server. The bot reads the guild ID, current roles, positions, permissions, channel overwrite references and complete member-role data where Discord permits it.
2. Private dry-run JSON shows every create/rename, old/new role IDs and names, existing role holder counts, the intended top-to-bottom order and retained unrelated roles. If Discord has not supplied an exhaustive member list, the bot will **block a semantic rename** until the role holders can be verified. The bot has GuildMembers gateway intent configured; the corresponding privileged intent must also be enabled in the Discord Developer Portal.
3. Click **Confirm RTR role-only rework** within ten minutes. A recheck compares the full current role snapshot, preventing a stale confirmation from acting on different roles.
4. Apply the single approved old-to-new rename, create missing roles and sort rank roles using `guild.roles.setPosition(roleId, 1)` from highest to lowest. This preserves Discord role IDs and all existing assignments. If Discord rejects a hierarchy move, stop and report the issue; no broader channel edit is attempted.
5. Confirm that existing RTR rank roles now appear highest to lowest and download the private result JSON. Rerunning the command on an already-correct RTR guild makes no changes.

**No live server is changed by deploying GitHub/Railway code.** Only clicking the owner-confirmation button inside the exact configured RTR guild makes role edits. The command can be removed once the migration is complete; that removal won't affect the resulting Discord roles.
