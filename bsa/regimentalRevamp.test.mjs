import {test} from "node:test";
import assert from "node:assert/strict";
import {ChannelType,PermissionFlagsBits as P,OverwriteType} from "discord.js";
import {getRevisedPresets,validateRevised,REVISED_CODES} from "./regimentalRevampTemplates.js";
import {expectedAccess,simulateChannelAccess,testAccessMatrix} from "./regimentalRevampAccess.js";
import {previewRevisedGuild,revampRegimentalGuild,auditRevisedGuild} from "./regimentalRevampEngine.js";
import {getRegimentalPresets} from "./regimentalTemplates.js";
import {handleRegimentalInteraction} from "./regimentalCommands.js";

const OWNER="999999999999999999",TARGET="666666666666666666",TARC="123456789012345678";
const env={BSA_OWNER_DISCORD_ID:OWNER,BSA_GUILD_ID:"777777777777777777",TARC_MAIN_GUILD_ID:TARC};
function makeGuild(){
  const roles=new Map(),channels=new Map(),members=new Map();
  let seq=300000000000000000n;
  const id=()=>String(++seq);
  const counts={roleCreate:0,roleEdit:0,roleReorder:0,categoryCreate:0,channelCreate:0,
    channelEdit:0,categoryEdit:0,delete:0};
  function role(name,color="#000000",perms=0n,managed=false,position=null){
    // Assign unique rank positions; imported roles may pass explicit values.
    if(position===null)position=1+Math.max(0,...[...roles.values()]
      .filter(r=>!r.managed&&r.id!==TARGET).map(r=>r.position));
    const r={id:id(),name,color:parseInt(color.slice(1),16),hexColor:color,
      hoist:false,mentionable:false,managed,position,
      permissions:{bitfield:BigInt(perms),has:x=>(BigInt(perms)&BigInt(x))===BigInt(x)},
      edit:async function(opts){
        counts.roleEdit++;if(opts.color!==undefined){this.hexColor=opts.color.toUpperCase();this.color=parseInt(opts.color.slice(1),16);}
        if(opts.permissions!==undefined){
          const value=BigInt(opts.permissions);
          this.permissions={bitfield:value,has:x=>(value&BigInt(x))===BigInt(x)};
        }
        if(opts.hoist!==undefined)this.hoist=opts.hoist;
        if(opts.mentionable!==undefined)this.mentionable=opts.mentionable;
        return this;
      }
    };
    roles.set(r.id,r);return r;
  }
  function overwrite(cache=[]){return {cache:new Map(cache.map(o=>[String(o.id),{
    id:String(o.id),type:o.type??OverwriteType.Role,
    allow:{bitfield:BigInt(Array.isArray(o.allow)?o.allow.reduce((x,y)=>x|y,0n):o.allow??0)},
    deny:{bitfield:BigInt(Array.isArray(o.deny)?o.deny.reduce((x,y)=>x|y,0n):o.deny??0)}
  }]))};}
  function channel(name,type,parentId=null,opts={}){
    const c={id:id(),name,type,parentId,position:opts.position??0,
      messageCount:opts.messageCount??3,history:["keep content"],webhooks:["keep webhook"],
      permissionOverwrites:overwrite(opts.permissionOverwrites),
      edit:async function(e){
        if(this.type===ChannelType.GuildCategory)counts.categoryEdit++;else counts.channelEdit++;
        if(e.name!==undefined)this.name=e.name;
        if(e.parent!==undefined)this.parentId=e.parent;
        if(e.permissionOverwrites!==undefined)this.permissionOverwrites=overwrite(e.permissionOverwrites);
        return this;
      }
    };
    channels.set(c.id,c);return c;
  }
  const guild={id:TARGET,ownerId:OWNER,name:"My existing BSA regiment",
    features:["COMMUNITY"],roles:{},channels:{},members:{},fetch:async()=>guild};
  roles.set(TARGET,{id:TARGET,name:"@everyone",position:0,managed:false,
    permissions:{bitfield:0n,has:()=>false},hexColor:"#000000",color:0,hoist:false,mentionable:false});
  const bot=role("TARC Assistant","#000000",0n,true,999);
  guild.members.fetchMe=async()=>({
    permissions:{has:x=>[P.ManageRoles,P.ManageChannels].includes(x)},
    roles:{highest:bot}
  });
  guild.roles.fetch=async()=>roles;
  guild.roles.create=async opts=>{
    counts.roleCreate++;
    // Discord adds new roles near the bottom. The existing bot's numeric
    // position shifts UP as new roles are inserted beneath it.
    for(const existing of roles.values())if(existing.position>=1)existing.position++;
    const created=role(opts.name,opts.color||"#000000",opts.permissions??0n,false,1);
    created.hoist=Boolean(opts.hoist);
    created.mentionable=Boolean(opts.mentionable);
    return created;
  };
  guild.roles.setPositions=async list=>{
    counts.roleReorder++;
    for(const {role:id,position} of list){
      const target=roles.get(String(id));
      if(!target||target.id===bot.id||position>=bot.position)
        throw Object.assign(new Error("Missing permissions"),{code:50013});
    }
    if(list.length===1){
      // A single-role Discord move shifts the other roles in its path.
      const {role:id,position}=list[0],target=roles.get(String(id)),from=target.position;
      for(const other of roles.values()){
        if(other===target||other.id===TARGET)continue;
        if(position>from&&other.position>from&&other.position<=position)other.position--;
        if(position<from&&other.position>=position&&other.position<from)other.position++;
      }
      target.position=position;
    } else {
      for(const {role:id,position} of list)roles.get(String(id)).position=position;
    }
    return list;
  };
  guild.channels.fetch=async channelId=>
    channelId==null?channels:(channels.get(String(channelId))??null);
  guild.channels.create=async opts=>{
    if(opts.type===ChannelType.GuildCategory)counts.categoryCreate++;
    else counts.channelCreate++;
    return channel(opts.name,opts.type,opts.parent??null,opts);
  };
  const defaults=channel("Text Channels",ChannelType.GuildCategory);
  channel("general",ChannelType.GuildText,defaults.id);
  return {guild,roles,channels,members,role,channel,counts,bot};
}
function fakeCommand(f,code){
  const events=[];let deferred=false;
  return {guild:f.guild,guildId:f.guild.id,user:{id:OWNER},
    options:{getString:()=>code},commandName:"bsa-generate",
    isChatInputCommand:()=>true,isButton:()=>false,inGuild:()=>true,
    get deferred(){return deferred},get replied(){return false},
    deferReply:async v=>{deferred=true;events.push(["defer",v]);},
    editReply:async v=>events.push(["edit",v]),reply:async v=>events.push(["reply",v]),events};
}
function fakeButton(f,customId){
  const events=[];let deferred=false;
  return {guild:f.guild,guildId:f.guild.id,user:{id:OWNER},customId,
    isChatInputCommand:()=>false,isButton:()=>true,inGuild:()=>true,
    get deferred(){return deferred},get replied(){return false},
    deferUpdate:async()=>{deferred=true;events.push(["deferUpdate"])},
    update:async v=>events.push(["update",v]),editReply:async v=>events.push(["edit",v]),
    reply:async v=>events.push(["reply",v]),events};
}
const last=x=>x.events.filter(([k])=>k==="edit"||k==="reply").at(-1)?.[1];

test("revised ZIP projection is valid for all 10, includes real colours/HQ, OCA five phases and 494 channels",async()=>{
 const pack=await getRevisedPresets();
 assert.deepEqual(Object.keys(pack),REVISED_CODES);
 let total=0;
 for(const code of REVISED_CODES){
   const t=pack[code],info=validateRevised(t);
   total+=info.channelCount;
   assert.equal(t.status,"REVISED_PROPOSAL_REQUIRES_PREVIEW");
   assert.deepEqual(t.roles_top_to_bottom.slice(0,5),
     ["Field Marshal","Chief of General Staff","Deputy Chief of General Staff",
      "Assistant Chief of General Staff","Army Sergeant Major"]);
   assert.ok(t.role_definitions.some(r=>r.color!=="#607D8B"));
   assert.ok(t.categories_top_to_bottom.every(c=>c.channels.every(ch=>ch.name.includes("│"))));
 }
 assert.equal(total,494);
 assert.equal(pack.OCA.categories_top_to_bottom.length,11);
 assert.equal(pack.OCA.categories_top_to_bottom.flatMap(c=>c.channels).length,61);
 assert.equal(pack.RICA.categories_top_to_bottom.length,8);
 assert.equal(pack.RICA.categories_top_to_bottom.flatMap(c=>c.channels).length,34);
 assert.equal(pack.RA.categories_top_to_bottom.length,9);
 assert.equal(pack.RA.categories_top_to_bottom.flatMap(c=>c.channels).length,14);
});
test("guest, member, trainee, instructor, command permissions are usable and appropriately restricted",async()=>{
 const pack=await getRevisedPresets();
 for(const code of REVISED_CODES){
   const matrix=testAccessMatrix(pack[code]);
   assert.deepEqual(matrix.issues,[],code+" access matrix: "+JSON.stringify(matrix.issues));
 }
 const t=pack.RMP;
 const main=t.categories_top_to_bottom.find(c=>c.name==="MAIN COMMUNICATIONS");
 const chat=main.channels.find(ch=>ch.name.includes("general-chat"));
 assert.equal(simulateChannelAccess(t,main,chat,[]).view,false);
 assert.equal(simulateChannelAccess(t,main,chat,["RMP | Personnel"]).send,true);
 const oca=pack.OCA;
 const ph1=oca.categories_top_to_bottom.find(c=>c.name.includes("𝟏"));
 const talk=ph1.channels.find(ch=>ch.name.includes("chat"));
 assert.equal(simulateChannelAccess(oca,ph1,talk,[]).view,false);
 assert.equal(simulateChannelAccess(oca,ph1,talk,["Phase 1"]).send,true);
 assert.equal(simulateChannelAccess(oca,ph1,talk,["Phase 2"]).view,false);
 assert.equal(simulateChannelAccess(oca,ph1,talk,["Academy Instructor"]).send,true);
 assert.equal(simulateChannelAccess(oca,ph1,talk,["Field Marshal"]).send,true);
 const important=oca.categories_top_to_bottom.find(c=>c.name.includes("𝐈𝐌𝐏𝐎𝐑𝐓𝐀𝐍𝐓"));
 const ann=important.channels.find(ch=>ch.name.includes("announcements"));
 assert.equal(simulateChannelAccess(oca,important,ann,[]).view,true);
 assert.equal(simulateChannelAccess(oca,important,ann,[]).send,false);
 assert.equal(simulateChannelAccess(oca,important,ann,["Academy Instructor"]).send,true);
});
test("fresh guild plans real role/category/channel changes without mutation, then revamps and reruns without duplicates",async()=>{
 const t=(await getRevisedPresets()).OCA, f=makeGuild();
 const plan=await previewRevisedGuild(f.guild,t);
 assert.equal(plan.ok,true,JSON.stringify(plan.issues));
 assert.equal(plan.summary.createRoles,20);
 assert.equal(plan.summary.createCategories,11);
 assert.equal(plan.summary.createChannels,61);
 assert.equal(f.counts.roleCreate,0);
 const build=await revampRegimentalGuild(f.guild,t);
 assert.deepEqual(build.errors,[]);
 assert.equal(build.rolesReordered,true);
 assert.equal(build.rolesCreated.length,21);
 assert.equal(build.categoriesCreated.length,11);
 assert.equal(build.channelsCreated.length,61);
 const rank=t.roles_top_to_bottom;
 for(let i=0;i<rank.length-1;i++){
   const a=[...f.roles.values()].find(x=>x.name===rank[i]);
   const b=[...f.roles.values()].find(x=>x.name===rank[i+1]);
   assert.ok(a.position>b.position,rank[i]+" must be above "+rank[i+1]);
 }
 const check=await auditRevisedGuild(f.guild,t);
 assert.deepEqual(check.issues,[]);
 // Discord displays roles in descending numeric position. Assert the
 // actual list users see, not merely that the setPositions method was called.
 const displayed=[...f.roles.values()].filter(x=>rank.includes(x.name))
   .sort((x,y)=>y.position-x.position).map(x=>x.name);
 assert.deepEqual(displayed,rank);
 assert.equal(displayed[0],"Field Marshal");
 assert.equal(displayed.at(-1),"Guest");
 assert.deepEqual(build.roleHierarchyActual.map(x=>x.name),rank);
 const totals={...f.counts};
 const again=await revampRegimentalGuild(f.guild,t);
 assert.deepEqual(again.errors,[]);
 assert.equal(again.rolesCreated.length,0);
 assert.equal(again.rolesUpdated.length,0);
 assert.equal(again.categoriesCreated.length,0);
 assert.equal(again.channelsCreated.length,0);
 assert.equal(again.channelsUpdated.length,0);
 assert.equal(f.counts.channelCreate,totals.channelCreate);
 assert.equal(f.counts.roleCreate,totals.roleCreate);
});
test("legacy OCA channels are updated in place; messages, IDs, roles, assignments and unknown content preserved",async()=>{
 const t=(await getRevisedPresets()).OCA,old=(await getRegimentalPresets()).OCA;
 const f=makeGuild();
 const roleRefs=new Map();
 for(const name of old.roles_lowest_to_highest){
   if(!roleRefs.has(name))roleRefs.set(name,f.role(name));
 }
 const marker=f.role("BSA Builder | OCA");
 const member=roleRefs.get("Academy Student");f.members.set("a-student",{roles:[member.id]});
 const legacyIDs=new Map();
 for(const c of old.categories_top_to_bottom){
   const cat=f.channel(c.name,ChannelType.GuildCategory);
   for(const ch of c.channels){
     const type={text:ChannelType.GuildText,forum:ChannelType.GuildForum,
       voice:ChannelType.GuildVoice,stage:ChannelType.GuildStageVoice}[ch.type];
     const item=f.channel(ch.name,type,cat.id,{messageCount:7});
     legacyIDs.set(c.name+"/"+ch.name,item.id);
   }
 }
 const beforeRoles=new Map(roleRefs);
 const pre=await previewRevisedGuild(f.guild,t);
 assert.equal(pre.ok,true,JSON.stringify(pre.issues));
 assert.ok(pre.summary.updateChannels>0);
 assert.ok(pre.summary.createChannels>0);
 assert.ok(pre.orphans.length>0);
 const build=await revampRegimentalGuild(f.guild,t);
 assert.deepEqual(build.errors,[]);
 for(const [roleName,oldRole] of beforeRoles){
   const newRole=[...f.roles.values()].find(x=>x.name===roleName);
   assert.equal(newRole.id,oldRole.id);
 }
 assert.deepEqual(f.members.get("a-student").roles,[member.id]);
 for(const ch of f.channels.values()){
   if(ch.messageCount===7){
     assert.deepEqual(ch.history,["keep content"]);
     assert.deepEqual(ch.webhooks,["keep webhook"]);
   }
 }
 assert.ok(build.channelsMoved.length>0);
 assert.ok([...f.channels.values()].some(c=>c.name.includes("phase-5-vc")));
 assert.ok(f.channels.has(marker.id)===false); // marker is a role, not a channel
 const audit=await auditRevisedGuild(f.guild,t);
 assert.deepEqual(audit.issues,[]);
 const second=await revampRegimentalGuild(f.guild,t);
 assert.equal(second.channelsCreated.length,0);
 assert.equal(second.rolesCreated.length,0);
});
test("existing /bsa-generate remains private, no mutation before confirmation, then applies revision",async()=>{
 const f=makeGuild(),i=fakeCommand(f,"RA");
 assert.equal(await handleRegimentalInteraction(i,env),true);
 const payload=last(i);
 assert.match(payload.content,/in-place revamp/);
 assert.equal(payload.components.length,1);
 assert.equal(f.counts.channelCreate,0);
 const button=payload.components[0].toJSON().components[0].custom_id;
 assert.match(button,/^bsaregi:apply:/);
 const b=fakeButton(f,button);
 assert.equal(await handleRegimentalInteraction(b,env),true);
 assert.match(last(b).content,/RA revamp VERIFIED/);
 assert.match(last(b).content,/Role hierarchy verified: YES/);
 assert.ok(f.counts.channelCreate>0);
});


test("unrelated custom-category channel is NOT repurposed by matching its name",async()=>{
  const t=(await getRevisedPresets()).OCA,f=makeGuild();
  f.role("BSA Builder | OCA");
  const privateCat=f.channel("PERSONAL PROJECT",ChannelType.GuildCategory);
  const privateChannel=f.channel("academy-announcements",ChannelType.GuildText,privateCat.id);
  const beforeId=privateChannel.id;
  const beforeParent=privateChannel.parentId;
  const plan=await previewRevisedGuild(f.guild,t);
  assert.equal(plan.ok,true,JSON.stringify(plan.issues));
  assert.ok(plan.orphans.some(x=>x.id===beforeId));
  assert.ok(plan.channels.some(x=>x.name==="📣│academy-announcements"&&x.action==="create"));
  const built=await revampRegimentalGuild(f.guild,t);
  assert.deepEqual(built.errors,[]);
  assert.equal(privateChannel.id,beforeId);
  assert.equal(privateChannel.parentId,beforeParent);
  assert.equal(privateChannel.name,"academy-announcements");
  const newMatching=[...f.channels.values()].filter(x=>x.name==="📣│academy-announcements");
  assert.equal(newMatching.length,1);
  assert.notEqual(newMatching[0].id,beforeId);
});
test("revamp removes stale regimental role access but preserves unrelated integration overwrites",async()=>{
  const t=(await getRevisedPresets()).RMP,f=makeGuild();
  const built=await revampRegimentalGuild(f.guild,t);
  assert.deepEqual(built.errors,[]);
  const commandCat=[...f.channels.values()].find(c=>c.name==="REGIMENTAL COMMAND");
  assert.ok(commandCat);
  const person=[...f.roles.values()].find(r=>r.name==="RMP | Personnel");
  const botExtra=f.role("External Logger", "#000000",0n,true);
  const previous=commandCat.permissionOverwrites.cache;
  previous.set(person.id,{
    id:person.id,type:OverwriteType.Role,
    allow:{bitfield:P.ViewChannel},deny:{bitfield:0n}
  });
  previous.set(botExtra.id,{
    id:botExtra.id,type:OverwriteType.Role,
    allow:{bitfield:P.ViewChannel},deny:{bitfield:0n}
  });
  const preview=await previewRevisedGuild(f.guild,t);
  assert.equal(preview.ok,true,JSON.stringify(preview.issues));
  assert.ok(preview.categories.some(x=>x.name==="REGIMENTAL COMMAND"&&x.action==="update"));
  assert.ok(preview.warnings.some(x=>x.includes("third-party")));
  const revised=await revampRegimentalGuild(f.guild,t);
  assert.deepEqual(revised.errors,[]);
  assert.equal(commandCat.permissionOverwrites.cache.has(person.id),false);
  assert.equal(commandCat.permissionOverwrites.cache.has(botExtra.id),true);
  const audit=await auditRevisedGuild(f.guild,t);
  assert.deepEqual(audit.issues,[]);
});

test("bot role below intended hierarchy prevents ALL writes and gives actionable error",async()=>{
 const t=(await getRevisedPresets()).OCA;
 const f=makeGuild();
 f.bot.position=8; // Typical case: bot invited before many new rank roles.
 const before={...f.counts};
 const preview=await previewRevisedGuild(f.guild,t);
 assert.equal(preview.ok,false);
 assert.ok(preview.issues.some(x=>x.includes("ROLE HIERARCHY BLOCKED") &&
   x.includes("Move TARC Assistant")&&x.includes("Server Settings")));
 const cmd=fakeCommand(f,"OCA");
 await handleRegimentalInteraction(cmd,env);
 const msg=last(cmd);
 assert.match(msg.content,/BLOCKED/);
 assert.equal(msg.components.length,0); // Cannot confirm a partial hierarchy build.
 assert.deepEqual(f.counts,before);
 await assert.rejects(revampRegimentalGuild(f.guild,t),/Preflight rejected revamp/);
 assert.deepEqual(f.counts,before);
});

test("existing inverted OCA roles get reordered highest-to-lowest without recreating roles",async()=>{
 const t=(await getRevisedPresets()).OCA,f=makeGuild();
 // Simulate screenshot: Applicant is at the top, Field Marshal at the bottom.
 for(const [i,name] of t.roles_top_to_bottom.entries())
   f.role(name,"#000000",0n,false,i+1);
 f.role("BSA Builder | OCA");
 const rankNames=[...t.roles_top_to_bottom];
 const originalIds=new Map([...f.roles.values()].map(x=>[x.name,x.id]));
 const prior=await previewRevisedGuild(f.guild,t);
 assert.equal(prior.ok,true,JSON.stringify(prior.issues));
 assert.equal(prior.needsHierarchy,true);
 const first=await revampRegimentalGuild(f.guild,t);
 assert.deepEqual(first.errors,[]);
 assert.equal(first.rolesReordered,true);
 const ordered=[...f.roles.values()].filter(x=>rankNames.includes(x.name))
   .sort((a,b)=>b.position-a.position).map(x=>x.name);
 assert.deepEqual(ordered,rankNames);
 for(const [name,id] of originalIds)
   assert.equal([...f.roles.values()].find(x=>x.name===name).id,id);
 const audit=await auditRevisedGuild(f.guild,t);
 assert.ok(!audit.issues.some(x=>x.includes("hierarchy")));
});

test("API success without actual order change is detected, not falsely reported as a fixed revamp",async()=>{
 const t=(await getRevisedPresets()).OCA,f=makeGuild();
 f.guild.roles.setPositions=async list=>{
   f.counts.roleReorder++; // Discord accepted, but did not apply positions.
   return list;
 };
 const outcome=await revampRegimentalGuild(f.guild,t);
 assert.equal(outcome.rolesReordered,false);
 assert.ok(outcome.errors.some(x=>x.includes("ROLE ORDER STILL")||x.includes("STILL INVERTED/UNVERIFIED")));
 assert.equal(outcome.channelsCreated.length,0);
 assert.equal(outcome.categoriesCreated.length,0);
 const names=new Map(outcome.roleHierarchyActual.map(x=>[x.name,x.position]));
 assert.ok(names.get("Field Marshal")<=names.get("Guest"));
});

test("role ordering API error halts other changes instead of producing a false success",async()=>{
 const t=(await getRevisedPresets()).OCA,f=makeGuild();
 f.guild.roles.setPositions=async()=>{throw Object.assign(new Error("Missing permissions"),{code:50013})};
 const outcome=await revampRegimentalGuild(f.guild,t);
 assert.equal(outcome.rolesReordered,false);
 assert.ok(outcome.errors.some(x=>x.includes("Reorder role hierarchy")));
 assert.ok(outcome.errors.some(x=>x.includes("Check Manage Roles")));
 assert.equal(outcome.channelsCreated.length,0);
});
