import {PermissionFlagsBits as P} from "discord.js";

/**
 * BSA Royal Tank Regiment ROLE-ONLY migration.
 * The owner's BSA_Regiment_Ranks_and_RTR_Bot_Instructions.md is the authority.
 * Never read or write a channel/category, webhook, integration or member role.
 */
export const RTR_ROLE_LOCK="BSA Builder | RTR";
export const RTR_LEGACY_NAME="Armoured Vehicle Specialist";
export const RTR_NEW_NAME="Tank Sergeant";
export const RTR_ROLE_GROUPS=Object.freeze([
  {kind:"army-hq",roles:["Field Marshal","Chief of General Staff",
    "Deputy Chief of General Staff","Assistant Chief of General Staff","Army Sergeant Major"]},
  {kind:"regimental-command",roles:["Commanding Officer","Executive Officer",
    "Head of Armour","Regimental Sergeant Major","Squadron Commander","Squadron Officer"]},
  {kind:"functional-peers",roles:["Training Instructor","Recruiting Staff"]},
  {kind:"management",roles:["Tank Sergeant"]},
  {kind:"qualification-peers",roles:["Tank Gunner","Tank Driver"]},
  {kind:"crew",roles:["Advanced Crewman","Crewman","Armoured Training School"]}
]);
export const RTR_ROLE_NAMES=Object.freeze(RTR_ROLE_GROUPS.flatMap(g=>g.roles));
const asArray=value=>Array.isArray(value)?value.filter(Boolean):value?.values?[...value.values()].filter(Boolean):[];
const permissionBits=r=>String(r?.permissions?.bitfield??r?.permissions??0);
const isManaged=r=>Boolean(r?.managed||r?.tags?.botId||r?.tags?.integrationId);
const errorCode=e=>String(e?.code??e?.rawError?.code??e?.status??"unknown");
function memberCount(counts,roleId){
  const value=counts?.byRole?.[roleId];
  return counts?.complete && Number.isInteger(value)?value:null;
}

/** Keep the existing relative order between peer functional/qualification roles. */
export function resolveRtrRoleOrder(roles) {
  const available=asArray(roles);
  return RTR_ROLE_GROUPS.flatMap(group=>{
    if(!group.kind.endsWith("-peers"))return group.roles;
    const found=group.roles.map(name=>({name,role:available.find(r=>r.name===name)}));
    return found.sort((a,b)=>{
      const ap=a.role?.position,bp=b.role?.position;
      if(Number.isInteger(ap)&&Number.isInteger(bp)&&ap!==bp)return bp-ap;
      if(Number.isInteger(ap)!==Number.isInteger(bp))return Number.isInteger(ap)?-1:1;
      return group.roles.indexOf(a.name)-group.roles.indexOf(b.name);
    }).map(x=>x.name);
  });
}

export function inspectRtrRoles(guild,roleCollection,bot,holderCounts={complete:false,byRole:{}},
 channelCollection=[]) {
  const roles=asArray(roleCollection),channels=asArray(channelCollection);
  const issues=[],warnings=[];
  const locks=roles.filter(r=>/^BSA Builder \| [A-Z]+$/.test(r.name));
  if(locks.length!==1 || locks[0]?.name!==RTR_ROLE_LOCK)
    issues.push("This server must contain exactly one 'BSA Builder | RTR' role and no different builder lock.");
  if(!bot?.permissions?.has?.(P.ManageRoles))
    issues.push("TARC Assistant requires Manage Roles.");
  const highest=bot?.roles?.highest;
  const botRole=roles.find(r=>r.id===highest?.id)||highest;
  if(!botRole?.id || !Number.isInteger(botRole.position))
    issues.push("Could not verify TARC Assistant's highest role.");
  const targetRoles=new Map(),creates=[],renames=[],reuses=[];
  const aliasMatches=roles.filter(r=>r.name===RTR_LEGACY_NAME);
  const tankMatches=roles.filter(r=>r.name===RTR_NEW_NAME);
  if(aliasMatches.length>1)issues.push("Multiple Armoured Vehicle Specialist roles. Manual mapping required.");
  if(tankMatches.length>1)issues.push("Multiple Tank Sergeant roles. Manual mapping required.");
  for(const name of RTR_ROLE_NAMES){
    const matches=roles.filter(r=>r.name===name);
    if(matches.length>1) {
      issues.push("Ambiguous duplicate RTR role: "+name);
      continue;
    }
    if(matches.length){
      const role=matches[0];
      targetRoles.set(name,role);
      reuses.push({id:role.id,name,memberCount:memberCount(holderCounts,role.id),
        permissions:permissionBits(role),color:role.hexColor??role.color??null});
      continue;
    }
    if(name===RTR_NEW_NAME && aliasMatches.length===1){
      const prior=aliasMatches[0];
      targetRoles.set(name,prior);
      renames.push({id:prior.id,from:prior.name,to:name,
        memberCount:memberCount(holderCounts,prior.id),preserveId:true,
        preserveAssignments:true,preservePermissions:true,
        channelOverwriteReferences:channels.filter(ch=>
          ch?.permissionOverwrites?.cache?.has?.(prior.id)).map(ch=>({
            id:ch.id,name:ch.name,categoryId:ch.parentId??null
          }))});
      continue;
    }
    creates.push({name,permissions:"0",color:"Discord default",
      hoist:false,mentionable:false,reason:"Missing revised RTR rank/qualification"});
  }
  if(aliasMatches.length && tankMatches.length)
    warnings.push("Both Armoured Vehicle Specialist and Tank Sergeant already exist. Old role is PRESERVED; no automatic merging, deleting or member reassignment.");
  if(!holderCounts.complete){
    warnings.push("Discord member enumeration was not verified. Holder counts are UNKNOWN, not zero.");
    if(renames.length)
      issues.push("Cannot confirm how many members hold Armoured Vehicle Specialist. Enable Discord Server Members Intent or supply a verified member export before renaming that role.");
  }
  // Never modify or reposition other bot, integration or Administrator roles.
  for(const [name,r] of targetRoles){
    if(isManaged(r)||r.id===guild.id||r.id===botRole?.id)
      issues.push("Protected/managed role cannot be repurposed or sorted: "+name);
    if(r.permissions?.has?.(P.Administrator))
      issues.push("Existing RTR role '"+name+"' has Administrator. Manual review required before rearranging a privileged role.");
    if(["Tank Gunner","Tank Driver"].includes(name) &&
      [P.ManageRoles,P.ManageGuild,P.KickMembers,P.BanMembers].some(flag=>r.permissions?.has?.(flag)))
      issues.push(name+" currently has elevated guild management rights. Qualifications must not grant command authority; review this existing role manually before proceeding.");
    if(botRole?.position!=null && r.position>=botRole.position)
      issues.push("TARC Assistant must be above the EXISTING RTR role '"+name+"' before sorting.");
  }
  const order=resolveRtrRoleOrder(roles);
  const current=order.map(name=>({
    name,id:targetRoles.get(name)?.id??null,
    currentPosition:targetRoles.get(name)?.position??null,
    group:RTR_ROLE_GROUPS.find(g=>g.roles.includes(name))?.kind
  }));
  const ranksInOrder=current.filter(x=>x.currentPosition!=null);
  const needsReorder=creates.length>0||renames.length>0||
    ranksInOrder.some((r,i)=>i>0&&r.currentPosition>=ranksInOrder[i-1].currentPosition);
  const touched=new Set([...targetRoles.values()].map(r=>r.id));
  const unmapped=roles.filter(r=>r.id!==guild.id&&!isManaged(r) &&
    r.name!==RTR_ROLE_LOCK&&!touched.has(r.id));
  // Peer roles share the same PERMISSIONS MODEL (preserved existing, 0 for
  // new), not a promotion rank. Explicitly keep their existing position order.
  warnings.push("Tank Driver and Tank Gunner are equal-status qualifications, not sequential promotions; Discord displays them adjacent but neither receives additional guild privileges.");
  warnings.push("Training Instructor and Recruiting Staff are functional roles; their order is not treated as a promotion rule.");
  warnings.push("All original channels/categories, permission overwrites, messages, integrations, bots and member role assignments remain untouched.");
  return {ok:issues.length===0,guildId:guild.id,guildName:guild.name,
    code:"RTR",lock:RTR_ROLE_LOCK,issues:[...new Set(issues)],warnings:[...new Set(warnings)],
    rolesToCreate:creates,rolesToRename:renames,rolesReused:reuses,
    roleOrderTopToBottom:order,roleOrderDetails:current,needsReorder,
    roleHolderCountStatus:holderCounts.complete?"verified":"unavailable",
    unmappedRolesPreserved:unmapped.map(r=>({
      id:r.id,name:r.name,memberCount:memberCount(holderCounts,r.id),
      permissions:permissionBits(r)
    })),
    actions:{create:creates.length,rename:renames.length,
      reorder:needsReorder,delete:0,retire:0,permissionEdits:0,
      channelEdits:0,memberRoleEdits:0},
    roleSnapshot:roles.filter(r=>r.id!==guild.id).map(r=>({
      id:r.id,name:r.name,position:r.position,rawPosition:r.rawPosition??null,
      permissions:permissionBits(r),color:r.hexColor??r.color??null,
      managed:isManaged(r),holderCount:memberCount(holderCounts,r.id)
    })).sort((a,b)=>a.id.localeCompare(b.id)),
    botHighestRole:{id:botRole?.id??null,name:botRole?.name??null,position:botRole?.position??null}
  };
}
export async function liveRtrRoleSnapshot(guild) {
  const [roles,bot,channels]=await Promise.all([
    guild.roles.fetch(),guild.members.fetchMe(),guild.channels.fetch()
  ]);
  let counts={complete:false,byRole:{},fetchedMembers:null,expectedMembers:guild.memberCount??null};
  try {
    const members=await guild.members.fetch();
    const all=asArray(members);
    const size=guild.memberCount??null;
    const complete=Number.isInteger(size)&&all.length>=size;
    const byRole={};
    if(complete){
      for(const member of all){
        const memberRoles=asArray(member.roles?.cache);
        for(const role of memberRoles)byRole[role.id]=(byRole[role.id]||0)+1;
      }
    }
    counts={complete,byRole,fetchedMembers:all.length,expectedMembers:size};
  }catch(err){
    counts={...counts,warning:"Member enumeration denied (code "+errorCode(err)+")."};
  }
  const plan=inspectRtrRoles(guild,roles,bot,counts,channels);
  plan.memberEnumeration={complete:counts.complete,fetched:counts.fetchedMembers,
    expected:counts.expectedMembers,warning:counts.warning??null};
  return plan;
}
export async function performRtrRoleRework(guild,expectedPlanHash,hashPlan,onProgress=async()=>{}) {
  const before=await liveRtrRoleSnapshot(guild);
  if(!before.ok)throw Error("RTR preflight blocked all changes: "+before.issues.join(" | "));
  if(hashPlan(before)!==expectedPlanHash)
    throw Error("RTR guild roles changed since preview. Run /bsa-rtr-rework again. No edits applied.");
  const output={guildId:guild.id,code:"RTR",created:[],renamed:[],reordered:false,
    errors:[],warnings:before.warnings,permissionsChanged:0,channelChanges:0,
    membersChanged:0,rolesDeleted:0,roleIdsPreserved:true,preflight:before.actions};
  const reason="Owner-confirmed BSA RTR role-only rework; channel/member data preserved";
  const fail=(label,e)=>{
    output.errors.push(label+" (code "+errorCode(e)+").");return false;
  };
  // First rename existing mapped rank role, without losing ID/holders/overwrites.
  for(const roleSpec of before.rolesToRename){
    const roles=asArray(await guild.roles.fetch());
    const role=roles.find(r=>r.id===roleSpec.id&&r.name===roleSpec.from);
    if(!role){output.errors.push("Rename target changed since preview: "+roleSpec.from);return output;}
    try{
      await role.edit({name:roleSpec.to,reason});
      output.renamed.push({id:role.id,from:roleSpec.from,to:roleSpec.to,
        affectedMembers:roleSpec.memberCount});
    }catch(e){fail("Cannot rename "+roleSpec.from,e);return output;}
  }
  for(const create of before.rolesToCreate){
    const roles=asArray(await guild.roles.fetch());
    if(roles.some(r=>r.name===create.name)){
      output.errors.push("Name collision during RTR role creation: "+create.name);return output;
    }
    try{
      const created=await guild.roles.create({
        name:create.name,permissions:0n,hoist:false,mentionable:false,reason
      });
      output.created.push({id:created.id,name:create.name,permissions:"0"});
    }catch(e){fail("Cannot create "+create.name,e);return output;}
  }
  await onProgress("RTR roles created/renamed, checking positions.");
  const afterCreation=await liveRtrRoleSnapshot(guild);
  if(!afterCreation.ok){
    output.errors.push("Post-create RTR hierarchy preflight blocked: "+
      afterCreation.issues.join(" | "));return output;
  }
  // Discord role positions can be tied on rawPosition. Use computed display
  // order and native RoleManager#setPosition to order high -> low. This
  // changes only role position, never role identity or member assignment.
  if(afterCreation.needsReorder){
    if(typeof guild.roles.setPosition!=="function"){
      output.errors.push("Discord RoleManager.setPosition unavailable; hierarchy not changed.");
      return output;
    }
    for(const name of afterCreation.roleOrderTopToBottom){
      // Refresh only roles for each move; do not fetch every guild member
      // and channel nineteen times while reordering ranks.
      const roles=asArray(await guild.roles.fetch());
      const matching=roles.filter(r=>r.name===name);
      if(matching.length!==1){
        output.errors.push("Role became ambiguous during sorting: "+name);return output;
      }
      const target=matching[0];
      const botRole=roles.find(r=>r.id===afterCreation.botHighestRole.id);
      if(isManaged(target)||!botRole||target.position>=botRole.position){
        output.errors.push("Bot cannot reorder role above itself: "+name);return output;
      }
      await onProgress("Ordering RTR role "+name);
      try {await guild.roles.setPosition(target.id,1);}
      catch(e){fail("Discord refused role ordering for "+name,e);return output;}
    }
  }
  const final=await liveRtrRoleSnapshot(guild);
  const actual=final.roleOrderDetails;
  const verified=actual.every((r,i)=>r.id&&r.currentPosition!=null&&
    (i===0||actual[i-1].currentPosition>r.currentPosition));
  output.reordered=verified;
  output.orderFinal=actual;
  output.roleHoldersFinal=final.rolesReused.map(r=>({id:r.id,name:r.name,
    members:r.memberCount}));
  if(!verified)output.errors.push("Discord role display hierarchy still inverted; use result JSON to troubleshoot.");
  return output;
}
