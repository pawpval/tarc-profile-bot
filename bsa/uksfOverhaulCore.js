import {PermissionFlagsBits as P,ChannelType,OverwriteType} from "discord.js";
import {reconcileRankOrder} from "./regimentalRoleHierarchy.js";
import {
 UKSF_GUILD_ID,UKSF_RTR_EXCLUDED,UKSF_BUILDER_ID,UKSF_BOT_ROLE_ID,
 UKSF_PROTECTED_ROLES,UKSF_HQ,UKSF_RANKS_TOP,UKSF_BRANCHES,
 UKSF_KEPT_RANK_IDS,UKSF_RENAME_CANDIDATES,UKSF_LEGACY_RETIRE,UKSF_CATEGORIES
} from "./uksfVerifiedLayout.js";

const arr=x=>Array.isArray(x)?x.filter(Boolean):x?.values?[...x.values()].filter(Boolean):[];
const asBits=x=>BigInt(x?.bitfield??x??0);
const bits=x=>String(asBits(x));
const code=e=>String(e?.code??e?.rawError?.code??e?.status??"unknown");
const management=[P.Administrator,P.ManageGuild,P.ManageRoles,P.ManageChannels,
 P.KickMembers,P.BanMembers,P.ManageWebhooks,P.ManageEmojisAndStickers,
 P.ManageMessages,P.ManageThreads,P.ModerateMembers,P.ManageEvents,
 P.ManageNicknames,P.MentionEveryone];
const managementMask=management.reduce((a,b)=>a|b,0n);
const safeRank=n=>!["Executive Officer","Commanding Officer"].includes(n);
const managed=r=>Boolean(r?.managed||r?.tags?.botId||r?.tags?.integrationId);
const categoryMap=new Map(UKSF_CATEGORIES.map(c=>[c.id,c]));
const allChannelIds=new Set(UKSF_CATEGORIES.flatMap(c=>c.channels.map(ch=>ch[0])));
const baseAuthorized={
 // Public information remains readable by everyone, while designated
 // recruitment/command staff may publish announcements and rules.
 public:["Recruitment Officer","Operations Officer","Senior Operations Officer",
  "Regimental Sergeant Major","Head of Operations","Executive Officer",
  "Commanding Officer",...UKSF_HQ],
 general:["UKSF | Personnel",...UKSF_RANKS_TOP,...UKSF_HQ],
 trainee:["Special Training Course","Recruitment Officer","Operations Sergeant",
   "Operations Officer","Senior Operations Officer","Regimental Sergeant Major",
   "Head of Operations","Executive Officer","Commanding Officer",...UKSF_HQ],
 operations:["Operator","SAS | Special Air Service","SRR | Special Reconnaissance Regiment",
   "Operations Sergeant","Operations Officer","Senior Operations Officer",
   "Regimental Sergeant Major","Head of Operations","Executive Officer","Commanding Officer",...UKSF_HQ],
 recruitment:["Recruitment Officer","Operations Sergeant","Operations Officer",
   "Senior Operations Officer","Regimental Sergeant Major","Head of Operations",
   "Executive Officer","Commanding Officer",...UKSF_HQ],
 staff:["Operations Officer","Senior Operations Officer","Regimental Sergeant Major",
   "Head of Operations","Executive Officer","Commanding Officer",...UKSF_HQ],
 command:["Head of Operations","Executive Officer","Commanding Officer",...UKSF_HQ]
};
const writableStaff=new Set(["Recruitment Officer","Operations Officer",
 "Senior Operations Officer","Regimental Sergeant Major","Head of Operations",
 "Executive Officer","Commanding Officer",...UKSF_HQ]);
const knownRanks=new Set([...Object.keys(UKSF_KEPT_RANK_IDS),
  ...UKSF_RENAME_CANDIDATES.map(x=>x.from),...Object.keys(UKSF_LEGACY_RETIRE),
  ...UKSF_RANKS_TOP,...UKSF_BRANCHES]);
const controlledIds=new Set([
 ...Object.values(UKSF_KEPT_RANK_IDS),...UKSF_RENAME_CANDIDATES.map(x=>x.id),
 ...Object.values(UKSF_LEGACY_RETIRE),
 UKSF_PROTECTED_ROLES.Guest,UKSF_PROTECTED_ROLES["UKSF | Personnel"]
]);
const permissionFields=["ViewChannel","ReadMessageHistory","SendMessages","Connect",
 "Speak","SendMessagesInThreads"];
const toFlags=(grant,deny=[])=>({
 allow:grant.reduce((v,k)=>v|P[k],0n),
 deny:deny.reduce((v,k)=>v|P[k],0n)
});
const roleRow=(id,grant,deny=[])=>({id:String(id),type:OverwriteType.Role,...toFlags(grant,deny)});
const sortedRows=rows=>rows.map(r=>({
 id:String(r.id),type:r.type??OverwriteType.Role,
 allow:bits(r.allow),deny:bits(r.deny)
})).sort((a,b)=>a.id.localeCompare(b.id)||a.type-b.type);
const sameRows=(a,b)=>JSON.stringify(sortedRows(a))===JSON.stringify(sortedRows(b));
function actualRows(channel){
 return arr(channel?.permissionOverwrites?.cache).map(x=>({
  id:String(x.id),type:x.type??OverwriteType.Role,
  allow:asBits(x.allow),deny:asBits(x.deny)
 }));
}
function liveHolderSnapshot(members,memberCount){
 const people=arr(members);
 const complete=Number.isInteger(memberCount)&&people.length>=memberCount;
 const byRole={},roleMembers={};
 if(complete)for(const member of people){
  for(const role of arr(member.roles?.cache)){
   byRole[role.id]=(byRole[role.id]||0)+1;
   (roleMembers[role.id]??=[]).push(String(member.id));
  }
 }
 return {complete,fetched:people.length,expected:memberCount??null,byRole,
  roleMembers,memberIds:complete?people.map(m=>String(m.id)).sort():[]};
}
function roleByExact(roles,name){
 const match=roles.filter(r=>r.name===name);
 return match.length===1?match[0]:null;
}
function qualifiedRoleId(x,roles){
 const existing=roleByExact(roles,x);
 return existing?.id??"NEW:"+x;
}
function targetRoleMap(plan){
 return new Map(plan.roleMappings.map(x=>[x.to,x.existingId??"NEW:"+x.to]));
}
function authorize(tier,channelName){
 const out=[...(baseAuthorized[tier]||[])];
 // RSM has a narrow, explicit role in staff/personnel oversight, not blanket
 // access to the entire confidential command category.
 if(tier==="command"&&channelName?.includes("personnel-reviews"))
  out.push("Regimental Sergeant Major");
 return [...new Set(out)];
}
export function expectedUksfOverwrites(tier,roleIds,existing,options={}){
 const everyone=UKSF_GUILD_ID;
 const publicView=tier==="public";
 const isReadonly=options.readonly===true;
 const isVoice=options.voice===true;
 const locked=["ViewChannel","SendMessages","Connect","Speak","SendMessagesInThreads"];
 const desired=[
  roleRow(everyone,publicView?["ViewChannel","ReadMessageHistory"]:[],
    publicView?["SendMessages","SendMessagesInThreads","Connect","Speak"]:locked)
 ];
 const guest=roleIds.get("Guest");
 if(guest)desired.push(roleRow(guest,publicView?["ViewChannel","ReadMessageHistory"]:[],
   publicView?["SendMessages","SendMessagesInThreads","Connect","Speak"]:locked));
 const authorized=authorize(tier,options.channelName);
 for(const name of authorized){
  const id=roleIds.get(name);
  if(!id)throw Error("Missing role to resolve UKSF permissions: "+name);
  const canWrite=!isReadonly||writableStaff.has(name);
  const grant=["ViewChannel","ReadMessageHistory",
    ...(isVoice?["Connect","Speak"]:canWrite?["SendMessages","SendMessagesInThreads"]:[])];
  const deny=[...(isReadonly&&!canWrite?["SendMessages","SendMessagesInThreads"]:[])];
  desired.push(roleRow(id,grant,deny));
 }
 const keepIds=new Set(desired.map(r=>r.id));
 const protectedExternalIds=new Set([
  UKSF_PROTECTED_ROLES["RIC | Royal Intelligence Corps"],
  UKSF_PROTECTED_ROLES["Regimental Oversight"],
  UKSF_BOT_ROLE_ID,UKSF_BUILDER_ID
 ]);
 const knownIds=new Set([...controlledIds,...roleIds.values()]
  .filter(id=>!protectedExternalIds.has(id)));
 // Explicit old local rank overwrites are replaced, but third-party bot,
 // human and RIC/oversight overrides remain in place.
 const preserved=actualRows(existing).filter(r=>
  !keepIds.has(r.id)&&!knownIds.has(r.id));
 const removed=actualRows(existing).filter(r=>
  !keepIds.has(r.id)&&knownIds.has(r.id));
 return {rows:[...desired,...preserved],preserved:sortedRows(preserved),
  revokedLocal:sortedRows(removed),authorized};
}
export function simulateUksfAccess(tier,roleNames=[],options={}){
 const roles=new Set(roleNames);
 const allowed=authorize(tier,options.channelName);
 const view=tier==="public"||allowed.some(n=>roles.has(n));
 const send=view&&(!options.readonly||allowed.some(n=>roles.has(n)&&writableStaff.has(n)));
 return {view,send};
}
function rolePermissionPlan(role,name){
 const old=asBits(role?.permissions);
 if(UKSF_BRANCHES.includes(name))return 0n;
 if(safeRank(name))return old&~managementMask;
 // Leadership: keep approved existing rights but never add Administrator.
 return old;
}
function sourceMatch(guild,roles,channels,bot,holders){
 const issues=[];
 if(guild.id!==UKSF_GUILD_ID || guild.id===UKSF_RTR_EXCLUDED)
  issues.push("UKSF verified guild ID mismatch. Nothing will be changed.");
 if(!holders.complete)issues.push("Complete member/role assignment data is unavailable. Role reuse and branch identity cannot be verified.");
 if(!bot?.permissions?.has?.(P.ManageRoles))
  issues.push("TARC Assistant requires Manage Roles to update the UKSF roles.");
 if(!bot?.permissions?.has?.(P.ManageChannels))
  issues.push("TARC Assistant requires Manage Channels to apply UKSF channel overwrites.");
 const highest=bot?.roles?.highest;
 if(highest?.id!==UKSF_BOT_ROLE_ID)
  issues.push("TARC Assistant highest role ID differs from the verified scan; inspect before proceeding.");
 if(!roles.some(r=>r.id===UKSF_BUILDER_ID&&r.name==="BSA Builder | UKSF"))
  issues.push("Verified UKSF builder role ID/name mismatch.");
 for(const [name,id] of Object.entries(UKSF_PROTECTED_ROLES)){
  if(!roles.some(r=>r.id===id&&r.name===name))
   issues.push("Protected role identity mismatch: "+name+" ("+id+").");
 }
 for(const [name,id] of Object.entries(UKSF_KEPT_RANK_IDS)){
  if(!roles.some(r=>r.id===id&&r.name===name))
   issues.push("Verified UKSF original rank identity mismatch: "+name+" ("+id+").");
 }
 const byId=new Map(channels.map(c=>[c.id,c]));
 // The verified UKSF scan lists IDs, names and parent categories but DOES
 // NOT record individual channel types. A forum such as suggestions is not
 // a text channel. Accept valid text/forum or voice/stage types by the
 // verified name while always retaining the existing channel's actual type.
 // Do NOT convert or recreate channels based on an inferred source type.
 const written=[ChannelType.GuildText,ChannelType.GuildForum];
 const spoken=[ChannelType.GuildVoice,ChannelType.GuildStageVoice];
 for(const cat of UKSF_CATEGORIES){
  const actual=byId.get(cat.id);
  if(!actual||actual.name!==cat.name||actual.type!==ChannelType.GuildCategory)
   issues.push("Verified category missing/renamed: "+cat.name+" ("+cat.id+").");
  for(const [id,name] of cat.channels){
   const ch=byId.get(id);
   const allowedTypes=name.endsWith(" VC")?spoken:written;
   if(!ch||ch.name!==name||ch.parentId!==cat.id||!allowedTypes.includes(ch.type))
    issues.push("Verified channel missing/moved/renamed/unsupported type: "+name+" ("+id+").");
  }
 }
 if(holders.complete && roles.filter(r=>r.name==="Branch | SAS").length>1)
  issues.push("Multiple Branch | SAS roles exist.");
 if(holders.complete && roles.filter(r=>r.name==="Branch | SRR").length>1)
  issues.push("Multiple Branch | SRR roles exist.");
 return [...new Set(issues)];
}
export function inspectUksfOverhaul(guild,roleCollection,channelCollection,bot,
 holders={complete:false,byRole:{},roleMembers:{},memberIds:[]}){
 const roles=arr(roleCollection),channels=arr(channelCollection),issues=sourceMatch(guild,roles,channels,bot,holders);
 const map=[],roleCreates=[],roleRenames=[],rolePermissionEdits=[],preservedLegacy=[],alerts=[];
 const roleMap=new Map([...Object.entries(UKSF_PROTECTED_ROLES)]);
 const candidateByTarget=new Map(UKSF_RENAME_CANDIDATES.map(x=>[x.to,x]));
 for(const name of [...UKSF_RANKS_TOP,...UKSF_BRANCHES]){
  const target=roles.filter(r=>r.name===name);
  if(target.length>1){issues.push("Duplicate target rank/tag: "+name);continue;}
  let r=target[0]??null,action="keep",candidate=null;
  if(!r){
   candidate=candidateByTarget.get(name);
   const legacy=candidate?roles.find(x=>x.id===candidate.id):null;
   const holdersCount=legacy?(holders.byRole[legacy.id]??0):0;
   if(candidate&&legacy?.name===candidate.from &&holders.complete&&holdersCount===0&&!managed(legacy)){
    r=legacy;
    action="rename";
    roleRenames.push({id:r.id,from:r.name,to:name,holders:0,
      beforePermissions:bits(r.permissions)});
   }else{
    action="create";
    roleCreates.push({name,permissions:"0",reason:candidate?
      (legacy?.name===candidate.from?"Legacy role has existing members; preserve it":
        "Legacy candidate is unavailable or already repurposed"):"New persistent branch identity tag"});
    if(candidate&&legacy?.name===candidate.from)
     preservedLegacy.push({id:legacy.id,name:legacy.name,holders:holdersCount,
       members:holders.roleMembers[legacy.id]??[],reason:"Unverified for new rank: manual migration required"});
   }
  }
  if(r){
   if(managed(r))issues.push("Cannot repurpose or edit managed role "+name);
   if(bot?.roles?.highest?.position!=null &&r.position>=bot.roles.highest.position)
    issues.push("Bot is below existing functional rank "+name);
   const original=asBits(r.permissions);
   const desired=rolePermissionPlan(r,name);
   if(desired!==original)
    rolePermissionEdits.push({id:r.id,name,before:String(original),after:String(desired),
      removedElevatedFlags:String(original&~desired)});
  }
  map.push({to:name,action,existingId:r?.id??null,
    oldName:r?.name??null,memberCount:r?(holders.byRole[r.id]??null):0,
    permissionsAfter:r?String(rolePermissionPlan(r,name)):"0"});
  roleMap.set(name,r?.id??"NEW:"+name);
 }
 for(const [name,id] of Object.entries(UKSF_LEGACY_RETIRE)){
  const r=roles.find(r=>r.id===id);
  if(r){
   preservedLegacy.push({id,name:r.name,holders:holders.complete?(holders.byRole[id]??0):null,
    members:holders.roleMembers[id]??[],reason:"Legacy role preserved; no deletion or automatic member removal"});
  }
 }
 for(const candidate of UKSF_RENAME_CANDIDATES){
  const old=roles.find(r=>r.id===candidate.id);
  if(old?.name===candidate.from&&!preservedLegacy.some(x=>x.id===old.id) &&
    !roleRenames.some(x=>x.id===old.id))
   preservedLegacy.push({id:old.id,name:old.name,holders:holders.complete?(holders.byRole[old.id]??0):null,
    members:holders.roleMembers[old.id]??[],reason:"Legacy role not repurposed"});
 }
 const memberTags=[],memberTagConflicts=[];
 const branchRanks=new Map([
  ["SAS | Special Air Service","Branch | SAS"],
  ["SRR | Special Reconnaissance Regiment","Branch | SRR"]
 ]);
 for(const [rank,tag] of branchRanks){
  const rankId=roleMap.get(rank),tagId=roleMap.get(tag);
  if(!rankId||rankId.startsWith("NEW:"))continue;
  for(const memberId of (holders.roleMembers[rankId]??[])){
   const opposite=tag==="Branch | SAS"?"Branch | SRR":"Branch | SAS";
   const memberRoles=roles.filter(r=>(holders.roleMembers[r.id]??[]).includes(memberId)).map(r=>r.name);
   if(memberRoles.includes(opposite)||memberRoles.includes(rank==="SAS | Special Air Service"?
      "SRR | Special Reconnaissance Regiment":"SAS | Special Air Service")){
    memberTagConflicts.push({memberId,rank,reason:"Conflicting branch role/tag, requires leadership decision"});
   }else if(!memberRoles.includes(tag)){
    memberTags.push({memberId,rank,tag,tagId,
      action:"add persistent branch tag; no rank or old assignment removed"});
   }
  }
 }
 if(memberTagConflicts.length)
  alerts.push(memberTagConflicts.length+" members have conflicting branch identities and will NOT be retagged automatically.");
 if(preservedLegacy.some(x=>x.holders>0))
  alerts.push("Populated old operator/Instructor roles are preserved with their assignments. Manual mapping required; the bot will not promote people into SAS/SRR.");
 const channelPlans=[],categoryPlans=[],blockedLeaks=[];
 for(const cat of UKSF_CATEGORIES){
  const c=channels.find(ch=>ch.id===cat.id);
  if(!c)continue;
  const roleIds=new Map(roleMap);
  const mapped=expectedUksfOverwrites(cat.tier,roleIds,c);
  const before=actualRows(c);
  const changed=!sameRows(before,mapped.rows);
  categoryPlans.push({id:cat.id,name:cat.name,tier:cat.tier,action:changed?"update":"keep",
    before:sortedRows(before),after:sortedRows(mapped.rows),
    preservedExternal:mapped.preserved,revokedLegacy:mapped.revokedLocal});
  if(mapped.preserved.some(x=>((BigInt(x.allow)&P.ViewChannel)!==0n)&&cat.tier!=="public"))
   blockedLeaks.push("Existing external allow-View overwrite in "+cat.name+"; kept for integration safety. Inspect "+cat.id);
  for(const [id,name,tier=cat.tier,mode] of cat.channels){
   const ch=channels.find(c=>c.id===id);
   if(!ch)continue;
   const target=expectedUksfOverwrites(tier,roleIds,ch,{readonly:mode==="readonly",
    voice:ch.type===ChannelType.GuildVoice,channelName:name});
   const old=actualRows(ch);
   channelPlans.push({id,name,parentId:cat.id,tier,readonly:mode==="readonly",
    action:sameRows(old,target.rows)?"keep":"update",
    before:sortedRows(old),after:sortedRows(target.rows),
    preservedExternal:target.preserved,revokedLegacy:target.revokedLocal});
   if(target.preserved.some(x=>((BigInt(x.allow)&P.ViewChannel)!==0n)&&tier!=="public"))
    blockedLeaks.push("Existing external allow-View overwrite in "+name+"; kept for integration safety. Inspect "+id);
  }
 }
 const otherChannels=channels.filter(x=>x.type!==ChannelType.GuildCategory&&!allChannelIds.has(x.id))
   .map(x=>({id:x.id,name:x.name,preserved:true}));
 const otherCategories=channels.filter(x=>x.type===ChannelType.GuildCategory&&!categoryMap.has(x.id))
   .map(x=>({id:x.id,name:x.name,preserved:true}));
 if(otherChannels.length||otherCategories.length)
  alerts.push("Unscanned channels/categories are preserved; never renamed or deleted.");
 if(blockedLeaks.length)
  alerts.push("Existing external channel overwrites may grant visibility beyond the declared tiers. They are preserved and flagged for review.");
 // Access test matrix applies declared role-access policy, independent of
 // external overrides. The latter are explicitly reported above.
 const accessTests={
  guestPrivate:simulateUksfAccess("command",[]),
  trainee:simulateUksfAccess("trainee",["Special Training Course"]),
  operator:simulateUksfAccess("operations",["Operator"]),
  sas:simulateUksfAccess("operations",["SAS | Special Air Service"]),
  srr:simulateUksfAccess("operations",["SRR | Special Reconnaissance Regiment"]),
  staff:simulateUksfAccess("staff",["Operations Officer"]),
  command:simulateUksfAccess("command",["Commanding Officer"]),
  branchTagsOnly:simulateUksfAccess("operations",UKSF_BRANCHES)
 };
 if(accessTests.guestPrivate.view || !accessTests.trainee.view||!accessTests.operator.view ||
  !accessTests.sas.view||!accessTests.srr.view||!accessTests.staff.view||
  !accessTests.command.view||accessTests.branchTagsOnly.view)
  issues.push("UKSF access persona validation failed.");
 const needsOrder=roleCreates.some(x=>UKSF_RANKS_TOP.includes(x.name))||roleRenames.length>0||
  UKSF_RANKS_TOP.filter(n=>map.find(x=>x.to===n)?.existingId).some((name,i,known)=>{
   if(i===0)return false;
   const a=roles.find(r=>r.id===map.find(x=>x.to===known[i-1])?.existingId);
   const b=roles.find(r=>r.id===map.find(x=>x.to===name)?.existingId);
   return a&&b&&a.position<=b.position;
  });
 return {guildId:guild.id,ok:issues.length===0,code:"UKSF",
  issues,warnings:[...new Set(alerts)],roleMappings:map,roleCreates,roleRenames,
  rolePermissionEdits,preservedLegacy,memberTags,memberTagConflicts,
  roleOrderTopToBottom:[...UKSF_RANKS_TOP],needsOrder,
  categoryPlans,channelPlans,blockedLeaks,otherChannels,otherCategories,
  holderVerification:{complete:holders.complete,fetched:holders.fetched,expected:holders.expected},
  roleSnapshot:roles.filter(x=>x.id!==guild.id).map(x=>({
   id:x.id,name:x.name,position:x.position,permissions:bits(x.permissions),managed:managed(x),
   members:holders.complete?(holders.byRole[x.id]??0):null
  })).sort((a,b)=>a.id.localeCompare(b.id)),
  channelSnapshot:channels.filter(x=>allChannelIds.has(x.id)||categoryMap.has(x.id))
   .map(x=>({id:x.id,name:x.name,parentId:x.parentId,type:x.type,
     overwrites:sortedRows(actualRows(x))})).sort((a,b)=>a.id.localeCompare(b.id)),
  memberSnapshot:holders.complete?holders.memberIds.map(id=>({
   id,assignedRoleIds:roles.filter(r=>(holders.roleMembers[r.id]??[]).includes(id))
    .map(x=>x.id).sort()
  })):[],
  summary:{newRanks:roleCreates.filter(x=>UKSF_RANKS_TOP.includes(x.name)).length,
   newTags:roleCreates.filter(x=>UKSF_BRANCHES.includes(x.name)).length,
   renamed:roleRenames.length,permissions:rolePermissionEdits.length,
   categories:categoryPlans.filter(x=>x.action==="update").length,
   channels:channelPlans.filter(x=>x.action==="update").length,
   membersToTag:memberTags.length,memberTagConflicts:memberTagConflicts.length,
   preservedOldRoles:preservedLegacy.length,deleted:0,newChannels:0}
 };
}
export async function snapshotUksfLive(guild){
 const [roles,channels,bot]=await Promise.all([
  guild.roles.fetch(),guild.channels.fetch(),guild.members.fetchMe()]);
 let holders={complete:false,fetched:0,expected:guild.memberCount??null,byRole:{},roleMembers:{},memberIds:[]};
 try{
  const members=await guild.members.fetch();
  holders=liveHolderSnapshot(members,guild.memberCount);
 }catch(e){
  holders.error=code(e);
 }
 const plan=inspectUksfOverhaul(guild,roles,channels,bot,holders);
 plan.memberError=holders.error??null;
 return plan;
}
function overwriteObjects(rows,roleIds){
 return rows.map(r=>{
  const id=r.id.startsWith("NEW:")?roleIds.get(r.id.slice(4)):r.id;
  if(!id||id.startsWith("NEW:"))throw Error("Unresolved UKSF overwrite role "+r.id);
  return {id,type:r.type,allow:BigInt(r.allow),deny:BigInt(r.deny)};
 });
}
export async function executeUksfOverhaul(guild,expectedHash,hashPlan,onProgress=async()=>{}){
 const current=await snapshotUksfLive(guild);
 if(!current.ok)throw Error("UKSF preflight blocked: "+current.issues.join(" | "));
 if(hashPlan(current)!==expectedHash)
  throw Error("UKSF roles/member assignments/channel overwrites changed since preview. Run the preview again.");
 const report={guildId:guild.id,created:[],renamed:[],permissionsUpdated:[],
  categoriesUpdated:[],channelsUpdated:[],memberTagsAdded:[],memberTagConflicts:current.memberTagConflicts,
  hierarchy:null,errors:[],warnings:current.warnings,
  deleted:0,memberRanksRemoved:0,channelsCreated:0,channelsDeleted:0,
  roleRollback:current.roleSnapshot,overwriteRollback:current.channelSnapshot};
 const reason="Owner-confirmed verified UKSF-only role/channel access overhaul";
 const safe=async(label,fn)=>{
  try{return await fn();}
  catch(e){report.errors.push(label+": Discord error "+code(e));return null;}
 };
 // No member migrations from ambiguous legacy roles. Only zero-holder roles
 // may be renamed; none of the others are deleted.
 for(const ren of current.roleRenames){
  const old=arr(await guild.roles.fetch()).find(x=>x.id===ren.id&&x.name===ren.from);
  if(!old){report.errors.push("Role rename no longer safe: "+ren.from);return report;}
  const updated=await safe("Rename "+ren.from,()=>old.edit({name:ren.to,reason}));
  if(!updated)return report;
  report.renamed.push(ren);
 }
 for(const create of current.roleCreates){
  const roles=arr(await guild.roles.fetch());
  if(roles.some(r=>r.name===create.name)){
   report.errors.push("Role appeared during migration: "+create.name);return report;
  }
  const made=await safe("Create "+create.name,()=>guild.roles.create({
   name:create.name,permissions:0n,hoist:false,mentionable:false,reason
  }));
  if(!made)return report;
  report.created.push({name:made.name,id:made.id,permissions:"0"});
 }
 const rolesNow=arr(await guild.roles.fetch());
 const roleIds=new Map([...rolesNow.map(r=>[r.name,r.id]),["Guest",UKSF_PROTECTED_ROLES.Guest]]);
 for(const desired of [...UKSF_RANKS_TOP,...UKSF_BRANCHES,...UKSF_HQ,"UKSF | Personnel"]){
  if(!roleIds.has(desired)){
   report.errors.push("Required UKSF role not found after creation: "+desired);return report;
  }
 }
 for(const name of [...UKSF_RANKS_TOP,...UKSF_BRANCHES]){
  const r=rolesNow.find(x=>x.name===name);
  const target=rolePermissionPlan(r,name);
  if(asBits(r.permissions)===target)continue;
  const previous=bits(r.permissions);
  const changed=await safe("Update permissions for "+name,
   ()=>r.edit({permissions:target,reason}));
  if(!changed)return report;
  report.permissionsUpdated.push({id:r.id,name,from:previous,to:String(target)});
 }
 await onProgress("UKSF ranks/branch tags ready; verifying hierarchy.");
 const rankSort=await reconcileRankOrder(guild,UKSF_RANKS_TOP);
 report.hierarchy=rankSort;
 if(!rankSort.verified){
  report.errors.push(...rankSort.errors);return report;
 }
 // Branch tags have NO authority. Keep them in the bottom two positions.
 // Both orders are equivalent; once there, don't keep flipping them on reruns.
 const tagRoles=arr(await guild.roles.fetch()).filter(x=>
  UKSF_BRANCHES.includes(x.name));
 const tagPositions=tagRoles.map(x=>x.position).sort((a,b)=>a-b);
 if(tagPositions.length===2&&(tagPositions[0]!==1||tagPositions[1]!==2)){
  for(const name of UKSF_BRANCHES){
   const id=roleIds.get(name);
   if(!id)continue;
   const moved=await safe("Move non-hierarchical tag "+name,
    ()=>guild.roles.setPosition(id,1));
   if(!moved)return report;
  }
 }
 // Assign branch identity ONLY when the current member already holds a
 // verified and explicitly named SAS or SRR rank. Never reclassify a person
 // just because a legacy role was renamed or because they hold shared command.
 const byMember=new Map();
 const currentMembers=arr(await guild.members.fetch());
 for(const m of currentMembers)byMember.set(String(m.id),m);
 for(const entry of current.memberTags){
  const member=byMember.get(entry.memberId);
  const currentRoles=new Set(arr(member?.roles?.cache).map(r=>r.id));
  const branchRankId=roleIds.get(entry.rank);
  const tagId=roleIds.get(entry.tag);
  const otherId=roleIds.get(entry.tag==="Branch | SAS"?"Branch | SRR":"Branch | SAS");
  if(!member||!currentRoles.has(branchRankId)){
   report.errors.push("Branch assignment changed for "+entry.memberId+"; no further tags applied.");
   return report;
  }
  if(currentRoles.has(otherId)){
   report.memberTagConflicts.push({memberId:entry.memberId,reason:"Opposite tag already assigned"});
   continue;
  }
  if(!currentRoles.has(tagId)){
   const added=await safe("Tag verified "+entry.tag+" member",
     ()=>member.roles.add(tagId,reason));
   if(!added)return report;
   report.memberTagsAdded.push({memberId:entry.memberId,tag:entry.tag,tagId});
  }
 }
 await onProgress("UKSF hierarchy and confirmed branch tags applied; updating existing access overwrites.");
 // Only category/channel overwrite entries are edited: no channel names,
 // category positions, messages, webhooks or channel IDs are modified.
 for(const {id,name,tier} of current.categoryPlans.filter(p=>p.action==="update")){
  const c=await guild.channels.fetch(id);
  if(!c){report.errors.push("Category vanished: "+name);return report;}
  const rows=expectedUksfOverwrites(tier,roleIds,c);
  const updated=await safe("Apply category access "+name,
   ()=>c.permissionOverwrites.set(overwriteObjects(sortedRows(rows.rows),roleIds),reason));
  if(!updated)return report;
  report.categoriesUpdated.push({id,name,old:current.categoryPlans.find(x=>x.id===id).before,
   after:sortedRows(rows.rows)});
 }
 for(const item of current.channelPlans.filter(p=>p.action==="update")){
  const c=await guild.channels.fetch(item.id);
  if(!c){report.errors.push("Channel vanished: "+item.name);return report;}
  const rows=expectedUksfOverwrites(item.tier,roleIds,c,{
   readonly:item.readonly,voice:c.type===ChannelType.GuildVoice,channelName:item.name});
  const updated=await safe("Apply channel access "+item.name,
   ()=>c.permissionOverwrites.set(overwriteObjects(sortedRows(rows.rows),roleIds),reason));
  if(!updated)return report;
  report.channelsUpdated.push({id:item.id,name:item.name,
    before:item.before,after:sortedRows(rows.rows)});
 }
 report.completed=report.errors.length===0;
 report.accessTests={
  guest:simulateUksfAccess("command",[]),
  trainee:simulateUksfAccess("trainee",["Special Training Course"]),
  operator:simulateUksfAccess("operations",["Operator"]),
  sas:simulateUksfAccess("operations",["SAS | Special Air Service"]),
  srr:simulateUksfAccess("operations",["SRR | Special Reconnaissance Regiment"]),
  rsm:simulateUksfAccess("staff",["Regimental Sergeant Major"]),
  leadership:simulateUksfAccess("command",["Commanding Officer"]),
  branchTagsOnly:simulateUksfAccess("operations",UKSF_BRANCHES)
 };
 return report;
}
// Event hook: when leadership manually assigns a validated SAS/SRR rank,
// add ONLY its persistent branch tag. Never remove branch identities on
// promotion, automatically grant a rank, or invent a user's branch.
export async function syncUksfBranchTag(oldMember,newMember){
 if(newMember?.guild?.id!==UKSF_GUILD_ID)return {handled:false};
 const names=new Set(arr(newMember.roles?.cache).map(x=>x.name));
 const sas=names.has("SAS | Special Air Service"),srr=names.has("SRR | Special Reconnaissance Regiment");
 if(!sas&&!srr)return {handled:true,changed:false};
 const branch=sas&&!srr?"SAS":srr&&!sas?"SRR":null;
 if(!branch)return {handled:true,changed:false,conflict:"Both branch ranks held"};
 const ownName="Branch | "+branch,otherName="Branch | "+(branch==="SAS"?"SRR":"SAS");
 if(names.has(otherName))return {handled:true,changed:false,conflict:"Opposite branch tag held"};
 if(names.has(ownName))return {handled:true,changed:false};
 const target=arr(newMember.guild.roles.cache).filter(x=>x.name===ownName);
 if(target.length!==1||asBits(target[0].permissions)!==0n)
  return {handled:true,changed:false,conflict:"Tag missing/privileged/ambiguous"};
 // Only respond when this specific branch rank is newly assigned.
 const oldNames=new Set(arr(oldMember?.roles?.cache).map(x=>x.name));
 if(oldNames.has("SAS | Special Air Service")===sas&&
    oldNames.has("SRR | Special Reconnaissance Regiment")===srr)
  return {handled:true,changed:false};
 const bot=await newMember.guild.members.fetchMe();
 if(!bot.permissions?.has?.(P.ManageRoles) ||
    target[0].position>=bot.roles?.highest?.position)
  return {handled:true,changed:false,conflict:"Bot cannot assign branch tag"};
 await newMember.roles.add(target[0].id,"UKSF confirmed branch rank: persistent identity tag");
 return {handled:true,changed:true,tag:ownName};
}
