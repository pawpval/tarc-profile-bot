import {createHash,randomBytes} from "node:crypto";
import {
  ActionRowBuilder,AttachmentBuilder,ButtonBuilder,ButtonStyle,
  MessageFlags,Routes,SlashCommandBuilder
} from "discord.js";
import {builderCredentials,allowedRegimentalTarget} from "./regimentalCommands.js";
import {getRevisedPresets} from "./regimentalRevampTemplates.js";
import {
  RTR_ROLE_LOCK,liveRtrRoleSnapshot,performRtrRoleRework
} from "./rtrRoleOnlyCore.js";

const ID=/^\d{17,20}$/;
const COMMAND="bsa-rtr-rework";
const PRIVATE={flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}};
const pending=new Map(),busy=new Set(),TTL=10*60*1000;
const text=x=>String(x??"").trim();
const reportFile=(obj,name)=>new AttachmentBuilder(
  Buffer.from(JSON.stringify(obj,null,2),"utf8"),{name});
const summary=(items,max=6)=>items.length?items.slice(0,max).map(x=>"• "+x).join("\n")+
  (items.length>max?"\n…and "+(items.length-max)+" more in the private JSON.":""):"None";
export const getRtrReworkCommand=()=>{
  const command=new SlashCommandBuilder().setName(COMMAND)
    .setDescription("Owner-only: preview and update RTR ROLES without rebuilding channels")
    .setDMPermission(false).setDefaultMemberPermissions(0n).toJSON();
  command.integration_types=[0];command.contexts=[0];
  return command;
};
function guildCommand(){
  const x={...getRtrReworkCommand()};
  delete x.integration_types;delete x.contexts;delete x.dm_permission;
  return x;
}
export async function rtrConfiguration(env=process.env){
  const pack=await getRevisedPresets();
  const sourceIds=Object.values(pack).map(x=>x.reference_source.guild_id);
  const creds=builderCredentials(env,sourceIds);
  const rtrId=text(env.BSA_RTR_GUILD_ID);
  const errors=[...creds.issues];
  if(!ID.test(rtrId))
    errors.push("Set BSA_RTR_GUILD_ID in Railway to the EXISTING RTR server ID. Never use the main BSA or TARC ID.");
  if(rtrId&&creds.protectedIds.has(rtrId))
    errors.push("BSA_RTR_GUILD_ID is a protected main BSA/TARC/source guild and is not allowed.");
  return {...creds,rtrId,errors};
}
async function auth(i,env){
  const config=await rtrConfiguration(env);
  if(i.user?.id!==config.ownerId)
    return {guild:null,error:"Only the configured BSA bot owner can use this command."};
  if(config.errors.length)
    return {guild:null,error:"RTR role-rework configuration incomplete:\n"+
      summary(config.errors)};
  if(!i.inGuild?.()||text(i.guildId)!==config.rtrId)
    return {guild:null,error:"This command operates ONLY in the configured RTR guild. No changes made."};
  const guild=i.guild?await i.guild.fetch():await i.client.guilds.fetch(config.rtrId);
  if(!allowedRegimentalTarget(config,{inGuild:true,guildId:guild.id,
    userId:i.user.id,guildOwnerId:guild.ownerId}))
    return {guild:null,error:"Your Discord account must own this exact RTR server."};
  return {guild,config,error:null};
}
function hashPlan(plan){
  return createHash("sha256").update(JSON.stringify({
    guildId:plan.guildId,roleSnapshot:plan.roleSnapshot,
    rolesToCreate:plan.rolesToCreate,rolesToRename:plan.rolesToRename,
    order:plan.roleOrderTopToBottom,memberEnumeration:plan.memberEnumeration,
    botHighestRole:plan.botHighestRole
  })).digest("hex");
}
const buttons=nonce=>[new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId("rtrrole:apply:"+nonce)
    .setLabel("Confirm RTR role-only rework").setStyle(ButtonStyle.Danger),
  new ButtonBuilder().setCustomId("rtrrole:cancel:"+nonce)
    .setLabel("Cancel").setStyle(ButtonStyle.Secondary)
)];
function preview(guild,plan){
  const changes=plan.rolesToRename.map(r=>r.from+" → "+r.to+
    " (ID "+r.id+", "+(r.memberCount===null?"holder count unavailable":
      r.memberCount+" current holder(s)")+")");
  return [
    "**Royal Tank Regiment — ROLE-ONLY REWORK PREVIEW**",
    "Server: **"+guild.name+"** (ID "+guild.id+"). This exact ID must match Railway BSA_RTR_GUILD_ID.",
    "**Roles:** "+plan.actions.create+" create, "+plan.actions.rename+" rename, "+
      (plan.needsReorder?"hierarchy reorder required":"hierarchy already in order")+".",
    "**Approved mapping:**\n"+summary(changes,3),
    plan.rolesToCreate.length?"**New roles:** "+plan.rolesToCreate.map(r=>r.name).join(", "):null,
    "**Role holders:** "+(plan.roleHolderCountStatus==="verified"?
      "counts verified against the live server":
      "counts unavailable; the command will NOT rename an existing held role without verification")+".",
    "**Qualifications:** Tank Gunner & Tank Driver are PEERS, not promotion ranks. "+
      "Training Instructor & Recruiting Staff remain functional roles, without extra permissions.",
    "**Full intended rank order:** Field Marshal at the top, followed by HQ, "+
      "Commanding Officer, executive/leadership, crew and training roles.",
    "**No changes to:** permissions, colours, channels, categories, overwrites, "+
      "messages, member assignments or other server settings. No role deletions.",
    plan.issues.length?"**BLOCKED ("+plan.issues.length+")**\n"+summary(plan.issues,4):
      "**Dry run passed. No writes yet.** Review the full mapping, old roles and holder counts in the private JSON.",
    plan.warnings.length?"**Notes:** "+plan.warnings[0]:null
  ].filter(Boolean).join("\n").slice(0,1910);
}
async function fail(i,message){
  const payload={content:String(message).slice(0,1900),components:[],files:[],
    allowedMentions:{parse:[]}};
  try{
    if(i.deferred||i.replied)return await i.editReply(payload);
    return await i.reply({...payload,...PRIVATE});
  }catch{}
}
export async function handleRtrRoleOnlyInteraction(i,env=process.env){
  const command=i.isChatInputCommand?.()&&i.commandName===COMMAND;
  const button=i.isButton?.()&&text(i.customId).startsWith("rtrrole:");
  if(!command&&!button)return false;
  try{
    const {guild,error}=await auth(i,env);
    if(error){await fail(i,error);return true;}
    if(button){
      const [prefix,action,nonce]=i.customId.split(":");
      const job=pending.get(nonce);
      if(prefix!=="rtrrole"||!["apply","cancel"].includes(action)||
        !job||job.guildId!==guild.id||job.userId!==i.user.id||
        job.expiresAt<Date.now()){
        await fail(i,"This RTR role-only confirmation expired or belongs to a different server.");
        return true;
      }
      if(action==="cancel"){
        pending.delete(nonce);
        await i.update({content:"RTR role-only rework cancelled. No changes made.",
          components:[],files:[],allowedMentions:{parse:[]}});
        return true;
      }
      if(busy.has(guild.id)){
        await fail(i,"Another RTR role-only rework is already in progress.");return true;
      }
      pending.delete(nonce);
      await i.deferUpdate();
      const current=await liveRtrRoleSnapshot(guild);
      if(!current.ok||hashPlan(current)!==job.hash){
        await fail(i,"RTR roles or memberships changed after the preview. No changes made. Run /bsa-rtr-rework again.");
        return true;
      }
      busy.add(guild.id);
      try{
        await i.editReply({content:"**RTR role-only rework running.** "+
          "Channels, colours, permissions and member role assignments will remain unchanged.",
          components:[],allowedMentions:{parse:[]}});
        let previousUpdate=0;
        const result=await performRtrRoleRework(guild,job.hash,hashPlan,async line=>{
          if(Date.now()-previousUpdate<12000)return;
          previousUpdate=Date.now();
          await i.editReply({content:"**Updating RTR roles only**\n"+line+
            "\nNo channel, permission or member changes are being made.",
            components:[]}).catch(()=>{});
        });
        const incomplete=result.errors.length>0||!result.reordered;
        await i.editReply({content:"**RTR role rework "+(incomplete?"INCOMPLETE":"VERIFIED")+"** "+
          result.created.length+" roles created, "+result.renamed.length+
          " role(s) renamed. **Hierarchy verified: "+(result.reordered?"YES":"NO")+"**. "+
          "No channels or member assignments changed."+
          (result.errors.length?"\n**Errors:**\n"+summary(result.errors,4):"")+
          "\nFull role ID/holder/position report attached.",
          components:[],files:[reportFile(result,"bsa-rtr-role-only-result.json")],
          allowedMentions:{parse:[]}});
      }finally{busy.delete(guild.id);}
      return true;
    }
    await i.deferReply({flags:MessageFlags.Ephemeral});
    const plan=await liveRtrRoleSnapshot(guild);
    let components=[];
    if(plan.ok&&!busy.has(guild.id)){
      for(const [nonce,item] of pending)if(item.expiresAt<Date.now())pending.delete(nonce);
      const nonce=randomBytes(16).toString("hex");
      pending.set(nonce,{guildId:guild.id,userId:i.user.id,
        hash:hashPlan(plan),expiresAt:Date.now()+TTL});
      components=buttons(nonce);
    }
    await i.editReply({content:preview(guild,plan),components,
      files:[reportFile({kind:"RTR-role-only-dry-run",
        scope:"ONLY RTR ROLE NAMES, MISSING ROLES AND HIERARCHY; NO CHANNEL/PERMISSION OR MEMBER MUTATION",
        plan},"bsa-rtr-role-only-preview.json")],allowedMentions:{parse:[]}});
    return true;
  }catch(e){
    console.error("[BSA RTR ROLE-ONLY] Discord/code:",String(e?.code??e?.status??"unknown"));
    await fail(i,"RTR role-only operation stopped safely (error "+
      String(e?.code??e?.status??"unknown")+"). No other BSA/TARC server is eligible.");
    return true;
  }
}

/** Upsert JUST this command into the exact Railway-configured RTR guild. */
export async function registerRtrRoleOnlyGuildCommand(rest,clientId,guild,env=process.env){
  const config=await rtrConfiguration(env);
  if(config.errors.length||text(guild?.id)!==config.rtrId)
    return {registered:false,reason:"invalid configuration or different guild"};
  const live=await guild.fetch();
  if(!allowedRegimentalTarget(config,{inGuild:true,guildId:live.id,
    userId:config.ownerId,guildOwnerId:live.ownerId}))
    return {registered:false,reason:"owner/protected guild validation failed"};
  const roles=await live.roles.fetch();
  const locks=[...roles.values()].filter(r=>/^BSA Builder \| [A-Z]+$/.test(r.name));
  if(locks.length!==1||locks[0].name!==RTR_ROLE_LOCK)
    return {registered:false,reason:"RTR builder lock not uniquely present"};
  const route=Routes.applicationGuildCommands(clientId,config.rtrId);
  await rest.post(route,{body:guildCommand()});
  const all=await rest.get(route);
  if(!Array.isArray(all)||!all.some(c=>c.name===COMMAND))
    throw Error("RTR command not verified after guild registration");
  return {registered:true,guildId:live.id};
}
