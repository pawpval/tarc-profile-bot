import {readFile} from "node:fs/promises";
import {createHash, randomBytes} from "node:crypto";
import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle,
  MessageFlags, PermissionFlagsBits, SlashCommandBuilder
} from "discord.js";
import {bsaAccessIssue,bsaConfiguration} from "./bsaCommands.js";
import {BSA_CHANNEL_EMOJIS,BSA_FORMAT_VERSION,validateBsaFormatMap} from "./channelFormatMap.js";
import {applyBsaFormatChanges,planBsaFormat} from "./channelFormatCore.js";

// TEMPORARY. Only /bsa-format; does not change the general /formatchannels tool.
const pending=new Map();
const working=new Set();
const EXPIRES_MS=10*60*1000;
const PRIVATE={flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}};
const slim=list=>list.length?list.slice(0,8).map(x=>"• "+x).join("\n")+
  (list.length>8?"\n…"+(list.length-8)+" more (download report).":""):"None";
const reportFile=(obj,name)=>new AttachmentBuilder(Buffer.from(JSON.stringify(obj,null,2),"utf8"),{name});
const shortError=e=>String(e?.code||"unknown");

export function getBsaFormatCommand() {
  const cmd=new SlashCommandBuilder().setName("bsa-format")
    .setDescription("Owner: preview and confirm BSA emoji channel formatting")
    .setDMPermission(false).setDefaultMemberPermissions(0n).toJSON();
  cmd.integration_types=[0];
  cmd.contexts=[0];
  return cmd;
}

// Guild commands appear immediately, unlike globally propagated new commands.
// This command must NEVER be registered on TARC or on an unconfigured guild.
export function getBsaGuildFormatRegistration(env=process.env) {
  const config=bsaConfiguration(env);
  const validId=/^\d{17,20}$/;
  if(!validId.test(config.targetId)||!validId.test(config.ownerId)||
     !validId.test(config.protectedId)||config.targetId===config.protectedId) return null;
  const command=getBsaFormatCommand();
  // These two properties are only valid for global application commands.
  delete command.integration_types;
  delete command.contexts;
  delete command.dm_permission;
  return {guildId:config.targetId,command};
}

async function loadTemplate() {
  const text=await readFile(new URL("./BSA_Server_Template_V4.json",import.meta.url),"utf8");
  const template=JSON.parse(text);
  const validation=validateBsaFormatMap(template);
  const fingerprint=createHash("sha256").update(text).update(JSON.stringify(BSA_CHANNEL_EMOJIS)).digest("hex");
  return {template,validation,fingerprint};
}

async function verifyTarget(i,config) {
  const issue=bsaAccessIssue(config,{inGuild:i.inGuild?.(),guildId:i.guildId,userId:i.user?.id});
  if(issue) return {guild:null,issue};
  const guild=i.guild ? await i.guild.fetch() : await i.client.guilds.fetch(config.targetId);
  if(guild.id!==config.targetId)
    return {guild:null,issue:"Discord returned the wrong server. BSA_GUILD_ID does not match."};
  if(String(guild.ownerId)!==config.ownerId)
    return {guild:null,issue:"Only the actual owner of this BSA Discord server can format it."};
  // Name checks are intentionally omitted. The immutable exact guild ID
  // remains authoritative even if BSA was renamed after building.
  return {guild,issue:null};
}

function signature(plan) {
  return createHash("sha256").update(JSON.stringify({
    changes:plan.changes,unchanged:plan.unchanged,missing:plan.missing,
    conflicts:plan.conflicts,unmatched:plan.unmatched
  })).digest("hex");
}

function summary(plan) {
  const {rename,unchanged,missing,conflicts,unmatched}=plan.summary;
  return "**"+rename+" channel(s) to rename**. "+
    unchanged+" already correct, "+missing+" missing, "+
    conflicts+" blocked/conflicting, "+unmatched+" unmatched extras.";
}

function asIssue(x) {return (x.section||"TOP LEVEL")+"/"+(x.original||x.name)+" — "+x.reason;}

async function safeErrorReply(i,message) {
  const p={content:message,components:[],files:[],allowedMentions:{parse:[]}};
  try{
    if(i.deferred||i.replied)return await i.editReply(p);
    return await i.reply({...p,...PRIVATE});
  }catch{/* Do not post publicly if the ephemeral interaction expired. */}
}

function confirmationButtons(token,count){
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("bsaformat:apply:"+token)
      .setLabel("Apply "+count+" rename"+(count===1?"":"s")).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("bsaformat:cancel:"+token)
      .setLabel("Cancel").setStyle(ButtonStyle.Secondary)
  )];
}

export async function handleBsaFormatInteraction(i,env=process.env) {
  const slash=i.isChatInputCommand?.() && i.commandName==="bsa-format";
  const button=i.isButton?.() && String(i.customId||"").startsWith("bsaformat:");
  if(!slash&&!button)return false;
  const config=bsaConfiguration(env);
  try {
    const early=bsaAccessIssue(config,{inGuild:i.inGuild?.(),guildId:i.guildId,userId:i.user?.id});
    if(early){await i.reply({content:early,...PRIVATE});return true;}
    if(button) {
      const [prefix,action,token]=i.customId.split(":");
      const item=pending.get(token);
      if(prefix!=="bsaformat"||!["apply","cancel"].includes(action)||!token||
        !item||item.userId!==i.user.id||item.guildId!==i.guildId||item.expires<Date.now()) {
        await i.reply({content:"Confirmation expired or invalid. Run /bsa-format again.",...PRIVATE});
        return true;
      }
      const {guild,issue}=await verifyTarget(i,config);
      if(!guild){pending.delete(token);await i.reply({content:issue,...PRIVATE});return true;}
      if(action==="cancel") {
        pending.delete(token);
        await i.update({content:"BSA channel formatting cancelled. No channels were renamed.",
          components:[],files:[],allowedMentions:{parse:[]}});
        return true;
      }
      if(working.has(guild.id)){
        await i.reply({content:"A BSA channel formatting operation is already running.",...PRIVATE});
        return true;
      }
      // Atomically consume the one-use confirmation before any write.
      pending.delete(token);
      await i.deferUpdate();
      const {template,validation,fingerprint}=await loadTemplate();
      if(!validation.ok||fingerprint!==item.templateFingerprint) {
        await safeErrorReply(i,"The BSA channel map or template changed. Nothing was renamed. Run /bsa-format again.");
        return true;
      }
      const bot=await guild.members.fetchMe();
      if(bot.permissions?.has?.(PermissionFlagsBits.ManageChannels)!==true){
        await safeErrorReply(i,"The bot needs Manage Channels in BSA. No channels were renamed.");
        return true;
      }
      const current=await guild.channels.fetch();
      const plan=planBsaFormat(template,current,bot);
      if(!plan.validation.ok||signature(plan)!==item.planFingerprint) {
        await safeErrorReply(i,"The channel names, parents or bot permissions changed since your preview. No channels were renamed. Run /bsa-format again.");
        return true;
      }
      working.add(guild.id);
      try {
        await i.editReply({
          content:"Applying **"+plan.changes.length+" confirmed BSA channel renames**. Only names will change.",
          components:[],files:[],allowedMentions:{parse:[]}
        });
        let progressAt=0;
        const results=await applyBsaFormatChanges(guild,plan.changes,bot,{
          onProgress:async ({done,total})=>{
            if(Date.now()-progressAt<14000)return;
            progressAt=Date.now();
            await i.editReply({content:"Formatting BSA channels: "+done+"/"+total+" attempted. "+
              "Only channel names are being changed.",components:[],allowedMentions:{parse:[]}}).catch(()=>{});
          }
        });
        const after=planBsaFormat(template,await guild.channels.fetch(),bot);
        const report={schema:"bsa-channel-format-report",version:1,
          guildId:guild.id,templateVersion:template.version,mapVersion:BSA_FORMAT_VERSION,
          planned:plan.summary,operation:results,remaining:after.summary,
          missing:after.missing,conflicts:after.conflicts,unmatched:after.unmatched};
        const content="**BSA formatting finished.** Renamed "+results.renamed.length+
          ", already formatted during operation "+results.alreadyCorrect.length+
          ", skipped "+results.skipped.length+", failed "+results.failed.length+"."+
          (results.timedOut?" Stopped at the safe time limit; rerun /bsa-format to finish.":"")+
          "\n"+summary(after)+" Full details attached.";
        await i.editReply({content,files:[reportFile(report,"bsa-channel-format-results.json")],
          components:[],allowedMentions:{parse:[]}});
      } finally {working.delete(guild.id);}
      return true;
    }

    await i.deferReply({flags:MessageFlags.Ephemeral});
    const {guild,issue}=await verifyTarget(i,config);
    if(!guild){await safeErrorReply(i,issue);return true;}
    const {template,validation,fingerprint}=await loadTemplate();
    if(!validation.ok) {
      await i.editReply({content:"The BSA channel mapping does not match approved V4. No names can be changed.",
        files:[reportFile(validation,"bsa-format-mapping-errors.json")],allowedMentions:{parse:[]}});
      return true;
    }
    const bot=await guild.members.fetchMe();
    const canManage=bot.permissions?.has?.(PermissionFlagsBits.ManageChannels)===true;
    const plan=planBsaFormat(template,await guild.channels.fetch(),bot);
    const fullReport={schema:"bsa-channel-format-preview",version:1,
      guildId:guild.id,guildName:guild.name,templateVersion:template.version,
      formatVersion:BSA_FORMAT_VERSION,mapValidation:plan.validation,
      counts:plan.summary,rename:plan.changes,alreadyCorrect:plan.unchanged,
      missing:plan.missing,conflicts:plan.conflicts,unmatched:plan.unmatched};
    const detail=[...plan.missing,...plan.conflicts,...plan.unmatched].map(asIssue);
    const samples=plan.changes.slice(0,9).map(x=>
      x.section+": "+x.before+" → "+x.after);
    const text=[
      "**BSA channel formatting preview** (no changes yet)",
      summary(plan),
      "**Samples**\n"+slim(samples),
      detail.length?"**Missing, blocked or unmatched**\n"+slim(detail):"All mapped channels were found without conflicts.",
      "**Every intended channel and rename is listed in the attached JSON.** Only the exact BSA guild can be modified, with your confirmation.",
      !canManage?"**BLOCKED:** Bot needs Manage Channels.":null,
      working.has(guild.id)?"**BLOCKED:** Another formatting operation is running.":null
    ].filter(Boolean).join("\n").slice(0,1920);
    const allowed=canManage&&!working.has(guild.id)&&plan.changes.length>0;
    let components=[];
    if(allowed){
      for(const [key,p] of pending) if(p.expires<Date.now())pending.delete(key);
      const token=randomBytes(15).toString("hex");
      pending.set(token,{userId:i.user.id,guildId:guild.id,expires:Date.now()+EXPIRES_MS,
        templateFingerprint:fingerprint,planFingerprint:signature(plan)});
      components=confirmationButtons(token,plan.changes.length);
    }
    await i.editReply({content:text,components,files:[reportFile(fullReport,"bsa-channel-format-preview.json")],
      allowedMentions:{parse:[]}});
    return true;
  } catch(e) {
    // Avoid logging private channel names, response bodies or tokens.
    console.error("[BSA FORMAT] code:",shortError(e));
    await safeErrorReply(i,"BSA channel formatting failed (code "+shortError(e)+"). No changes were attempted outside the configured BSA guild.");
    return true;
  }
}
