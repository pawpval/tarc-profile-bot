# Revised BSA regimental in-place revamp

## Source of truth
This implementation uses BSA_Regimental_Planning_Pack_REVISED.zip for ALL target roles, channel layouts, role colours, base permissions, hierarchy and overwrite flags. The operational data from its ten revised JSONs is stored in bsa/revised-regimental-core.b64 and verified with SHA-256 before use. The older bundled proposals are consulted only as a guide to the locations of channels created under the previous builder, never as the target configuration.

The revised pack specifies **494 channels in ten presets**. OCA has **11 categories, 61 channels and five separate phases**. RICA has **8 categories, 34 channels and three training phases**. Reports & Appeals has **9 categories and 14 static channels**, with empty ticket categories reserved for ticket bots. The top five ranks in all presets are Field Marshal, Chief of General Staff, Deputy Chief of General Staff, Assistant Chief of General Staff and Army Sergeant Major.

## Critical Discord role hierarchy prerequisite

The bot's highest Discord role MUST be above **every** regimental rank, with enough room beneath it for all ranks. In Discord: Server Settings → Roles → drag TARC Assistant to the top (above Field Marshal, CGS, all trainee ranks). Discord does not allow any bot to promote or reorder roles at/above its own highest role. Having Manage Roles without a high role position is not enough.

The generator now checks this restriction BEFORE creating or editing anything. If it fails, the private /bsa-generate preview is BLOCKED and shows the bot's current role position plus what to change. No confirmation button will appear until the server role hierarchy permits all required moves.

After actual role creation/update, it rechecks the bot's position, explicitly submits numeric Discord positions with the highest rank receiving the highest number, then fetches the authoritative role list again. It verifies every adjacent rank is ordered strictly top-to-bottom, not merely that Discord's API accepted the request. A failed/no-op role reorder is recorded as INCOMPLETE, stops subsequent channel work and is never reported as fixed. Tests simulate an inverted OCA role list, bot-too-low, rejected update and an API no-op.

## Command workflow
Run /bsa-generate and select the regiment in the EXISTING BSA regiment server. The command uses the actual guild ID of invocation; the server name is irrelevant. Only the configured owner who also owns the Discord server can preview or confirm. Live TARC, main BSA and source/reference guilds are excluded.

The command privately reports a COMPLETE REVAMP DIFF before the one-time confirmation button appears. It lists which roles are created/updated, role colour and guild permission changes, the exact role order, category/channel overwrite changes, channel moves/renames/creations, third-party overwrite entries and orphaned old content. It includes simulated per-channel guest/member/trainee/instructor/command access checks.

On confirmed execution, roles are edited in place (preserving member assignments and role IDs), rank positions are explicitly reordered (highest at top), and existing channels are edited in place for names/parents/overwrites (preserving channel IDs, messages and forum threads). New objects are created only if missing. NOTHING IS DELETED. The bot supports retries and can stop safely if Discord operations take too long.

For cross-category moves the bot requires an existing builder-lock role for the same regiment and an unambiguous match under a known category from the previous BSA generation. Similar names in unrelated personal categories are not repurposed. Ambiguous matches or different presets block the operation.

Run /bsa-regiment-audit afterwards. The audit checks role colours/permissions, presence and exact structure, overwrite policies and HQ hierarchy. Testing the live Discord effective permissions with accounts from each permission tier is recommended.

## Exact access resolution and limitations
The revised ZIP provides authorized_roles and staff_roles placeholders, not actual Discord IDs. The bot resolves those placeholders to named target roles, never creating fake placeholder roles.

Public information is readable, with announcements read-only to ordinary users. Member areas grant the appropriate regiment personnel. Academy stages use matching trainee and instructor roles; staff and command areas are restricted. Command and HQ roles rank highest, but are not granted Administrator. OCA Phase 4/5 role definitions are absent from the ZIP, so Academy Student/Graduation or Officer Cadet/Graduation receive stage access alongside instructors/command. RIC's revised roles lack distinct IAD/COD/PAD department roles: those sensitive departments are restricted to command instead of guessing unrestricted access.

Unrelated role/user permission overwrites are retained to avoid silently breaking integrations; any such grants are flagged and the audit cannot certify those integrations. The revised pack is expressly labelled REVISED_PROPOSAL_REQUIRES_PREVIEW, so the configuration still needs owner review. Neither historical Discord messages nor ticket/Roblox integrations are imported or recreated.

The GitHub/Railway deployment itself does not change any live Discord server. Actual role and channel edits occur only on explicit, owner-authenticated confirmation in the chosen BSA regimental server.
