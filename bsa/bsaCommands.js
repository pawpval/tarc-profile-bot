import { readFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
  PermissionFlagsBits, SlashCommandBuilder
} from "discord.js";
import {validateBsaTemplate} from "./builderCore.js";
import {auditBsaGuild,bsaPreflight,buildBsaGuild,inspectBsaPlan} from "./builderEngine.js";

// This entire module is temporary. Removing its import, command registration,
// router hook and bsa/ folder does not undo Discord objects already created.
const pending = new Map(); // In-memory only, short-lived explicit confirmations.
const busy = new Set();
const VALID_ID = /^\d{17,20}$/;
const MAX_PENDING_MS=10*60*1000;
const ephemeral = {flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}};
const clean = v=>String(v||"").trim();
const safeError = e=>String(e?.message||e?.code||"Unknown error").slice(0,1300);
const joined = (items,max=8)=>items.slice(0,max).map(x=>"• "+x).join("\n")+(items.length>max?"\n… "+(items.length-max)+" more in attachment.":"");

export function bsaConfiguration(env=process.env) {
  const guildIds=clean(env.GUILD_IDS).split(",").map(x=>x.trim()).filter(Boolean);
  return {
    targetId:clean(env.BSA_GUILD_ID),
    ownerId:clean(env.BSA_OWNER_DISCORD_ID||env.TARC_SCAN_OWNER_ID),
    protectedId:clean(env.TARC_MAIN_GUILD_ID||env.GUILD_ID||guildIds[0])
  };
}
export function bsaTargetAllowed(config,context) {
  return VALID_ID.test(config.targetId) && VALID_ID.test(config.ownerId)
    && VALID_ID.test(config.protectedId)
    && config.targetId!==config.protectedId
    && context.guildId===config.targetId && context.userId===config.ownerId
    && context.guildOwnerId===config.ownerId
    && context.guildName==="British Sandhurst Army | BSA";
}
export function getBsaCommands() {
  return [["bsa-preview","Preview all roles, channels and permissions without changes"],
    ["bsa-build","Owner: confirm and create the approved BSA server layout"],
    ["bsa-audit","Compare this BSA server against its approved template"]].map(([name,desc])=>{
    const c=new SlashCommandBuilder().setName(name).setDescription(desc)
      .setDMPermission(false).setDefaultMemberPermissions(0n).toJSON();
    c.integration_types=[0];c.contexts=[0];return c;
  });
}
async function templateData() {
  const contents=await readFile(new URL("./BSA_Server_Template_V4.json",import.meta.url),"utf8");
  const parsed=JSON.parse(contents);
  return {template:parsed,hash:createHash("sha256").update(contents).digest("hex")};
}
async function authenticate(interaction, config) {
  if (!interaction.inGuild?.() || !VALID_ID.test(config.targetId) || !VALID_ID.test(config.protectedId)
    || !VALID_ID.test(config.ownerId) || config.targetId===config.protectedId
    || String(interaction.guildId)!==config.targetId || interaction.user?.id!==config.ownerId) return null;
  const guild=interaction.guild ? await interaction.guild.fetch() : await interaction.client.guilds.fetch(config.targetId);
  if (!bsaTargetAllowed(config,{guildId:interaction.guildId,userId:interaction.user.id,
    guildOwnerId:String(guild.ownerId),guildName:String(guild.name)})) return null;
  return guild;
}
const reportAttachment=(obj,name)=>new AttachmentBuilder(
  Buffer.from(JSON.stringify(obj,null,2),"utf8"),{name}
);
const replyError=async(i,message)=>{
  const p={content:message,allowedMentions:{parse:[]},components:[],files:[]};
  try{
    if(i.deferred||i.replied)return await i.editReply(p);
    return await i.reply({...p,...ephemeral});
  }catch{ /* No public fallbacks for sensitive controls. */ }
};
function confirmationRow(nonce) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("bsa:confirm:"+nonce).setLabel("Confirm BSA Build")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("bsa:cancel:"+nonce).setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary)
  );
}
function previewText(template,validation,preflight,plan,hash) {
  const e=[...validation.errors,...(preflight?.errors||[]),...(plan?.conflicts||[])];
  const w=[...validation.warnings,...(preflight?.warnings||[])];
  return {
    content:[
      "**BSA V4 full configuration preview (read-only)**",
      "Target: **"+template.server_name+"**. SHA-256: \`"+hash.slice(0,14)+"\`.",
      "**"+validation.counts.roles+" roles • "+validation.counts.categories+" categories • "+validation.counts.channels+" channels**"+
      " ("+validation.counts.text+" text, "+validation.counts.voice+" voice, "+validation.counts.forum+" forum, "+validation.counts.stage+" Stage).",
      "Creates/reuses: "+(plan?plan.createRoles.length+" roles, "+plan.createCategories.length+
      " categories, "+plan.createChannels.length+" channels to create.":"Server state unavailable."),
      e.length?"**BLOCKED: "+e.length+" error(s)**\n"+joined(e,5):
        "**Validation passed.** Role and channel access comes from explicit JSON lists.",
      w.length?"**Warnings ("+w.length+")**\n"+joined(w,3):null,
      "The attached JSON contains the complete ordered role colours, hierarchy, every category, channel type, and each role's view/post permissions.",
      "Preview performs no server changes."
    ].filter(Boolean).join("\n").slice(0,1950),errors:e,warnings:w
  };
}
export async function handleBsaInteraction(i,env=process.env) {
  const isSlash=i.isChatInputCommand?.()&&["bsa-preview","bsa-build","bsa-audit"].includes(i.commandName);
  const isButton=i.isButton?.()&&String(i.customId||"").startsWith("bsa:");
  if(!isSlash&&!isButton)return false;
  const config=bsaConfiguration(env);
  const denied="BSA builder access denied or Railway configuration incomplete. Set BSA_GUILD_ID and BSA_OWNER_DISCORD_ID; the target must be your fresh BSA server, never TARC.";
  try {
    // Reject untrusted user/guild BEFORE loading template or exposing channel names.
    if(!i.inGuild?.()||i.user?.id!==config.ownerId||i.guildId!==config.targetId
      ||!VALID_ID.test(config.protectedId)||config.targetId===config.protectedId
      ||!VALID_ID.test(config.ownerId)||!VALID_ID.test(config.targetId)) {
      if(isButton) await i.reply({content:denied,...ephemeral});
      else await i.reply({content:denied,...ephemeral});
      return true;
    }
    if(isButton) {
      const [prefix,action,nonce]=i.customId.split(":");
      if(prefix!=="bsa"||!["confirm","cancel"].includes(action)||!nonce||!pending.has(nonce)) {
        await i.reply({content:"This build confirmation has expired. Use /bsa-build again.",...ephemeral});
        return true;
      }
      const request=pending.get(nonce);
      if(request.userId!==i.user.id||request.guildId!==i.guildId||Date.now()>request.expiresAt) {
        pending.delete(nonce);
        await i.reply({content:"This confirmation is not valid for this account or server.",...ephemeral});
        return true;
      }
      const guild=await authenticate(i,config);
      if(!guild) {pending.delete(nonce);await i.reply({content:denied,...ephemeral});return true;}
      if(action==="cancel"){pending.delete(nonce);await i.update({content:"BSA build cancelled. No server changes were made.",components:[],files:[]});return true;}
      if(busy.has(guild.id)) {await i.reply({content:"A BSA build is already running.",...ephemeral});return true;}
      // A button can only be used once. Require a new /bsa-build to retry.
      pending.delete(nonce);
      await i.deferUpdate();
      const {template,hash}=await templateData();
      if(hash!==request.templateHash) {await replyError(i,"The template changed since confirmation. Run /bsa-preview and /bsa-build again.");return true;}
      const validation=validateBsaTemplate(template);
      if(!validation.ok){await replyError(i,"Template errors must be fixed before building:\n"+joined(validation.errors,7));return true;}
      busy.add(guild.id);
      try {
        const pf=await bsaPreflight(guild,template,validation);
        if(!pf.ok){await replyError(i,"Build stopped before changes. Problems:\n"+joined(pf.errors,10));return true;}
        const plan=inspectBsaPlan(guild,template,pf.existingRoles,pf.existingChannels);
        if(plan.conflicts.length){await replyError(i,"Existing layout conflicts must be resolved manually:\n"+joined(plan.conflicts,10));return true;}
        await i.editReply({content:"Building the **BSA guild only**. Roles and channels are being created; no existing objects will be deleted.",
          components:[],allowedMentions:{parse:[]}});
        let last=0;
        const report=await buildBsaGuild(guild,template,async message=>{
          if(Date.now()-last<12000)return;
          last=Date.now();
          await i.editReply({content:"**BSA build in progress**\n"+message,components:[]}).catch(()=>{});
        });
        const audit=await auditBsaGuild(guild,template);
        await i.editReply({
          content:"**BSA build finished.** Created "+report.createdRoles.length+" roles, "+
            report.createdCategories.length+" categories, "+report.createdChannels.length+
            " channels. Renamed "+report.renamedChannels.length+". "+
            "Audit: "+audit.issues.length+" issue(s). See private report; reruns reuse existing objects.",
          files:[reportAttachment({report,audit},"bsa-build-report.json")],components:[],
          allowedMentions:{parse:[]}
        });
      } finally {busy.delete(guild.id);}
      return true;
    }
    await i.deferReply({flags:MessageFlags.Ephemeral});
    const guild=await authenticate(i,config);
    if(!guild){await replyError(i,denied);return true;}
    const {template,hash}=await templateData();
    const validation=validateBsaTemplate(template);
    if(i.commandName==="bsa-audit"){
      const audit=await auditBsaGuild(guild,template);
      await i.editReply({
        content:"**BSA read-only audit**\n"+audit.matchedRoles+"/"+audit.expected.roles+" roles, "+
          audit.foundChannels+"/"+audit.expected.channels+" channels found. "+
          audit.issues.length+" mismatch(es)."+
          (audit.issues.length?"\n"+joined(audit.issues,9):"\nLayout matches the checked configuration."),
        files:[reportAttachment(audit,"bsa-audit.json")],allowedMentions:{parse:[]}
      });return true;
    }
    const preflight=await bsaPreflight(guild,template,validation);
    const plan=inspectBsaPlan(guild,template,preflight.existingRoles,preflight.existingChannels);
    const preview=previewText(template,validation,preflight,plan,hash);
    if(i.commandName==="bsa-preview") {
      await i.editReply({content:preview.content,
        files:[reportAttachment({template,validation,preflight:{ok:preflight.ok,errors:preflight.errors,warnings:preflight.warnings},plan},
          "bsa-preview-full.json")],allowedMentions:{parse:[]}});return true;
    }
    const blockers=[...validation.errors,...preflight.errors,...plan.conflicts];
    if(blockers.length){
      await i.editReply({content:"**BSA build blocked before changes.**\n"+joined(blockers,12)+
        "\nRun /bsa-preview for the full configuration and diagnostics.",
        files:[reportAttachment({blockers,validation,plan},"bsa-build-blockers.json")],allowedMentions:{parse:[]}});return true;
    }
    if(busy.has(guild.id)) {await replyError(i,"Another BSA build is running.");return true;}
    const nonce=randomBytes(14).toString("hex");
    for(const [k,v] of pending) if(Date.now()>v.expiresAt) pending.delete(k);
    pending.set(nonce,{userId:i.user.id,guildId:guild.id,templateHash:hash,expiresAt:Date.now()+MAX_PENDING_MS});
    const text="**Confirm BSA server creation**\nOnly this guild: **"+guild.name+"** (\`"+guild.id+"\`). "+
      "Template V4, "+validation.counts.roles+" roles, "+validation.counts.categories+" categories, "+
      validation.counts.channels+" channels.\n"+
      "Pending creations: "+plan.createRoles.length+" roles, "+plan.createCategories.length+
      " categories, "+plan.createChannels.length+" channels. Existing matching objects are reused. "+
      "No roles or channels will be deleted. No webhooks will be configured. "+
      "The confirmation expires in ten minutes.";
    await i.editReply({content:text,components:[confirmationRow(nonce)],allowedMentions:{parse:[]}});return true;
  }catch(e) {
    // Never leak tokens, raw API payloads, or inaccessible channel names to logs.
    console.error("[BSA BUILDER] command failed; code:",String(e?.code||"unknown"));
    await replyError(i,"BSA operation failed safely. "+safeError(e)+". No changes are ever made outside the configured BSA guild.");
    return true;
  }
}
