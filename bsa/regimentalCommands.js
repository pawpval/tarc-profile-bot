import {createHash,randomBytes} from "node:crypto";
import {
  ActionRowBuilder,AttachmentBuilder,ButtonBuilder,ButtonStyle,
  MessageFlags,Routes,SlashCommandBuilder
} from "discord.js";
import {REVISED_CODES as REGIMENT_CODES,getRevisedPresets,revisedHash} from "./regimentalRevampTemplates.js";
import {revampLock as markerName,previewRevisedGuild,revampRegimentalGuild,auditRevisedGuild} from "./regimentalRevampEngine.js";
import {UKSF_GUILD_ID} from "./uksfVerifiedLayout.js";

const ID=/^\d{17,20}$/;
const PRIVATE={flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}};
const pending=new Map(),busy=new Set();
const EXPIRES_MS=10*60*1000;
const clean=x=>String(x||"").trim();
const brief=(items,max=7)=>items.length?items.slice(0,max).map(x=>"• "+x).join("\n")+
  (items.length>max?"\n…and "+(items.length-max)+" more in the attached JSON.":""):"None";
const attachment=(object,name)=>new AttachmentBuilder(
  Buffer.from(JSON.stringify(object,null,2),"utf8"),{name});

export function builderCredentials(env=process.env,sources=[]){
  const ownerId=clean(env.BSA_BUILDER_OWNER_ID||env.BSA_OWNER_DISCORD_ID||env.TARC_SCAN_OWNER_ID);
  const mainBsaId=clean(env.BSA_GUILD_ID);
  const mainTarcId=clean(env.TARC_MAIN_GUILD_ID||env.GUILD_ID);
  const legacyTarcId=clean(env.GUILD_ID);
  const other=clean(env.GUILD_IDS).split(",").map(s=>s.trim()).filter(Boolean);
  // Protect EVERY independently configured live guild ID, even when one
  // variable is stale. Neither a mistyped override nor a missing alias may
  // make the original TARC guild available as a generation target.
  const allProtected=[mainTarcId,mainBsaId,...(legacyTarcId?[legacyTarcId]:[]),
    ...other,...sources.map(String)];
  const issues=[];
  if(!ID.test(ownerId))issues.push("Configure BSA_OWNER_DISCORD_ID with your user ID.");
  if(!ID.test(mainTarcId))issues.push("Configure TARC_MAIN_GUILD_ID with the original TARC guild ID.");
  if(!ID.test(mainBsaId))issues.push("Keep BSA_GUILD_ID set to the original main BSA server.");
  if(mainTarcId && mainBsaId && mainTarcId===mainBsaId)
    issues.push("Original TARC and main BSA protection IDs must be different.");
  if(allProtected.some(x=>!ID.test(x)))issues.push("A protected guild ID is invalid.");
  return {ownerId,mainBsaId,mainTarcId,protectedIds:new Set(allProtected),issues};
}
export function allowedRegimentalTarget(c,ctx){
  return c.issues.length===0 && Boolean(ctx.inGuild) && ID.test(String(ctx.guildId)) &&
    ctx.userId===c.ownerId && ctx.guildOwnerId===c.ownerId &&
    !c.protectedIds.has(String(ctx.guildId));
}
function makeCommand(name,desc) {
  return new SlashCommandBuilder().setName(name).setDescription(desc)
    .setDMPermission(false).setDefaultMemberPermissions(0n);
}
export function getRegimentalCommands(){
  const gen=makeCommand("bsa-generate","Owner: preview and generate a selected BSA regimental server")
    .addStringOption(o=>o.setName("server").setDescription("Select the server structure to generate")
      .setRequired(true).addChoices(
        {name:"Royal Military Police (RMP)",value:"RMP"},
        {name:"Education and Training Services (ETS)",value:"ETS"},
        {name:"Royal Grenadier Guards (RGG)",value:"RGG"},
        {name:"Royal Tank Regiment (RTR)",value:"RTR"},
        {name:"United Kingdom Special Forces (UKSF)",value:"UKSF"},
        {name:"Gurkha Rifles (GR)",value:"GR"},
        {name:"Royal Intelligence Corps (RIC)",value:"RIC"},
        {name:"Officer Corps Academy (OCA)",value:"OCA"},
        {name:"RIC Academy (RICA)",value:"RICA"},
        {name:"Reports & Appeals (RA)",value:"RA"}
      )).toJSON();
  const audit=makeCommand("bsa-regiment-audit",
    "Owner: read-only audit of a generated regimental server").toJSON();
  for(const cmd of [gen,audit]){cmd.integration_types=[0];cmd.contexts=[0];}
  return [gen,audit];
}
function guildCommands(){
  return getRegimentalCommands().map(c=>{
    const clone={...c};
    delete clone.integration_types;delete clone.contexts;delete clone.dm_permission;
    return clone;
  });
}
function planHash(template,plan,guildId){
  const obj={code:template.server_code,guildId,templateHash:revisedHash(template),
    issues:plan.issues,claimed:plan.claimed,roleCreates:plan.roleCreates,
    roleEdits:plan.roleEdits,categories:plan.categories,channels:plan.channels,
    hierarchy:plan.hierarchy,hierarchyPreflight:plan.hierarchyPreflight,
    unknownRoles:plan.unknownRoles,orphans:plan.orphans};
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}
async function authenticate(i,env,presets){
  const sourceIds=Object.values(presets).map(p=>p.reference_source.guild_id);
  const creds=builderCredentials(env,sourceIds);
  if(creds.issues.length)return {guild:null,issue:"Security configuration incomplete:\n"+brief(creds.issues)};
  if(!i.inGuild?.())return {guild:null,issue:"Use the command in your new destination server, not in DMs."};
  if(i.user?.id!==creds.ownerId)return {guild:null,issue:"Only the configured BSA owner can use the regimental generator."};
  if(creds.protectedIds.has(String(i.guildId)))return {
    guild:null,issue:"Protected TARC, historic source or main BSA guild: generator access denied."};
  const guild=i.guild?await i.guild.fetch():await i.client.guilds.fetch(String(i.guildId));
  if(!allowedRegimentalTarget(creds,{inGuild:true,guildId:guild.id,
      userId:i.user.id,guildOwnerId:guild.ownerId}))
    return {guild:null,issue:"You must be the actual Discord owner of this newly created guild."};
  return {guild,issue:null};
}
async function respondError(i,message){
  const data={content:String(message).slice(0,1800),components:[],files:[],allowedMentions:{parse:[]}};
  try{
    if(i.deferred||i.replied)return await i.editReply(data);
    return await i.reply({...data,...PRIVATE});
  }catch{}
}
function buttons(token,code){
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("bsaregi:apply:"+token)
      .setLabel("Confirm "+code+" revamp").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("bsaregi:cancel:"+token)
      .setLabel("Cancel").setStyle(ButtonStyle.Secondary)
  )];
}
function previewText(guild,t,p){
  const sums=p.summary;
  return [
    "**BSA regiment in-place revamp — PRIVATE PREVIEW**",
    "Selected: **"+t.server_name+"** ("+t.server_code+").",
    "Target guild: **"+guild.name+"** ("+guild.id+"). Its name is not a security condition.",
    "**Revised template:** "+p.counts.roles+" roles, "+p.counts.categories+
      " categories, "+p.counts.channels+" channels.",
    "**Roles:** "+sums.createRoles+" create, "+sums.editRoles+" update colours/permissions; "+
      "Field Marshal goes at the TOP, lowest ranks at the BOTTOM.",
    "**Hierarchy:** Bot's highest role is currently at #"+p.hierarchyPreflight.botPosition+
      ". "+p.hierarchyPreflight.currentlyExistingRankCount+" ranks exist, "+
      p.hierarchyPreflight.missingRanks+" are yet to be created. "+
      (p.hierarchyPreflight.canReorder?"Bot is above the existing ranks; "+
        "new rank positions will be checked after creation.":
        "The bot is BELOW an existing rank; move it above that rank."),
    "**Categories:** "+sums.createCategories+" create, "+sums.updateCategories+" update.",
    "**Channels:** "+sums.createChannels+" create, "+sums.updateChannels+" edit, "+
      sums.moveChannels+" move, "+sums.renameChannels+" rename, "+
      sums.permissionEdits+" channel/category permission edits.",
    p.orphans.length?"**Orphans kept untouched ("+p.orphans.length+"):** "+
      p.orphans.slice(0,3).map(x=>x.name).join(", ")+
      (p.orphans.length>3?" (full list in attachment)":"")+".":null,
    p.issues.length?"**BLOCKED ("+p.issues.length+")**\n"+brief(p.issues,5):
      "**Preflight and simulated access tests passed.**",
    "**Source:** REVISED_PROPOSAL_REQUIRES_PREVIEW. Existing channel IDs, messages and member role assignments are preserved. "+
      "The revised ZIP's role colours/base permissions and resolved channel overwrites will be applied.",
    "No changes yet. Review the full private JSON diff before confirming."
  ].filter(Boolean).join("\n").slice(0,1930);
}

export async function handleRegimentalInteraction(i,env=process.env){
  const command=i.isChatInputCommand?.()&&
    ["bsa-generate","bsa-regiment-audit"].includes(i.commandName);
  const button=i.isButton?.()&&String(i.customId||"").startsWith("bsaregi:");
  if(!command&&!button)return false;
  try{
    const presets=await getRevisedPresets();
    const {guild,issue}=await authenticate(i,env,presets);
    if(!guild){await i.reply({content:issue,...PRIVATE});return true;}
    if(button){
      const [prefix,action,token]=i.customId.split(":");
      const job=pending.get(token);
      if(prefix!=="bsaregi"||!["apply","cancel"].includes(action)||
        !job||job.userId!==i.user.id||job.guildId!==guild.id||job.expiresAt<Date.now()){
        await i.reply({content:"Confirmation expired or belongs to another guild. Run /bsa-generate again.",...PRIVATE});
        return true;
      }
      // The revised UKSF scan supersedes the old generic UKSF template.
      // Never allow an old stored /bsa-generate confirmation to overwrite it.
      if(job.code==="UKSF"&&guild.id===UKSF_GUILD_ID){
        pending.delete(token);
        await i.update({content:"This verified UKSF guild uses /bsa-uksf-rework. "+
          "The old generic UKSF generator is disabled here to protect branch identities.",
          components:[],files:[],allowedMentions:{parse:[]}});
        return true;
      }
      if(action==="cancel"){
        pending.delete(token);
        await i.update({content:"Cancelled. No roles or channels changed.",
          components:[],files:[],allowedMentions:{parse:[]}});
        return true;
      }
      if(busy.has(guild.id)){
        await i.reply({content:"A regiment build is already running here.",...PRIVATE});return true;
      }
      pending.delete(token);
      await i.deferUpdate();
      const template=presets[job.code];
      if(!template||revisedHash(template)!==job.templateHash){
        await respondError(i,"Proposal changed since preview. Nothing was created. Run /bsa-generate again.");
        return true;
      }
      const plan=await previewRevisedGuild(guild,template);
      if(!plan.ok||planHash(template,plan,guild.id)!==job.planHash){
        await respondError(i,"Guild changed since preview or failed revalidation. Nothing was created. Run /bsa-generate again.");
        return true;
      }
      busy.add(guild.id);
      try{
        await i.editReply({content:"**Revamping "+job.code+" in place.** Existing role IDs, member assignments, "+
          "channel IDs and messages will be preserved. No object deletions.",
          components:[],allowedMentions:{parse:[]}});
        let lastProgress=0;
        const build=await revampRegimentalGuild(guild,template,async msg=>{
          if(Date.now()-lastProgress<12000)return;
          lastProgress=Date.now();
          await i.editReply({content:"**Revamping "+job.code+"**\n"+msg+
            "\nNo channels or roles are deleted.",components:[]}).catch(()=>{});
        });
        const audit=await auditRevisedGuild(guild,template);
        const incomplete=build.errors.length>0||audit.issues.length>0||!build.rolesReordered;
        await i.editReply({content:"**"+job.code+(incomplete?" REVAMP INCOMPLETE":" revamp VERIFIED")+"** "+
          build.rolesCreated.length+" roles created, "+build.rolesUpdated.length+" updated; "+
          build.categoriesCreated.length+" categories created, "+build.categoriesUpdated.length+" updated; "+
          build.channelsCreated.length+" channels created, "+build.channelsUpdated.length+" edited. "+
          "**Role hierarchy verified: "+(build.rolesReordered?"YES":"NO")+"**"+
          (build.roleOrderMethod?" ("+build.roleOrderMethod+")":"")+". "+
          "Remaining audit issues: "+audit.issues.length+"."+
          (build.errors.length?"\n**Errors:**\n"+brief(build.errors,4):"")+
          (incomplete?"\nDo not assume the rank hierarchy is fixed; review errors and rerun the command.":
            "\nField Marshal is highest, with lower ranks beneath. Verify in Discord."),
          components:[],files:[attachment({build,audit},
            "bsa-"+job.code.toLowerCase()+"-revamp-result.json")],allowedMentions:{parse:[]}});
      }finally{busy.delete(guild.id);}
      return true;
    }
    await i.deferReply({flags:MessageFlags.Ephemeral});
    if(i.commandName==="bsa-regiment-audit"){
      const existing=await guild.roles.fetch();
      const locks=[...existing.values()].filter(r=>
        REGIMENT_CODES.some(c=>r.name===markerName(c)));
      if(locks.length!==1){
        await respondError(i,"A regiment audit requires one template lock role; found "+
          locks.length+". Check that you are in a generated regimental server.");
        return true;
      }
      const code=REGIMENT_CODES.find(c=>markerName(c)===locks[0].name);
      const report=await auditRevisedGuild(guild,presets[code]);
      const body="**"+code+" revised revamp audit (read-only)**\n"+
        "Expected "+report.roles+" roles and "+report.channels+" channels. "+
        (report.issues.length?"**Remaining issues:**\n"+brief(report.issues,6):
          "**Declared colours, hierarchy and channel access policies reconciled.**")+
        "\nFull role-based guest/member/trainee/instructor/command test matrix attached.";
      await i.editReply({content:body.slice(0,1900),components:[],
        files:[attachment(report,"bsa-"+code.toLowerCase()+"-audit.json")],
        allowedMentions:{parse:[]}});
      return true;
    }
    const code=i.options?.getString("server");
    if(!REGIMENT_CODES.includes(code)){
      await respondError(i,"Select one of the ten available regimental templates.");
      return true;
    }
    if(code==="UKSF"&&guild.id===UKSF_GUILD_ID){
      await respondError(i,"The verified UKSF server now uses /bsa-uksf-rework. "+
        "The old /bsa-generate UKSF configuration is intentionally blocked here "+
        "to preserve the approved SAS/SRR overhaul.");
      return true;
    }
    const template=presets[code];
    const plan=await previewRevisedGuild(guild,template);
    let components=[];
    if(plan.ok&&!busy.has(guild.id)){
      for(const [token,item] of pending)if(item.expiresAt<Date.now())pending.delete(token);
      const token=randomBytes(15).toString("hex");
      pending.set(token,{userId:i.user.id,guildId:guild.id,code,
        planHash:planHash(template,plan,guild.id),
        templateHash:revisedHash(template),expiresAt:Date.now()+EXPIRES_MS});
      components=buttons(token,code);
    }
    await i.editReply({content:previewText(guild,template,plan),components,
      files:[attachment({kind:"regiment-preview",template,plan,
        note:"Owner-confirmed revamp edits existing role colours/permissions, role hierarchy and channel/category overwrites, preserving IDs/messages/assignments; orphans never deleted."},
        "bsa-"+code.toLowerCase()+"-preview.json")],allowedMentions:{parse:[]}});
    return true;
  }catch(e){
    console.error("[BSA REGIMENT GENERATOR] code:",String(e?.code||"unknown"));
    await respondError(i,"Generator failed safely (code "+String(e?.code||"unknown")+
      "). No protected TARC or main BSA server is eligible.");
    return true;
  }
}

// Register guild-specific commands as each new owner-controlled guild is joined,
// avoiding the global propagation delay. Never bulk-overwrite guild commands.
export async function registerRegimentalGuildCommands(rest,clientId,guild,env=process.env){
  const presets=await getRevisedPresets();
  const creds=builderCredentials(env,Object.values(presets).map(p=>p.reference_source.guild_id));
  const fresh=await guild.fetch();
  if(!allowedRegimentalTarget(creds,{inGuild:true,guildId:fresh.id,
    userId:creds.ownerId,guildOwnerId:fresh.ownerId}))
    return {registered:false,reason:"protected or not owned"};
  const route=Routes.applicationGuildCommands(clientId,fresh.id);
  for(const command of guildCommands())await rest.post(route,{body:command});
  const found=await rest.get(route);
  if(!Array.isArray(found)||getRegimentalCommands().some(c=>!found.some(r=>r.name===c.name)))
    throw new Error("BSA regimental guild command registration verification failed");
  return {registered:true,guildId:fresh.id};
}
