# UKSF verified Discord role and permissions overhaul

**Source of truth:** `BSA_UKSF_Discord_Role_Overhaul_Codex_Instructions_VERIFIED.md`, scan 2026-11-23 08:00 UTC. Hard-target guild ID `1573839214553075823`. This is **not** RTR (`1573839470359482431`), the main BSA server or TARC.

## Command and consent

Run **`/bsa-uksf-rework`** in the exact verified UKSF guild while logged into the configured BSA owner account. A private dry run shows role-by-role ID/name mappings, all 14 category and 54 channel overwrite diffs, current role holder IDs, member branch-tag additions, conflicting identities, protected items, and before/after/rollback records.

The command will not write until its owner clicks **Confirm UKSF-only overhaul**. Confirmations expire after ten minutes; the entire source role/channel/member snapshot is revalidated immediately before changing anything. If the actual guild ID, named role identity, channel ID, name, parent category or member count differs from the verified scan, execution is blocked. Only the verified guild is ever eligible.

The older generic `/bsa-generate` UKSF build is blocked in this guild to prevent it reverting the revised structure. All other regimental generators, RTR-only command, main BSA and TARC remain unchanged.

## Approved 12 functional ranks, highest → lowest

1. Commanding Officer
2. Executive Officer
3. Head of Operations
4. Regimental Sergeant Major
5. Senior Operations Officer
6. Operations Officer
7. Recruitment Officer
8. Operations Sergeant
9. SAS | Special Air Service
10. SRR | Special Reconnaissance Regiment
11. Operator
12. Special Training Course

SAS and SRR are **peer branches**, not consecutive promotion stages. Discord will display them adjacent, but no one automatically moves from SAS to SRR. Both carry the same authority level and safe channel access. No intermediate operator ranks are created.

Two separate and **zero-guild-permission** membership tags `Branch | SAS` and `Branch | SRR` persist when a member later receives a shared leadership rank. A member can carry only one branch tag by default. An already-verified SAS/SRR rank holder is offered the matching tag at confirmation; subsequent manually assigned branch ranks trigger the same tag-sync rule. It never assigns promotions, removes existing rank roles or infers membership from shared leadership positions. Both-branch conflicts are reported and skipped.

## Verified ID reuse and safeguards

The candidate rename mapping follows the uploaded scan exactly:

- Novice Operator → SAS | Special Air Service (`1573883649324228754`)
- Operator II → SRR | Special Reconnaissance Regiment (`1573883651400278077`)
- Advanced Warfare Trainee → Operations Sergeant (`1573883654210592818`)
- Special Operator → Recruitment Officer (`1573883655540179105`)
- Special Operator II → Operations Officer (`1573883656382980098`)
- Recruiter → Senior Operations Officer (`1573883657494466640`)

**Candidate ≠ permission to reclassify a user.** Reuse a role ID by renaming only when the original role is verified to have zero members. If populated, the old role and all its member assignments are preserved for manual review and a new rank is created instead. The same applies when a destination rank already exists: no merging. No role is deleted, no old assignment is removed. Instructor, Senior Instructor, Directorate Staff and Directorate Staff Supervisor are preserved intact with current holders and overwrite references listed for manual retirement decisions.

Existing Special Training Course, Operator, Regimental Sergeant Major, Head of Operations, Executive Officer, Commanding Officer, HQ, Guest, UKSF Personnel, RIC, Regimental Oversight, builder lock and TARC Assistant are checked against **their exact scanned Discord role IDs**.

## Permissions and preserved content

All existing 14 categories and 54 channels are identified by exact scanned IDs. Only targeted category/channel **permission overwrites** are adjusted in place: public onboarding/information, training, regiment personnel, operations, recruitment staff, staff rooms, command rooms and Archives. Every named category and channel preserves its ID, name, type, parent and messages; no channels, rooms or Roblox groups are created/deleted.

- Public welcome/rules/announcements stay readable to guests; posting is limited to designated staff.
- Trainee, Operator, SAS/SRR, staff and command tiers receive the access described in the approved file.
- Ordinary ranks and branch tags never gain Administrator, ManageGuild, ManageRoles, ManageChannels, KickMembers or BanMembers. Senior roles preserve existing explicitly configured privileges and do not automatically receive Administrator.
- Stale known local-rank overwrites are replaced with the revised role access. Unrelated member/bot/RIC/oversight overrides are **preserved and flagged** if their existing ViewChannel access may exceed a declared private tier. Permission simulations cannot guarantee an external bot's eventual rights, so the preview must be inspected.
- The verified scan has **no SAS-only or SRR-only channels**. None are invented or repurposed. A separate owner decision is required before adding branch-private channels.

The result report logs original/new IDs, updated permission bits, overwritten channel IDs, member tag additions, exceptions and rollback mappings. If Discord refuses an operation, it stops rather than pretending the overhaul is complete. A second run reuses corrected roles and tags without duplication.

## Before executing

Confirm the bot has both Manage Roles and Manage Channels, is above the UKSF rank roles, and that its privileged Guild Members intent provides a complete member list. Review the **private** JSON, especially any populated legacy roles, possible branch-tag conflicts and preserved external overwrites. Live Discord permission verification should use actual guest, trainee, Operator, SAS, SRR, RSM, Head of Operations, XO and CO test accounts.

**GitHub/Railway deployment alone never applies changes to the live UKSF guild.** Only confirmed execution in the exact server can do so.
