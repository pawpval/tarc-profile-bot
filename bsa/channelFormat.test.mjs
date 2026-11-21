import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {ChannelType,PermissionFlagsBits} from "discord.js";
import {
  BSA_CHANNEL_EMOJIS, TOP_LEVEL, SEPARATOR, formatTargetName, validateBsaFormatMap
} from "./channelFormatMap.js";
import {planBsaFormat,applyBsaFormatChanges} from "./channelFormatCore.js";
import {getBsaFormatCommand,getBsaGuildFormatRegistration,handleBsaFormatInteraction} from "./channelFormatCommand.js";

const template=JSON.parse(await readFile(new URL("./BSA_Server_Template_V4.json",import.meta.url),"utf8"));
const GUILD="777777777777777777", OWNER="999999999999999999", TARC="123456789012345678";
const env={BSA_GUILD_ID:GUILD,BSA_OWNER_DISCORD_ID:OWNER,TARC_MAIN_GUILD_ID:TARC};
const types={text:ChannelType.GuildText,voice:ChannelType.GuildVoice,
  stage:ChannelType.GuildStageVoice,forum:ChannelType.GuildForum};
function fixture() {
  let n=400000000000000000n;
  const uid=()=>String(++n);
  const channels=new Map();let writes=0,fetches=0;
  const me={
    permissions:{has:permission=>permission===PermissionFlagsBits.ManageChannels},
    permissionsIn:channel=>({has:bit=>bit===PermissionFlagsBits.ManageChannels && !channel.denyManage})
  };
  const guild={id:GUILD,ownerId:OWNER,name:"British Sandhurst Army",members:{
    fetchMe:async()=>me
  },channels:{},fetch:async()=>{fetches++;return guild;}};
  function channel(name,type,parentId=null){
    const saved={
      id:uid(),guildId:GUILD,name,type,parentId,position:2,rawPosition:2,
      manageable:true,topic:"Keep this message",nsfw:false,rateLimitPerUser:0,
      permissionOverwrites:{cache:new Map([["some-role",{allow:1234n,deny:99n}]])},
      messageCount:123,webhookCount:1,connectedIntegration:"unchanged",
      setName:async function(next,reason){
        assert.match(reason,/BSA/);
        writes++;this.name=next;return this;
      }
    };
    channels.set(saved.id,saved);return saved;
  }
  for(const ch of template.top_level_channels)channel(ch.name,types[ch.type]);
  for(const category of template.categories){
    const cat=channel(category.name,ChannelType.GuildCategory);
    for(const ch of category.channels)channel(ch.name,types[ch.type],cat.id);
  }
  guild.channels.fetch=async(id)=>id===undefined?channels:channels.get(String(id))??null;
  return {guild,me,channels,counts:()=>({writes,fetches}),channel};
}
function command(guild,user=OWNER,guildId=GUILD) {
  const events=[];let deferred=false;
  return {isChatInputCommand:()=>true,isButton:()=>false,commandName:"bsa-format",
    user:{id:user},guildId,guild,
    inGuild:()=>true,
    get deferred(){return deferred},get replied(){return false},
    deferReply:async data=>{events.push(["defer",data]);deferred=true;},
    editReply:async data=>{events.push(["edit",data]);},
    reply:async data=>{events.push(["reply",data]);},
    events
  };
}
function button(guild,customId,user=OWNER,guildId=GUILD) {
  const events=[];let deferred=false;
  return {isChatInputCommand:()=>false,isButton:()=>true,customId,
    user:{id:user},guildId,guild,inGuild:()=>true,
    get deferred(){return deferred},get replied(){return false},
    deferUpdate:async()=>{deferred=true;events.push(["deferUpdate"])},
    update:async data=>events.push(["update",data]),
    editReply:async data=>events.push(["edit",data]),
    reply:async data=>events.push(["reply",data]),
    events
  };
}
function lastReply(i){return i.events.filter(([kind])=>kind==="edit"||kind==="reply").at(-1)?.[1];}

test("exact owner mapping validates all 100 channels and uses Unicode │",()=>{
 const valid=validateBsaFormatMap(template);
 assert.deepEqual(valid.errors,[]);
 assert.equal(valid.mapped,100);
 assert.equal(SEPARATOR,"│");
 assert.notEqual(SEPARATOR,"|");
 assert.equal(formatTargetName(TOP_LEVEL,"welcome"),"👋│welcome");
 assert.equal(formatTargetName("DEVELOPMENT BOARD","bug-reports"),"🐛│bug-reports");
 assert.equal(formatTargetName("MAIN COMMS","suggestions"),"💡│suggestions");
 assert.equal(formatTargetName("VOICE CHANNELS","BSA Assembly"),"🎙️│BSA Assembly");
 assert.equal(formatTargetName("GENERAL STAFF SECTOR","documents"),"📄│documents");
 assert.equal(formatTargetName("ARMY HEADQUARTERS","bot-cmds"),"🤖│bot-cmds");
 assert.equal(formatTargetName("LOGGING SECTOR","server-logs"),"🛡️│server-logs");
 assert.equal(Object.keys(BSA_CHANNEL_EMOJIS).length,17);
});
test("100 existing plain channels produce exact scoped rename candidates, categories remain untouched",()=>{
 const f=fixture();const p=planBsaFormat(template,f.channels,f.me);
 assert.equal(p.summary.rename,100);
 assert.equal(p.summary.unchanged,0);
 assert.equal(p.summary.missing,0);
 assert.equal(p.summary.conflicts,0);
 assert.equal(p.summary.unmatched,0);
 const match=p.changes.filter(c=>c.original==="bot-cmds");
 assert.equal(match.length,2);
 assert.notEqual(match[0].id,match[1].id);
 assert.notEqual(match[0].parentId,match[1].parentId);
 assert.equal(f.counts().writes,0);
});
test("preview is read-only, confirmation only renames, rerunning skips all 100 channels",async()=>{
 const f=fixture();
 const untouched=new Map([...f.channels].map(([id,c])=>[id,{
   parentId:c.parentId,type:c.type,position:c.position,
   permissionOverwrites:c.permissionOverwrites,messageCount:c.messageCount,
   webhookCount:c.webhookCount,connectedIntegration:c.connectedIntegration
 }]));
 const cmd=getBsaFormatCommand();
 assert.equal(cmd.name,"bsa-format");assert.equal(cmd.default_member_permissions,"0");
 assert.deepEqual(cmd.contexts,[0]);assert.deepEqual(cmd.integration_types,[0]);
 const i=command(f.guild);
 assert.equal(await handleBsaFormatInteraction(i,env),true);
 assert.equal(f.counts().writes,0);
 const preview=lastReply(i);
 assert.match(preview.content,/100 channel\(s\) to rename/);
 assert.equal(preview.files.length,1);
 const token=preview.components[0].toJSON().components[0].custom_id;
 assert.match(token,/^bsaformat:apply:/);
 const privateReply=i.events.find(([type])=>type==="defer")[1];
 assert.equal(privateReply.flags,64);
 const b=button(f.guild,token);
 assert.equal(await handleBsaFormatInteraction(b,env),true);
 assert.equal(f.counts().writes,100);
 assert.match(lastReply(b).content,/Renamed 100/);
 for(const [id,c] of f.channels){
   const snap=untouched.get(id);
   for(const key of Object.keys(snap)) assert.equal(c[key],snap[key],id+" "+key);
   if(c.type!==ChannelType.GuildCategory) assert.match(c.name,/│/u);
 }
 const again=command(f.guild);
 assert.equal(await handleBsaFormatInteraction(again,env),true);
 assert.match(lastReply(again).content,/0 channel\(s\) to rename/);
 assert.equal(lastReply(again).components.length,0);
 assert.equal(f.counts().writes,100);
});
test("already formatted, missing, unmatched and type mismatch report without guessing",()=>{
 const f=fixture();
 const original=[...f.channels.values()].find(c=>c.name==="welcome");
 original.name="👋│welcome";
 const missing=[...f.channels.values()].find(c=>c.name==="memes");
 f.channels.delete(missing.id);
 f.channel("mystery-log",ChannelType.GuildText);
 const wrong=[...f.channels.values()].find(c=>c.name==="suggestions");
 wrong.type=ChannelType.GuildText;
 const blocked=[...f.channels.values()].find(c=>c.name==="officer-chat");
 blocked.denyManage=true;
 const p=planBsaFormat(template,f.channels,f.me);
 assert.equal(p.summary.unchanged,1);
 assert.equal(p.summary.missing,1);
 assert.ok(p.conflicts.some(x=>x.original==="suggestions"&&x.reason.includes("type mismatch")));
 assert.ok(p.conflicts.some(x=>x.original==="officer-chat"&&x.reason.includes("Manage Channels")));
 assert.ok(p.unmatched.some(x=>x.name==="mystery-log"));
 assert.ok(p.changes.every(x=>x.id!==wrong.id&&x.id!==blocked.id));
});
test("same old and formatted channel within one category is a conflict, not a random choice",()=>{
 const f=fixture();const categories=[...f.channels.values()].find(x=>x.name==="OFFICER STAFF SECTOR");
 f.channel("📄│documents",ChannelType.GuildText,categories.id);
 const p=planBsaFormat(template,f.channels,f.me);
 assert.ok(p.conflicts.some(x=>x.section==="OFFICER STAFF SECTOR"&&x.original==="documents"));
 assert.ok(p.changes.some(x=>x.section==="GENERAL STAFF SECTOR"&&x.original==="documents"));
});
test("wrong guild, other owner or TARC ID conflict fails before even reading BSA metadata",async()=>{
 const f=fixture();
 for(const [caller,target,config] of [
   ["888888888888888888",GUILD,env],
   [OWNER,TARC,env],
   [OWNER,GUILD,{...env,BSA_GUILD_ID:TARC}]
 ]){
   const i=command(f.guild,caller,target);
   const before=f.counts().fetches;
   assert.equal(await handleBsaFormatInteraction(i,config),true);
   assert.equal(f.counts().fetches,before);
   assert.equal(f.counts().writes,0);
   assert.equal(i.events[0][0],"reply");
   assert.equal(i.events[0][1].flags,64);
   assert.equal(i.events[0][1].files,undefined);
 }
});
test("a different user cannot reuse the owner's confirmation button",async()=>{
 const f=fixture();
 const preview=command(f.guild);await handleBsaFormatInteraction(preview,env);
 const token=lastReply(preview).components[0].toJSON().components[0].custom_id;
 const outsider=button(f.guild,token,"888888888888888888");
 await handleBsaFormatInteraction(outsider,env);
 assert.equal(f.counts().writes,0);
 assert.equal(outsider.events[0][0],"reply");
});
test("per-channel action is race-safe if channel is moved or renamed after preview",async()=>{
 const f=fixture();const p=planBsaFormat(template,f.channels,f.me);
 const first=p.changes[0],second=p.changes[1],third=p.changes[2];
 f.channels.get(first.id).parentId="333333333333333333";
 f.channels.get(second.id).name="changed-by-user";
 f.channels.get(third.id).denyManage=true;
 const report=await applyBsaFormatChanges(f.guild,p.changes.slice(0,3),f.me);
 assert.equal(report.renamed.length,0);
 assert.equal(report.skipped.length,3);
 assert.equal(f.counts().writes,0);
});

test("guild-only immediate registration is restricted to BSA and uses a valid guild command payload",()=>{
 const data=getBsaGuildFormatRegistration(env);
 assert.ok(data);
 assert.equal(data.guildId,GUILD);
 assert.equal(data.command.name,"bsa-format");
 assert.equal(data.command.default_member_permissions,"0");
 assert.equal(data.command.integration_types,undefined);
 assert.equal(data.command.contexts,undefined);
 assert.equal(data.command.dm_permission,undefined);
 assert.equal(getBsaGuildFormatRegistration({...env,BSA_GUILD_ID:TARC}),null);
 assert.equal(getBsaGuildFormatRegistration({...env,TARC_MAIN_GUILD_ID:GUILD}),null);
 assert.equal(getBsaGuildFormatRegistration({...env,BSA_OWNER_DISCORD_ID:""}),null);
 assert.equal(getBsaGuildFormatRegistration({BSA_GUILD_ID:GUILD,BSA_OWNER_DISCORD_ID:OWNER}),null);
});
test("server uses single guild command POST and verifies registration without bulk-overwriting BSA",async()=>{
 const server=await readFile(new URL("../server.js",import.meta.url),"utf8");
 assert.match(server,/getBsaGuildFormatRegistration\(\)/);
 assert.match(server,/await rest\.post\(route, \{ body: bsaFormatRegistration\.command \}\)/);
 assert.match(server,/await rest\.get\(route\)/);
 assert.doesNotMatch(server,/rest\.put\(Routes\.applicationGuildCommands\(CLIENT_ID, bsaFormatRegistration\.guildId\)/);
});
