import {test} from "node:test";
import assert from "node:assert/strict";
import {ChannelType,PermissionFlagsBits as P,OverwriteType} from "discord.js";
import {
 UKSF_GUILD_ID,UKSF_RTR_EXCLUDED,UKSF_CATEGORIES,UKSF_PROTECTED_ROLES,
 UKSF_KEPT_RANK_IDS,UKSF_RENAME_CANDIDATES,UKSF_LEGACY_RETIRE,
 UKSF_RANKS_TOP,UKSF_BRANCHES,validateUksfSource
} from "./uksfVerifiedLayout.js";
import {
 inspectUksfOverhaul,snapshotUksfLive,executeUksfOverhaul,
 expectedUksfOverwrites,simulateUksfAccess,syncUksfBranchTag
} from "./uksfOverhaulCore.js";
import {
 handleUksfReworkInteraction,hashUksfPlan,uksfCredentials,
 registerUksfReworkGuildCommand,getUksfReworkCommand
} from "./uksfOverhaulCommand.js";
import {handleRegimentalInteraction} from "./regimentalCommands.js";

const OWNER="999999999999999999",MAIN_BSA="777777777777777777",TARC="111111111111111111";
const env=()=>({BSA_OWNER_DISCORD_ID:OWNER,BSA_GUILD_ID:MAIN_BSA,TARC_MAIN_GUILD_ID:TARC});
const base=x=>BigInt(x?.bitfield??x??0n);
let counter=600000000000000000n;
function fixture({guildId=UKSF_GUILD_ID,memberCount=4}={}){
 const roles=new Map(),channels=new Map(),members=new Map();
 const counts={createRole:0,renameRole:0,editPermissions:0,setPosition:0,
   channels:0,categories:0,memberAdd:0,memberRemove:0,delete:0};
 const id=()=>String(++counter);
 const mkRole=(name,idValue=null,position=null,perms=0n,managed=false)=>{
  const r={id:idValue??id(),name,position:position??(1+roles.size),rawPosition:1,
   managed,hexColor:"#112233",hoist:false,mentionable:false,
   permissions:{bitfield:BigInt(perms),has:x=>(BigInt(perms)&BigInt(x))===BigInt(x)},
   edit:async function(change){
    if(change.name!==undefined){counts.renameRole++;this.name=change.name;}
    if(change.permissions!==undefined){
     counts.editPermissions++;
     const b=BigInt(change.permissions);
     this.permissions={bitfield:b,has:x=>(b&BigInt(x))===BigInt(x)};
    }
    return this;
   }};
  roles.set(r.id,r);
  return r;
 };
 const guild={id:guildId,ownerId:OWNER,name:"BSA United Kingdom Special Forces",
  memberCount,roles:{cache:roles},channels:{cache:channels},members:{},
  fetch:async()=>guild};
 roles.set(guildId,{id:guildId,name:"@everyone",position:0,rawPosition:0,managed:false,
  permissions:{bitfield:0n,has:()=>false}});
 const bot=mkRole("TARC Assistant",UKSF_PROTECTED_ROLES["TARC Assistant"],500,P.Administrator,true);
 for(const [name,roleId] of Object.entries(UKSF_PROTECTED_ROLES)){
  if(name==="TARC Assistant")continue;
  mkRole(name,roleId,null,0n,name==="BSA Builder | UKSF"?false:false);
 }
 for(const [name,roleId] of Object.entries(UKSF_KEPT_RANK_IDS))
  mkRole(name,roleId,null,0n);
 for(const old of UKSF_RENAME_CANDIDATES)
  mkRole(old.from,old.id,null,0n);
 for(const [name,roleId] of Object.entries(UKSF_LEGACY_RETIRE))
  mkRole(name,roleId,null,0n);
 // The source's 28 role IDs include bot and builder; no invented ranks here.
 const allRoles=[...roles.values()];
 assert.equal(allRoles.length,28);
 // Model permissions/admin on bot (not the ranks).
 guild.members.fetchMe=async()=>({permissions:{has:x=>x===P.ManageRoles||x===P.ManageChannels
   ||x===P.Administrator},roles:{highest:bot}});
 guild.roles.fetch=async()=>roles;
 guild.roles.create=async props=>{
  counts.createRole++;
  assert.equal(props.permissions,0n);
  return mkRole(props.name,null,1,0n);
 };
 guild.roles.setPosition=async(roleId,p)=>{
  counts.setPosition++;
  assert.equal(p,1);
  const role=roles.get(String(roleId));
  if(!role||role.managed||role.position>=bot.position)
   throw Object.assign(new Error("missing permissions"),{code:50013});
  const inOrder=[...roles.values()].filter(r=>r.id!==guildId&&r.id!==bot.id)
    .sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id));
  const next=[role,...inOrder.filter(r=>r.id!==role.id)];
  next.forEach((r,i)=>r.position=i+1);
  bot.position=500;
  return role;
 };
 const mkChannel=(name,idValue,type,parentId=null)=>{
  const cache=new Map([
   [guildId,{id:guildId,type:OverwriteType.Role,
    allow:{bitfield:P.ViewChannel},deny:{bitfield:0n}}],
   [UKSF_PROTECTED_ROLES["Regimental Oversight"],{
    id:UKSF_PROTECTED_ROLES["Regimental Oversight"],type:OverwriteType.Role,
    allow:{bitfield:0n},deny:{bitfield:0n}}]
  ]);
  const c={id:idValue,name,type,parentId,permissionOverwrites:{cache,
    set:async function(rows){
     if(type===ChannelType.GuildCategory)counts.categories++;
     else counts.channels++;
     this.cache=new Map(rows.map(row=>[String(row.id),{
      id:String(row.id),type:row.type??OverwriteType.Role,
      allow:{bitfield:base(row.allow)},deny:{bitfield:base(row.deny)}
     }]));
     return c;
    }}};
  channels.set(c.id,c);return c;
 };
 for(const cat of UKSF_CATEGORIES){
  mkChannel(cat.name,cat.id,ChannelType.GuildCategory,null);
  for(const [chanId,name] of cat.channels)
   mkChannel(name,chanId,name.includes(" VC")?ChannelType.GuildVoice:ChannelType.GuildText,cat.id);
 }
 guild.channels.fetch=async idValue=>idValue?channels.get(idValue)??null:channels;
 guild.members.fetch=async()=>members;
 const addMember=(memberId,roleNames)=>{
  const roleCache=new Map(roleNames.map(name=>{
   const role=[...roles.values()].find(r=>r.name===name);
   assert.ok(role,name);
   return [role.id,role];
  }));
  const m={id:memberId,guild,roles:{cache:roleCache,
   add:async function(roleId){
    const found=roles.get(String(roleId));
    if(!found)throw Error("No role "+roleId);
    this.cache.set(found.id,found);counts.memberAdd++;return m;
   },
   remove:async()=>{counts.memberRemove++;throw Error("Unexpected removal");}}};
  members.set(m.id,m);return m;
 };
 addMember("100",["Novice Operator","UKSF | Personnel"]);
 addMember("101",["Operator","UKSF | Personnel"]);
 addMember("102",["Instructor","UKSF | Personnel"]);
 addMember("103",["Special Training Course"]);
 const snapshotChannelNames=()=>[...channels.values()].map(c=>[c.id,c.name,c.parentId,c.type]);
 return {guild,roles,channels,members,counts,mkRole,addMember,bot,snapshotChannelNames};
}
function interaction(f,name="bsa-uksf-rework",uid=OWNER){
 const events=[];let deferred=false;
 return {guild:f.guild,guildId:f.guild.id,user:{id:uid},commandName:name,
  isChatInputCommand:()=>true,isButton:()=>false,inGuild:()=>true,
  get deferred(){return deferred},get replied(){return false},
  deferReply:async p=>{deferred=true;events.push(["defer",p]);},
  editReply:async p=>events.push(["edit",p]),
  reply:async p=>events.push(["reply",p]),events,
  options:{getString:()=>name==="bsa-generate"?"UKSF":null}
 };
}
function button(f,customId){
 const events=[];let deferred=false;
 return {guild:f.guild,guildId:f.guild.id,user:{id:OWNER},customId,
  isChatInputCommand:()=>false,isButton:()=>true,inGuild:()=>true,
  get deferred(){return deferred},get replied(){return false},
  deferUpdate:async()=>{deferred=true;events.push(["deferUpdate"]);},
  update:async p=>events.push(["update",p]),
  editReply:async p=>events.push(["edit",p]),
  reply:async p=>events.push(["reply",p]),events};
}
const last=i=>i.events.filter(([x])=>x==="edit"||x==="reply"||x==="update").at(-1)?.[1];

test("verified UKSF file has exactly 14 category IDs, 54 channel IDs, and 12 simplified ranks",()=>{
 assert.equal(validateUksfSource(),true);
 assert.equal(UKSF_CATEGORIES.length,14);
 assert.equal(UKSF_CATEGORIES.flatMap(x=>x.channels).length,54);
 assert.equal(UKSF_RANKS_TOP.length,12);
 assert.deepEqual(UKSF_RANKS_TOP.slice(-4),[
  "SAS | Special Air Service","SRR | Special Reconnaissance Regiment",
  "Operator","Special Training Course"]);
 assert.equal(UKSF_GUILD_ID,"1573839214553075823");
 assert.equal(UKSF_RTR_EXCLUDED,"1573839470359482431");
});
test("UKSF preview preserves populated Novice Operator; safely renames empty Operator II",async()=>{
 const f=fixture();
 const p=await snapshotUksfLive(f.guild);
 assert.equal(p.ok,true,JSON.stringify(p.issues));
 assert.equal(p.holderVerification.complete,true);
 assert.ok(p.roleCreates.some(r=>r.name==="SAS | Special Air Service"));
 assert.ok(p.roleRenames.some(r=>r.from==="Operator II"&&r.to==="SRR | Special Reconnaissance Regiment"));
 assert.ok(!p.roleRenames.some(r=>r.from==="Novice Operator"));
 assert.ok(p.preservedLegacy.some(r=>r.name==="Novice Operator"&&r.holders===1));
 assert.ok(p.preservedLegacy.some(r=>r.name==="Instructor"&&r.holders===1));
 assert.equal(p.memberTags.length,0);
 assert.equal(p.memberTagConflicts.length,0);
 assert.equal(p.summary.newTags,2);
 assert.equal(p.summary.newChannels,0);
 assert.equal(p.categoryPlans.length,14);
 assert.equal(p.channelPlans.length,54);
 assert.equal(p.channelPlans.some(r=>r.action==="update"),true);
 assert.equal(f.counts.createRole,0);
 assert.equal(f.counts.channels,0);
});
test("private access tiers block guests and branch tags do not impersonate an operator",()=>{
 assert.deepEqual(simulateUksfAccess("command",[]),{view:false,send:false});
 assert.deepEqual(simulateUksfAccess("trainee",["Special Training Course"]),{view:true,send:true});
 assert.deepEqual(simulateUksfAccess("operations",["Operator"]),{view:true,send:true});
 assert.deepEqual(simulateUksfAccess("operations",["SAS | Special Air Service"]),{view:true,send:true});
 assert.deepEqual(simulateUksfAccess("operations",["SRR | Special Reconnaissance Regiment"]),{view:true,send:true});
 assert.deepEqual(simulateUksfAccess("operations",UKSF_BRANCHES),{view:false,send:false});
 assert.equal(simulateUksfAccess("command",["Regimental Sergeant Major"]).view,false);
 assert.equal(simulateUksfAccess("command",["Executive Officer"]).view,true);
});
test("UKSF command preview/confirm edits ONLY verified guild roles and overwrites, preserving members and channel IDs",async()=>{
 const f=fixture(),oldNames=f.snapshotChannelNames();
 const membersBefore=[...f.members.values()].map(m=>[m.id,[...m.roles.cache.keys()]]);
 const i=interaction(f);
 assert.equal(await handleUksfReworkInteraction(i,env()),true);
 const first=last(i);
 assert.match(first.content,/UKSF VERIFIED OVERHAUL/);
 assert.equal(first.components.length,1);
 assert.equal(f.counts.channels,0);
 const customId=first.components[0].toJSON().components[0].custom_id;
 const confirmed=button(f,customId);
 assert.equal(await handleUksfReworkInteraction(confirmed,env()),true);
 const response=last(confirmed);
 assert.match(response.content,/OVERHAUL COMPLETE/);
 assert.match(response.content,/Hierarchy verified: YES/);
 assert.deepEqual(f.snapshotChannelNames(),oldNames);
 assert.equal(f.counts.delete,0);
 assert.equal(f.counts.memberRemove,0);
 assert.equal(f.counts.memberAdd,0);
 assert.equal(f.members.get("100").roles.cache.has(
  [...f.roles.values()].find(r=>r.name==="Novice Operator").id),true);
 assert.ok([...f.roles.values()].some(r=>r.name==="Branch | SAS"));
 assert.ok([...f.roles.values()].some(r=>r.name==="Branch | SRR"));
 assert.ok([...f.roles.values()].some(r=>r.name==="SAS | Special Air Service"));
 assert.ok([...f.roles.values()].some(r=>r.name==="SRR | Special Reconnaissance Regiment"));
 assert.equal([...f.roles.values()].find(r=>r.name==="SRR | Special Reconnaissance Regiment").id,
  UKSF_RENAME_CANDIDATES.find(x=>x.from==="Operator II").id);
 for(const r of f.roles.values())if(UKSF_BRANCHES.includes(r.name))
  assert.equal(r.permissions.bitfield,0n);
 const order=UKSF_RANKS_TOP.map(name=>[...f.roles.values()].find(r=>r.name===name)?.position);
 assert.ok(order.every((pos,i)=>i===0||order[i-1]>pos));
 const totals={...f.counts};
 const second=interaction(f);
 await handleUksfReworkInteraction(second,env());
 const plan=last(second);
 assert.match(plan.content,/0 new ranks, 0 safe legacy ID renames, 0 zero-privilege branch tags/);
 const newToken=plan.components[0].toJSON().components[0].custom_id;
 await handleUksfReworkInteraction(button(f,newToken),env());
 assert.deepEqual(f.counts,totals,"Second run should not make writes");
 assert.deepEqual([...f.members.values()].map(m=>[m.id,[...m.roles.cache.keys()]]),membersBefore);
});
test("different guild ID, invalid source layout, and incomplete member enumeration block all writes",async()=>{
 const f=fixture(),wrong=fixture({guildId:"666666666666666666"});
 const interactionWrong=interaction(wrong);
 await handleUksfReworkInteraction(interactionWrong,env());
 assert.match(last(interactionWrong).content,/ONLY works in verified server/);
 assert.equal(wrong.counts.createRole,0);
 const source=f.channels.get(UKSF_CATEGORIES[0].channels[0][0]);
 source.parentId="not-original-parent";
 const p=await snapshotUksfLive(f.guild);
 assert.equal(p.ok,false);
 assert.ok(p.issues.some(x=>x.includes("Verified channel missing/moved")));
 source.parentId=UKSF_CATEGORIES[0].id;
 f.guild.memberCount=10; // Member list only has four
 const counts=await snapshotUksfLive(f.guild);
 assert.equal(counts.ok,false);
 assert.ok(counts.issues.some(x=>x.includes("Complete member/role assignment")));
});
test("live branch tag sync adds verified rank tag, never swaps or removes a rank on promotion",async()=>{
 const f=fixture();
 const sas=f.mkRole("SAS | Special Air Service",null,12,0n);
 const sasTag=f.mkRole("Branch | SAS",null,11,0n);
 const srrTag=f.mkRole("Branch | SRR",null,10,0n);
 const member=f.members.get("101");
 const old={roles:{cache:new Map(member.roles.cache)}};
 member.roles.cache.set(sas.id,sas);
 const result=await syncUksfBranchTag(old,member);
 assert.equal(result.changed,true);
 assert.equal(member.roles.cache.has(sasTag.id),true);
 assert.equal(member.roles.cache.has(srrTag.id),false);
 const again=await syncUksfBranchTag(old,member);
 assert.equal(again.changed,false);
 const before=[...member.roles.cache.keys()];
 member.roles.cache.delete(sas.id); // Simulate a subsequent leadership promotion
 assert.equal((await syncUksfBranchTag({roles:{cache:new Map()}},member)).changed,false);
 assert.equal(member.roles.cache.has(sasTag.id),true);
 assert.equal(before.includes(sasTag.id),true);
});
test("old /bsa-generate UKSF is disabled specifically in the verified guild",async()=>{
 const f=fixture(),generic=interaction(f,"bsa-generate");
 await handleRegimentalInteraction(generic,env());
 assert.match(last(generic).content,/uses \/bsa-uksf-rework/);
 assert.equal(f.counts.createRole,0);
});
test("exact UKSF guild registration is an upsert, never bulk-overwriting guild slash commands",async()=>{
 const f=fixture(),existing=[],calls=[];
 const rest={
  post:async(route,{body})=>{calls.push({verb:"post",route,body});existing.push(body);return body;},
  get:async route=>{calls.push({verb:"get",route});return existing;}
 };
 const okay=await registerUksfReworkGuildCommand(rest,"444444444444444444",f.guild,env());
 assert.equal(okay.registered,true);
 assert.equal(calls.filter(x=>x.verb==="post").length,1);
 assert.equal(getUksfReworkCommand().name,"bsa-uksf-rework");
 const wrong=fixture({guildId:"666666666666666666"});
 const denied=await registerUksfReworkGuildCommand(rest,"444444444444444444",wrong.guild,env());
 assert.equal(denied.registered,false);
 assert.equal(calls.filter(x=>x.verb==="post").length,1);
});
