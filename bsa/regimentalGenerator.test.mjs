import {test} from "node:test";
import assert from "node:assert/strict";
import {ChannelType,PermissionFlagsBits as P} from "discord.js";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {brotliDecompressSync} from "node:zlib";
import {applyRegimentalEmojiNames,regimentChannelAliases,REGIMENT_CHANNEL_NAMING} from "./regimentalEmojiNames.js";
import {
  REGIMENT_CODES,getRegimentalPresets,validateRegimentalPreset,regimentRoleNames
} from "./regimentalTemplates.js";
import {
  markerName,preflightRegimentalGuild,buildRegimentalGuild,
  auditRegimentalGuild,conservativeOverwrites
} from "./regimentalEngine.js";
import {
  getRegimentalCommands,builderCredentials,allowedRegimentalTarget,
  handleRegimentalInteraction,registerRegimentalGuildCommands
} from "./regimentalCommands.js";

const OWNER="999999999999999999",TARC="123456789012345678";
const MAIN_BSA="777777777777777777",DEST="666666666666666666";
const env={BSA_OWNER_DISCORD_ID:OWNER,TARC_MAIN_GUILD_ID:TARC,BSA_GUILD_ID:MAIN_BSA};
const typeLookup={text:ChannelType.GuildText,voice:ChannelType.GuildVoice,
  forum:ChannelType.GuildForum,stage:ChannelType.GuildStageVoice};
function fakeGuild(id=DEST,ownerId=OWNER,community=true){
  const roles=new Map(),channels=new Map();
  let seq=300000000000000000n,roleCreates=0,channelCreates=0,otherWrites=0;
  const newId=()=>String(++seq);
  const bot={permissions:{has:bit=>bit===P.ManageRoles||bit===P.ManageChannels},
    roles:{highest:{position:1000}}};
  const guild={id,ownerId,name:"Anything At All",features:community?["COMMUNITY"]:[],roles:{},channels:{},members:{fetchMe:async()=>bot}};
  guild.fetch=async()=>guild;
  roles.set(id,{id,name:"@everyone",managed:false,position:0,permissions:{has:()=>false}});
  roles.set(newId(),{id:newId(),name:"TARC Assistant",managed:true,position:1000,permissions:{has:()=>false}});
  guild.roles.fetch=async()=>roles;
  guild.roles.create=async opt=>{
    roleCreates++;
    const created={id:newId(),name:opt.name,managed:false,position:1,
      permissions:{has:()=>false},color:opt.color||0,opts:opt};
    assert.equal(opt.permissions,0n);
    roles.set(created.id,created);
    return created;
  };
  guild.roles.setPositions=async list=>{
    otherWrites++;
    for(const item of list)roles.get(String(item.role)).position=item.position;
  };
  guild.channels.fetch=async ()=>channels;
  guild.channels.create=async opt=>{
    channelCreates++;
    const created={id:newId(),name:opt.name,type:opt.type,parentId:opt.parent??null,
      position:opt.position||0,permissionOverwrites:{cache:new Map()},opts:opt};
    channels.set(created.id,created);return created;
  };
  function addDefault(){
    const parent={id:newId(),name:"Text Channels",type:ChannelType.GuildCategory,parentId:null};
    channels.set(parent.id,parent);
    const general={id:newId(),name:"general",type:ChannelType.GuildText,parentId:parent.id};
    channels.set(general.id,general);
  }
  addDefault();
  return {guild,roles,channels,bot,counts:()=>({roleCreates,channelCreates,otherWrites}),
    createExtraRole:name=>{
      const x={id:newId(),name,managed:false,permissions:{has:()=>false}};
      roles.set(x.id,x);return x;
    },createExtraChannel:(name,type,parentId=null)=>{
      const c={id:newId(),name,type,parentId};channels.set(c.id,c);return c;
    }};
}
function command(f,code="RMP",who=OWNER,guildId=f.guild.id){
  let deferred=false;
  const events=[];
  return {isChatInputCommand:()=>true,isButton:()=>false,
    commandName:"bsa-generate",options:{getString:()=>code},
    inGuild:()=>true,guildId,guild:f.guild,user:{id:who},
    get deferred(){return deferred},get replied(){return false},
    deferReply:async payload=>{deferred=true;events.push(["defer",payload]);},
    editReply:async payload=>events.push(["edit",payload]),
    reply:async payload=>events.push(["reply",payload]),events};
}
function button(f,customId,who=OWNER){
  let deferred=false;
  const events=[];
  return {isChatInputCommand:()=>false,isButton:()=>true,customId,
    inGuild:()=>true,guildId:f.guild.id,guild:f.guild,user:{id:who},
    get deferred(){return deferred},get replied(){return false},
    deferUpdate:async()=>{deferred=true;events.push(["deferUpdate"]);},
    update:async payload=>events.push(["update",payload]),
    editReply:async payload=>events.push(["edit",payload]),
    reply:async payload=>events.push(["reply",payload]),events};
}
const response=i=>i.events.filter(([k])=>k==="edit"||k==="reply").at(-1)?.[1];

test("all 10 source proposal JSONs are bundled without silently approving them",async()=>{
 const pack=await getRegimentalPresets();
 assert.deepEqual(Object.keys(pack).sort(),[...REGIMENT_CODES].sort());
 for(const code of REGIMENT_CODES){
   const p=pack[code];
   assert.equal(p.schema,"bsa.regimental.proposal");
   assert.equal(p.status,"PROPOSAL_NOT_APPROVED");
   assert.equal(p.server_code,code);
   assert.ok(p.roles_lowest_to_highest.length>=10);
   assert.ok(p.categories_top_to_bottom.length>=6);
   assert.ok(p.reference_source.guild_id);
   assert.equal(p.safety.source_guild_id_is_read_only,true);
   assert.equal(p.safety.require_dry_run_and_confirmation,true);
 }
 assert.equal(pack.RMP.categories_top_to_bottom.flatMap(c=>c.channels).length,59);
 assert.equal(pack.ETS.categories_top_to_bottom.flatMap(c=>c.channels).length,53);
 assert.equal(pack.RGG.categories_top_to_bottom.flatMap(c=>c.channels).length,50);
 assert.equal(pack.RTR.categories_top_to_bottom.flatMap(c=>c.channels).length,52);
 assert.equal(pack.UKSF.categories_top_to_bottom.flatMap(c=>c.channels).length,56);
 assert.equal(pack.GR.categories_top_to_bottom.flatMap(c=>c.channels).length,51);
 assert.equal(pack.RIC.categories_top_to_bottom.flatMap(c=>c.channels).length,64);
 assert.equal(pack.OCA.categories_top_to_bottom.flatMap(c=>c.channels).length,30);
 assert.equal(pack.RICA.categories_top_to_bottom.flatMap(c=>c.channels).length,27);
 assert.equal(pack.RA.categories_top_to_bottom.flatMap(c=>c.channels).length,17);
});
test("identical RA role strings consolidate; ambiguous non-string role specs still block",async()=>{
 const pack=await getRegimentalPresets();
 for(const code of REGIMENT_CODES.filter(x=>x!=="RA")){
   const v=validateRegimentalPreset(pack[code]);
   assert.deepEqual(v.errors,[],code);
 }
 const ra=validateRegimentalPreset(pack.RA);
 assert.equal(ra.ok,true);
 assert.deepEqual(ra.errors,[]);
 assert.equal(ra.roleEntries,13);
 assert.equal(ra.roles,10);
 assert.deepEqual(ra.duplicateRoleNames,["Guest","RIC | Royal Intelligence Corps","Headquarters"]);
 assert.ok(ra.warnings.some(x=>x.includes("Identical role-name entries consolidated")));
 assert.equal(pack.RA.roles_lowest_to_highest.length,13);
 assert.deepEqual(regimentRoleNames(pack.RA),[
   "RA | Personnel","Regimental Oversight","Guest","BA | British Army Personnel",
   "RIC | Royal Intelligence Corps","Moderation Department","Reports Staff",
   "Appeals Reviewer","Headquarters","Ticket Blacklist"
 ]);
 const conflict=structuredClone(pack.RA);
 conflict.roles_lowest_to_highest.push({name:"Guest",permissions:["Administrator"]});
 const invalid=validateRegimentalPreset(conflict);
 assert.equal(invalid.ok,false);
 assert.ok(invalid.errors.some(x=>x.includes("Unsupported role specification")));
 const rmp=validateRegimentalPreset(pack.RMP);
 assert.ok(rmp.warnings.some(w=>w.includes("provost")&&w.includes("not defined")));
 assert.ok(rmp.warnings.some(w=>w.includes("mixed voice")));
});
test("privacy safe defaults never grant roles, Administrator or public send access",()=>{
 const publicText=conservativeOverwrites(DEST,"public","text")[0];
 assert.ok(publicText.allow.includes(P.ViewChannel));
 assert.ok(publicText.deny.includes(P.SendMessages));
 const privateText=conservativeOverwrites(DEST,"iad","forum")[0];
 assert.deepEqual(privateText.allow,[]);
 assert.ok(privateText.deny.includes(P.ViewChannel));
 const mixedVoice=conservativeOverwrites(DEST,"mixed","voice")[0];
 assert.ok(mixedVoice.deny.includes(P.ViewChannel));
 assert.ok(mixedVoice.deny.includes(P.Connect));
});
test("actual user and guild owner required, protected live/main/source servers denied",async()=>{
 const pack=await getRegimentalPresets();
 const sources=Object.values(pack).map(p=>p.reference_source.guild_id);
 const creds=builderCredentials(env,sources);
 assert.deepEqual(creds.issues,[]);
 const ctx={inGuild:true,guildId:DEST,userId:OWNER,guildOwnerId:OWNER};
 assert.equal(allowedRegimentalTarget(creds,ctx),true);
 for(const bad of [TARC,MAIN_BSA,...sources]){
   assert.equal(allowedRegimentalTarget(creds,{...ctx,guildId:bad}),false,bad);
 }
 assert.equal(allowedRegimentalTarget(creds,{...ctx,userId:"888888888888888888"}),false);
 assert.equal(allowedRegimentalTarget(creds,{...ctx,guildOwnerId:"888888888888888888"}),false);
 assert.equal(builderCredentials({...env,BSA_GUILD_ID:""}).issues.length>0,true);
 const withLegacy=builderCredentials({...env,GUILD_ID:"555555555555555555"},sources);
 assert.equal(allowedRegimentalTarget(withLegacy,{...ctx,guildId:"555555555555555555"}),false);
 assert.equal(builderCredentials({...env,TARC_MAIN_GUILD_ID:MAIN_BSA},sources).issues.some(x=>x.includes("must be different")),true);
});
test("new guild can be any name, but must be clean and allow Manage Roles/Channels",async()=>{
 const pack=await getRegimentalPresets();
 const f=fakeGuild();
 const first=await preflightRegimentalGuild(f.guild,pack.RMP);
 assert.equal(first.ok,true);
 assert.equal(first.size.newRoles,pack.RMP.roles_lowest_to_highest.length);
 assert.equal(first.size.newChannels,59);
 const bad=fakeGuild();bad.createExtraChannel("existing-sensitive-channel",ChannelType.GuildText);
 const withExtra=await preflightRegimentalGuild(bad.guild,pack.RMP);
 assert.equal(withExtra.ok,true);
 assert.ok(withExtra.warnings.some(x=>x.includes("Preserving 1 unmatched")));
 assert.deepEqual(withExtra.extraObjects.map(x=>x.name),["existing-sensitive-channel"]);
 const wrong=fakeGuild();wrong.createExtraRole("Other RP Command");
 assert.equal((await preflightRegimentalGuild(wrong.guild,pack.RMP)).ok,false);
 const notCommunity=fakeGuild(DEST,OWNER,false);
 assert.ok((await preflightRegimentalGuild(notCommunity.guild,pack.RMP)).issues.some(x=>x.includes("Community")));
});
test("simulated sequential build creates original roles/categories/channels, never extras or repeated objects",async()=>{
 const pack=await getRegimentalPresets();
 for(const code of REGIMENT_CODES){
   const f=fakeGuild();
   const proposal=pack[code],expected=validateRegimentalPreset(proposal);
   const first=await buildRegimentalGuild(f.guild,proposal);
   assert.equal(first.createdRoles.length,expected.roles+1,code);
   assert.equal(first.createdCategories.length,expected.categories,code);
   assert.equal(first.createdChannels.length,expected.channels,code);
   assert.deepEqual(first.errors,[],code);
   assert.equal(f.counts().roleCreates,expected.roles+1);
   assert.equal(f.counts().channelCreates,expected.categories+expected.channels);
   assert.ok([...f.roles.values()].some(r=>r.name===markerName(code)));
   const restricted=proposal.categories_top_to_bottom.find(c=>c.access!=="public");
   const made=[...f.channels.values()].find(c=>c.name===restricted.name);
   assert.ok(made.opts.permissionOverwrites[0].deny.includes(P.ViewChannel),code);
   const audited=await auditRegimentalGuild(f.guild,proposal);
   assert.deepEqual(audited.issues,[],code);
   const before=f.counts();
   const again=await buildRegimentalGuild(f.guild,proposal);
   assert.equal(again.createdRoles.length,0,code);
   assert.equal(again.createdCategories.length,0,code);
   assert.equal(again.createdChannels.length,0,code);
   assert.deepEqual(f.counts(),{...before,otherWrites:before.otherWrites+1});
 }
});
test("template marker disallows applying a different regiment in same guild",async()=>{
 const pack=await getRegimentalPresets(),f=fakeGuild();
 await buildRegimentalGuild(f.guild,pack.RMP);
 const incompatible=await preflightRegimentalGuild(f.guild,pack.ETS);
 assert.equal(incompatible.ok,false);
 assert.ok(incompatible.issues.some(x=>x.includes("different BSA generator preset")));
});
test("guild-specific immediate commands only register on eligible newly-owned guilds, never bulk overwrite",async()=>{
 const f=fakeGuild();
 const calls=[],existing=[];
 const rest={
   post:async(route,{body})=>{calls.push({method:"post",route,body});existing.push(body);return {id:String(existing.length),name:body.name}},
   get:async route=>{calls.push({method:"get",route});return existing;}
 };
 const commands=getRegimentalCommands();
 assert.deepEqual(commands.map(x=>x.name),["bsa-generate","bsa-regiment-audit"]);
 assert.ok(commands[0].options[0].choices.length===10);
 const good=await registerRegimentalGuildCommands(rest,"111111111111111111",f.guild,env);
 assert.equal(good.registered,true);
 assert.equal(calls.filter(x=>x.method==="post").length,2);
 assert.ok(calls.filter(x=>x.method==="post").every(x=>!x.body.integration_types&&!x.body.contexts));
 const before=calls.length;
 const protectedGuild=fakeGuild(MAIN_BSA);
 assert.equal((await registerRegimentalGuildCommands(rest,"111111111111111111",protectedGuild.guild,env)).registered,false);
 const source=(await getRegimentalPresets()).RMP.reference_source.guild_id;
 assert.equal((await registerRegimentalGuildCommands(rest,"111111111111111111",fakeGuild(source).guild,env)).registered,false);
 const wrongOwner=fakeGuild(DEST,"888888888888888888");
 assert.equal((await registerRegimentalGuildCommands(rest,"111111111111111111",wrongOwner.guild,env)).registered,false);
 assert.equal(calls.length,before);
});

test("build time limit stops before any mutation and never deletes existing objects",async()=>{
 const f=fakeGuild(),pack=await getRegimentalPresets();
 const start=f.counts();
 const result=await buildRegimentalGuild(f.guild,pack.RMP,async()=>{}, {maxDurationMs:-1});
 assert.equal(result.createdRoles.length,0);
 assert.equal(result.createdChannels.length,0);
 assert.ok(result.errors.some(x=>x.includes("time limit")));
 assert.deepEqual(f.counts(),start);
});

test("unmatched starter channels are preserved unchanged across build, audit and rerun",async()=>{
  const pack=await getRegimentalPresets();
  const f=fakeGuild();
  const unmatched=f.createExtraChannel("new-member-onboarding",ChannelType.GuildText);
  const originalId=unmatched.id;
  const sampleBefore={...unmatched};
  const initial=await preflightRegimentalGuild(f.guild,pack.OCA);
  assert.equal(initial.ok,true);
  assert.equal(initial.extraObjects.length,1);
  assert.equal(initial.extraObjects[0].id,originalId);
  const first=await buildRegimentalGuild(f.guild,pack.OCA);
  assert.deepEqual(first.errors,[]);
  assert.equal(first.createdChannels.length,30);
  assert.equal(f.channels.get(originalId),unmatched);
  assert.deepEqual(unmatched,sampleBefore);
  const audit=await auditRegimentalGuild(f.guild,pack.OCA);
  assert.deepEqual(audit.issues,[]);
  assert.ok(audit.warnings.some(x=>x.includes("Preserving 1 unmatched")));
  const second=await buildRegimentalGuild(f.guild,pack.OCA);
  assert.equal(second.createdChannels.length,0);
  assert.equal(second.createdCategories.length,0);
  assert.equal(second.createdRoles.length,0);
  assert.deepEqual(unmatched,sampleBefore);
});
test("all 459 effective channel names exactly match the user's replacement emoji ZIP",async()=>{
 const pack=await getRegimentalPresets();
 // Hashes of JSON.stringify([[parentCategory, formattedChannelName], ...])
 // independently calculated from each *_PROPOSED_CONFIG.json in the new ZIP.
 const expected={
   RMP:"2ebd8a75654e4f3c", ETS:"3a9b1424a7abeab3",
   RGG:"89b72371e11a01ca", RTR:"67ef6f594133da37",
   UKSF:"e490a32af9d2678f", GR:"fa03b4659ee15cff",
   RIC:"6e24d8bea2658d5f", OCA:"00ef297a74fe08c3",
   RICA:"8d87d0033ee19b45", RA:"711bece7d14e51be"
 };
 let total=0;
 for(const code of REGIMENT_CODES){
   const t=pack[code];
   const rows=t.categories_top_to_bottom.flatMap(cat=>
     cat.channels.map(ch=>[cat.name,ch.name]));
   const hash=createHash("sha256").update(JSON.stringify(rows)).digest("hex").slice(0,16);
   assert.equal(hash,expected[code],code+" must match the uploaded ZIP 1:1");
   assert.equal(t.channel_naming_convention,REGIMENT_CHANNEL_NAMING);
   for(const [category,name] of rows){
     assert.match(name,/^.+│[^│]+$/u,code+"/"+category+"/"+name);
     assert.equal(name.includes("|"),false);
     assert.equal(regimentChannelAliases(name)[0],name);
   }
   total+=rows.length;
 }
 assert.equal(total,459);
 assert.deepEqual(regimentChannelAliases("👋│welcome"),["👋│welcome","welcome"]);
 assert.deepEqual(regimentChannelAliases("welcome"),["welcome"]);
});

test("emoji conversion refuses to guess if source channel names or ordering changed",async()=>{
 const contents=(await readFile(new URL("./regimental-proposals.b64",import.meta.url),"utf8")).trim();
 const legacy=JSON.parse(brotliDecompressSync(Buffer.from(contents,"base64")).toString("utf8"));
 const good=applyRegimentalEmojiNames(legacy);
 assert.equal(good.OCA.categories_top_to_bottom[0].channels[0].name,"👋│welcome");
 assert.equal(legacy.OCA.categories_top_to_bottom[0].channels[0].name,"welcome");
 legacy.OCA.categories_top_to_bottom[0].channels[0].name="unexpected-name";
 assert.throws(()=>applyRegimentalEmojiNames(legacy),/Original channel layout\/order has changed/);
});

test("mixed plain/new channels are reused, but both spellings in one category block safely",async()=>{
 const pack=await getRegimentalPresets(),f=fakeGuild();
 await buildRegimentalGuild(f.guild,pack.OCA);
 const channels=[...f.channels.values()].filter(c=>c.name.includes("│"));
 const plain=channels[0],unchanged=channels[1];
 plain.name=regimentChannelAliases(plain.name)[1];
 const mixed=await preflightRegimentalGuild(f.guild,pack.OCA);
 assert.equal(mixed.ok,true);
 assert.equal(mixed.legacyReusedChannels.length,1);
 assert.equal(mixed.size.newChannels,0);
 assert.ok(unchanged.name.includes("│"));
 const duplicate=f.createExtraChannel("👋│welcome",plain.type,plain.parentId);
 const before=f.counts();
 const bad=await preflightRegimentalGuild(f.guild,pack.OCA);
 assert.equal(bad.ok,false);
 assert.ok(bad.issues.some(x=>x.includes("Duplicate existing channels")));
 assert.equal(bad.extraObjects.length,0);
 await assert.rejects(buildRegimentalGuild(f.guild,pack.OCA),/preflight stopped all writes/);
 assert.deepEqual(f.counts(),before);
 assert.ok(f.channels.has(duplicate.id));
});
