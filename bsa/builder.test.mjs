import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {PermissionFlagsBits as P} from "discord.js";
import {validateBsaTemplate,categoryAccess} from "./builderCore.js";
import {createOverwrites,channelOverwrites,auditBsaGuild,buildBsaGuild} from "./builderEngine.js";
import {bsaTargetAllowed,bsaConfiguration,bsaAccessIssue,getBsaCommands,handleBsaInteraction} from "./bsaCommands.js";
const template=JSON.parse(await readFile(new URL("./BSA_Server_Template_V4.json",import.meta.url),"utf8"));
const clone=x=>JSON.parse(JSON.stringify(x));
const fixed=()=>clone(template);
const incomplete=()=>{
 const t=clone(template);
 t.roles=t.roles.filter(r=>r.name!=="Officer Cadet on Trial");
 const cat=t.categories.find(c=>c.name==="OFFICER STAFF SECTOR");
 const ch=cat.channels.find(c=>c.name==="supervision-request");
 ch.access.view=ch.access.view.map(r=>r==="Officer Cadet on Trial"?"OF-0 | Officer Cadet":r);
 ch.access.post=ch.access.post.map(r=>r==="Officer Cadet on Trial"?"OF-0 | Officer Cadet":r);
 return t;
};
test("approved BSA V4 contains the corrected trial-cadet role and permissions",()=>{
 assert.equal(template.schema,"bsa-discord-builder-config");
 assert.equal(template.version,4);
 assert.equal(template.server_name,"British Sandhurst Army | BSA");
 assert.equal(template.roles.length,56);
 assert.equal(template.categories.length,16);
 const v=validateBsaTemplate(template);
 assert.equal(v.counts.channels,100);
 assert.equal(v.counts.forum,2);
 assert.equal(v.counts.stage,1);
 assert.equal(v.counts.voice,8);
 assert.equal(v.counts.text,89);
});
test("V4 build must fail closed on missing Officer Cadet on Trial role and overly broad cadet posting",()=>{
 const validation=validateBsaTemplate(template);
 assert.equal(validation.ok,false);
 assert.ok(validation.errors.some(e=>e.includes("no unique trial-cadet Discord role")));
 assert.ok(validation.errors.some(e=>e.includes("general OF-0")));
 assert.ok(validation.warnings.some(w=>w.includes("default_view")));
 assert.equal(template.categories.some(c=>c.name==="OFFICER STAFF SECTOR"&&c.channels.some(x=>x.name==="pings")),false);
});
test("corrected V4 role and supervision permissions pass validation",()=>{
 const v=validateBsaTemplate(fixed());
 assert.deepEqual(v.errors,[]);
 assert.equal(v.ok,true);
});
test("regular OF-0 cannot view or post in supervision-request",()=>{
 const supervision=template.categories.find(c=>c.name==="OFFICER STAFF SECTOR")
   .channels.find(ch=>ch.name==="supervision-request");
 for(const field of ["view","post"]){
   assert.ok(supervision.access[field].includes("Officer Cadet on Trial"));
   assert.ok(!supervision.access[field].includes("OF-0 | Officer Cadet"));
 }
 assert.equal(template.roles.find(r=>r.name==="Officer Cadet on Trial").administrator,false);
});
test("private text permissions deny everyone and allow only explicit roles",()=>{
 const guild={id:"999999999999999999"};
 const t=fixed();
 const roleMap=new Map([["@everyone",{id:guild.id}]]);
 for(const [i,r] of t.roles.entries())roleMap.set(r.name,{id:String(100000000000000000n+BigInt(i))});
 const cat=t.categories.find(c=>c.name==="MODERATION SECTOR");
 const chat=cat.channels.find(c=>c.name==="mod-chat");
 const rows=channelOverwrites(guild,chat,roleMap);
 const ev=rows.find(r=>r.id===guild.id);
 const moderator=rows.find(r=>r.id===roleMap.get("Moderator").id);
 assert.ok(ev.deny.includes(P.ViewChannel));
 assert.ok(ev.deny.includes(P.SendMessages));
 assert.ok(moderator.allow.includes(P.ViewChannel));
 assert.ok(moderator.allow.includes(P.SendMessages));
 const publicChannel=t.top_level_channels.find(c=>c.name==="welcome");
 const w=channelOverwrites(guild,publicChannel,roleMap);
 assert.ok(w.find(x=>x.id===guild.id).allow.includes(P.ViewChannel));
 assert.ok(w.find(x=>x.id===guild.id).deny.includes(P.SendMessages));
 const stage=t.categories.find(c=>c.name==="VOICE CHANNELS").channels.find(c=>c.type==="stage");
 const stagePerms=channelOverwrites(guild,stage,roleMap);
 assert.ok(stagePerms.find(x=>x.id===guild.id).allow.includes(P.Connect));
 assert.ok(categoryAccess(cat).includes("Moderator"));
});
test("template invalidity prevents all build writes",async()=>{
 let writes=0;
 await assert.rejects(
  buildBsaGuild({roles:{create:()=>{writes++;}},channels:{create:()=>{writes++;}}},incomplete()),
  /validation blockers/
 );
 assert.equal(writes,0);
});
test("BSA commands require precise owner, target guild and protected TARC ID",()=>{
 const ids={targetId:"777777777777777777",ownerId:"999999999999999999",protectedId:"123456789012345678"};
 const data={guildId:ids.targetId,userId:ids.ownerId,guildOwnerId:ids.ownerId,guildName:"British Sandhurst Army | BSA"};
 assert.equal(bsaTargetAllowed(ids,data),true);
 assert.equal(bsaTargetAllowed(ids,{...data,guildId:ids.protectedId}),false);
 assert.equal(bsaTargetAllowed({...ids,targetId:ids.protectedId},data),false);
 assert.equal(bsaTargetAllowed(ids,{...data,userId:"888888888888888888"}),false);
 assert.equal(bsaTargetAllowed(ids,{...data,guildOwnerId:"888888888888888888"}),false);
 assert.equal(bsaTargetAllowed(ids,{...data,guildName:"TARC"}),false);
 assert.equal(bsaConfiguration({BSA_GUILD_ID:ids.targetId,BSA_OWNER_DISCORD_ID:ids.ownerId,
  TARC_MAIN_GUILD_ID:ids.protectedId}).targetId,ids.targetId);
});
test("temporary commands are global guild-only and default to owner/admin command visibility",()=>{
 const cmds=getBsaCommands();
 assert.deepEqual(cmds.map(c=>c.name),["bsa-preview","bsa-build","bsa-audit"]);
 for(const cmd of cmds){
  assert.deepEqual(cmd.integration_types,[0]);
  assert.deepEqual(cmd.contexts,[0]);
  assert.equal(cmd.default_member_permissions,"0");
 }
});
test("read-only audit reports missing roles and channels without writes",async()=>{
 let writes=0;
 const guild={
  id:"777777777777777777",
  roles:{fetch:async()=>new Map(),create:async()=>{writes++;}},
  channels:{fetch:async()=>new Map(),create:async()=>{writes++;}}
 };
 const audit=await auditBsaGuild(guild,template);
 assert.equal(audit.status,"mismatches_found");
 assert.ok(audit.issues.some(x=>x.includes("Missing role: Field Marshal")));
 assert.ok(audit.issues.some(x=>x.includes("Missing category")));
 assert.equal(writes,0);
});

test("authorized BSA user sees which Railway variable is blocking access",()=>{
 const good={targetId:"777777777777777777",ownerId:"999999999999999999",protectedId:"123456789012345678"};
 const context={inGuild:true,guildId:good.targetId,userId:good.ownerId};
 assert.equal(bsaAccessIssue(good,context),null);
 assert.match(bsaAccessIssue({...good,protectedId:""},context),/TARC_MAIN_GUILD_ID/);
 assert.match(bsaAccessIssue({...good,protectedId:good.targetId},context),/SAME server/);
 assert.match(bsaAccessIssue({...good,targetId:""},context),/BSA_GUILD_ID/);
 assert.match(bsaAccessIssue({...good,ownerId:""},context),/BSA_OWNER_DISCORD_ID/);
 assert.match(bsaAccessIssue(good,{...context,inGuild:false}),/inside your new BSA/);
});
test("untrusted users receive generic denial without protected IDs",()=>{
 const config={targetId:"777777777777777777",ownerId:"999999999999999999",protectedId:"777777777777777777"};
 const issue=bsaAccessIssue(config,{inGuild:true,guildId:config.targetId,userId:"888888888888888888"});
 assert.match(issue,/BSA access denied/);
 assert.doesNotMatch(issue,/SAME server|777777777777777777|TARC_MAIN_GUILD_ID/);
});
test("builder rejects protected-id conflict before guild reads or writes",async()=>{
 const env={BSA_GUILD_ID:"777777777777777777",
 BSA_OWNER_DISCORD_ID:"999999999999999999",TARC_MAIN_GUILD_ID:"777777777777777777"};
 const messages=[];let fetched=0;
 const interaction={
  isChatInputCommand:()=>true,isButton:()=>false,inGuild:()=>true,
  commandName:"bsa-build",guildId:env.BSA_GUILD_ID,user:{id:env.BSA_OWNER_DISCORD_ID},
  guild:{fetch:async()=>{fetched++;throw new Error("should not fetch")}},
  reply:async p=>messages.push(p)
 };
 assert.equal(await handleBsaInteraction(interaction,env),true);
 assert.equal(fetched,0);
 assert.equal(messages.length,1);
 assert.match(messages[0].content,/SAME server/);
 assert.equal(messages[0].flags,64);
});
test("correct guild and owner are checked after configuration using fresh guild data",async()=>{
 const env={BSA_GUILD_ID:"777777777777777777",
  BSA_OWNER_DISCORD_ID:"999999999999999999",TARC_MAIN_GUILD_ID:"123456789012345678"};
 const messages=[];let fetched=0,deferred=false;
 const interaction={
  isChatInputCommand:()=>true,isButton:()=>false,inGuild:()=>true,
  commandName:"bsa-preview",guildId:env.BSA_GUILD_ID,user:{id:env.BSA_OWNER_DISCORD_ID},
  guild:{fetch:async()=>{fetched++;return {id:env.BSA_GUILD_ID,ownerId:"888888888888888888",name:"British Sandhurst Army | BSA"};}},
  get deferred(){return deferred;},get replied(){return false;},
  deferReply:async()=>{deferred=true},
  editReply:async p=>messages.push(p)
 };
 assert.equal(await handleBsaInteraction(interaction,env),true);
 assert.equal(fetched,1);
 assert.match(messages[0].content,/not the ACTUAL Discord owner/);
});
