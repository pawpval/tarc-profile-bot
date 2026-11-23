import {createHash,randomBytes} from "node:crypto";
import {
 ActionRowBuilder,AttachmentBuilder,ButtonBuilder,ButtonStyle,
 MessageFlags,Routes,SlashCommandBuilder
} from "discord.js";
import {builderCredentials,allowedRegimentalTarget} from "./regimentalCommands.js";
import {getRevisedPresets} from "./regimentalRevampTemplates.js";
import {UKSF_GUILD_ID,UKSF_RTR_EXCLUDED,UKSF_BUILDER_ID} from "./uksfVerifiedLayout.js";
import {snapshotUksfLive,executeUksfOverhaul} from "./uksfOverhaulCore.js";

const NAME="bsa-uksf-rework";
const pending=new Map(),busy=new Set(),EXPIRES=10*60*1000;
const file=(object,name)=>new AttachmentBuilder(Buffer.from(JSON.stringify(object,null,2),"utf8"),{name});
const shorten=(items,count=4)=>items.length?items.slice(0,count).map(x=>"• "+x).join("\n")+
 (items.length>count?"\n…and "+(items.length-count)+" more in the private JSON.":""):"None";
export function getUksfReworkCommand(){
 const x=new SlashCommandBuilder().setName(NAME)
   .setDescription("Owner: preview/rework the VERIFIED UKSF guild without rebuilding channels")
   .setDMPermission(false).setDefaultMemberPermissions(0n).toJSON();
 x.integration_types=[0];x.contexts=[0];
 return x;
}
function localCommand(){
 const c={...getUksfReworkCommand()};
 delete c.integration_types;delete c.contexts;delete c.dm_permission;
 return c;
}
export async function uksfCredentials(env=process.env){
 const pack=await getRevisedPresets();
 const sourceIds=Object.values(pack).map(p=>p.reference_source.guild_id);
 const creds=builderCredentials(env,sourceIds);
 const errors=[...creds.issues];
 if(creds.protectedIds.has(UKSF_GUILD_ID)||UKSF_GUILD_ID===UKSF_RTR_EXCLUDED)
  errors.push("Verified UKSF guild collides with a protected TARC/BSA/source guild. Access denied.");
 return {...creds,errors};
}
async function auth(i,env){
 const creds=await uksfCredentials(env);
 if(i.user?.id!==creds.ownerId)
  return {guild:null,error:"Only the configured BSA owner can use the UKSF role overhaul."};
 if(creds.errors.length)
  return {guild:null,error:"UKSF security configuration incomplete:\n"+shorten(creds.errors)};
 if(!i.inGuild?.()||String(i.guildId)!==UKSF_GUILD_ID)
  return {guild:null,error:"UKSF overhaul ONLY works in verified server "+UKSF_GUILD_ID+"; no other BSA/TARC server is eligible."};
 const guild=i.guild?await i.guild.fetch():await i.client.guilds.fetch(UKSF_GUILD_ID);
 if(!allowedRegimentalTarget(creds,{
  inGuild:true,guildId:guild.id,userId:i.user.id,guildOwnerId:guild.ownerId
 }))
  return {guild:null,error:"UKSF rework requires the configured owner's Discord account and the actual guild owner."};
 return {guild,error:null};
}
export function hashUksfPlan(plan){
 return createHash("sha256").update(JSON.stringify({
  guildId:plan.guildId,roleSnapshot:plan.roleSnapshot,
  channelSnapshot:plan.channelSnapshot,memberSnapshot:plan.memberSnapshot,
  roleMappings:plan.roleMappings,memberTags:plan.memberTags,
  categoryPlans:plan.categoryPlans,channelPlans:plan.channelPlans
 })).digest("hex");
}
const buttons=id=>[new ActionRowBuilder().addComponents(
 new ButtonBuilder().setCustomId("uksf-rework:apply:"+id)
  .setLabel("Confirm UKSF-only overhaul").setStyle(ButtonStyle.Danger),
 new ButtonBuilder().setCustomId("uksf-rework:cancel:"+id)
  .setLabel("Cancel").setStyle(ButtonStyle.Secondary)
)];
function preview(guild,p){
 const s=p.summary;
 return [
  "**UKSF VERIFIED OVERHAUL — PRIVATE DRY RUN**",
  "Guild **"+guild.name+"** ("+guild.id+") — ONLY THIS verified UKSF server.",
  "**Functional ranks:** 12, with SAS and SRR as PEER branches; no extra operator ranks.",
  "**Proposed role changes:** "+s.newRanks+" new ranks, "+s.renamed+" safe legacy ID renames, "+
    s.newTags+" zero-privilege branch tags, "+s.permissions+" rank permission corrections.",
  "**Channel permissions:** "+s.categories+" existing categories and "+s.channels+
    " existing channels need overwrite updates. No channel creation, rename or deletion.",
  "**Member migrations:** "+s.membersToTag+" already-verified SAS/SRR rank holders to tag; "+
    s.memberTagConflicts+" branch conflicts need manual review. No primary rank changed.",
  "**Preserved:** "+s.preservedOldRoles+" legacy roles (some may have holders), protected HQ/oversight, "+
    "all channel IDs/messages/webhooks and non-UKSF roles.",
  "**SAS/SRR private channels:** None were in the verified scan. None will be invented.",
  p.issues.length?"**BLOCKED ("+p.issues.length+")**\n"+shorten(p.issues,4):
    "**Preflight passed; NO CHANGES MADE YET.** Inspect the private JSON report before confirming.",
  p.warnings.length?"**Review:** "+p.warnings[0]:null,
  "The attached report contains original/new role IDs, affected holders, permission overwrite diffs, "+
    "simulated guest/trainee/Operator/SAS/SRR/staff/command access and rollback data."
 ].filter(Boolean).join("\n").slice(0,1950);
}
async function fail(i,msg){
 const p={content:String(msg).slice(0,1900),components:[],files:[],
  allowedMentions:{parse:[]}};
 try{if(i.deferred||i.replied)return await i.editReply(p);
  return await i.reply({...p,flags:MessageFlags.Ephemeral});
 }catch{}
}
export async function handleUksfReworkInteraction(i,env=process.env){
 const command=i.isChatInputCommand?.()&&i.commandName===NAME;
 const button=i.isButton?.()&&String(i.customId??"").startsWith("uksf-rework:");
 if(!command&&!button)return false;
 try{
  const {guild,error}=await auth(i,env);
  if(error){await fail(i,error);return true;}
  if(button){
   const [prefix,action,id]=i.customId.split(":");
   const job=pending.get(id);
   if(prefix!=="uksf-rework"||!["apply","cancel"].includes(action)||
      !job||job.expiresAt<Date.now()||job.userId!==i.user.id||job.guildId!==guild.id){
    await fail(i,"UKSF confirmation expired or does not belong to this owner/server.");
    return true;
   }
   pending.delete(id);
   if(action==="cancel"){
    await i.update({content:"UKSF overhaul cancelled. No changes made.",
      components:[],files:[],allowedMentions:{parse:[]}});
    return true;
   }
   if(busy.has(guild.id)){await fail(i,"Another UKSF overhaul is already running.");return true;}
   await i.deferUpdate();
   const latest=await snapshotUksfLive(guild);
   if(!latest.ok||hashUksfPlan(latest)!==job.hash){
    await fail(i,"UKSF roles, members, or channel permissions changed since preview. "+
     "No changes made. Run /bsa-uksf-rework again.");
    return true;
   }
   busy.add(guild.id);
   try{
    await i.editReply({content:"**Applying owner-confirmed UKSF-only overhaul.** "+
      "Existing channel IDs/messages, other BSA servers and unrelated roles are untouched.",
      components:[],allowedMentions:{parse:[]}});
    let last=0;
    const report=await executeUksfOverhaul(guild,job.hash,hashUksfPlan,async step=>{
     if(Date.now()-last<12000)return;
     last=Date.now();
     await i.editReply({content:"**UKSF overhaul**\n"+step+
       "\nNo channels are recreated or deleted.",components:[]}).catch(()=>{});
    });
    const ok=report.completed===true&&report.errors.length===0;
    await i.editReply({
      content:"**UKSF OVERHAUL "+(ok?"COMPLETE":"INCOMPLETE")+"** "+
       report.created.length+" roles created, "+report.renamed.length+" repurposed by ID, "+
       report.permissionsUpdated.length+" role permissions updated; "+
       report.categoriesUpdated.length+" category and "+report.channelsUpdated.length+
       " channel overwrite updates. "+report.memberTagsAdded.length+
       " verified branch tags added. **Hierarchy verified: "+
       (report.hierarchy?.verified?"YES":"NO")+"**. "+
       "No primary ranks automatically promoted, no channel/content deletion."+
       (report.errors.length?"\n**Errors:**\n"+shorten(report.errors,4):"")+
       "\nFull before/after and rollback mapping in the private JSON.",
      components:[],files:[file(report,"bsa-uksf-overhaul-result.json")],
      allowedMentions:{parse:[]}
    });
   }finally{busy.delete(guild.id);}
   return true;
  }
  await i.deferReply({flags:MessageFlags.Ephemeral});
  const p=await snapshotUksfLive(guild);
  let controls=[];
  if(p.ok&&!busy.has(guild.id)){
   for(const [id,j] of pending)if(j.expiresAt<Date.now())pending.delete(id);
   const id=randomBytes(15).toString("hex");
   pending.set(id,{hash:hashUksfPlan(p),guildId:guild.id,userId:i.user.id,
    expiresAt:Date.now()+EXPIRES});
   controls=buttons(id);
  }
  await i.editReply({content:preview(guild,p),components:controls,
   files:[file({kind:"UKSF-verified-overhaul-preview",plan:p,
    note:"No channel structure changes. No automatic guesses about old role members or branch identity."},
    "bsa-uksf-overhaul-preview.json")],allowedMentions:{parse:[]}});
  return true;
 }catch(e){
  console.error("[UKSF OVERHAUL] Error code:",String(e?.code??e?.status??"unknown"));
  await fail(i,"UKSF overhaul stopped safely (error code "+String(e?.code??e?.status??"unknown")+
   "). No other BSA/TARC server is eligible.");
  return true;
 }
}
export async function registerUksfReworkGuildCommand(rest,clientId,guild,env=process.env){
 const creds=await uksfCredentials(env);
 if(creds.errors.length||String(guild?.id)!==UKSF_GUILD_ID)
  return {registered:false,reason:"Not verified UKSF ID/security config"};
 const live=await guild.fetch();
 if(!allowedRegimentalTarget(creds,{
  inGuild:true,guildId:live.id,userId:creds.ownerId,guildOwnerId:live.ownerId
 }))return {registered:false,reason:"Not owner-controlled verified UKSF guild"};
 const roles=await live.roles.fetch();
 if(!roles.get(UKSF_BUILDER_ID)||roles.get(UKSF_BUILDER_ID).name!=="BSA Builder | UKSF")
  return {registered:false,reason:"UKSF builder marker missing/mismatched"};
 const route=Routes.applicationGuildCommands(clientId,UKSF_GUILD_ID);
 await rest.post(route,{body:localCommand()});
 const current=await rest.get(route);
 if(!Array.isArray(current)||!current.some(c=>c.name===NAME))
  throw Error("UKSF rework command not verified after registration");
 return {registered:true,guildId:UKSF_GUILD_ID};
}
