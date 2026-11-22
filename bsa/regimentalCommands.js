import {createHash,randomBytes} from "node:crypto";
import {
  ActionRowBuilder,AttachmentBuilder,ButtonBuilder,ButtonStyle,
  MessageFlags,Routes,SlashCommandBuilder
} from "discord.js";
import {REGIMENT_CODES,getRegimentalPresets,regimentTemplateHash} from "./regimentalTemplates.js";
import {markerName,preflightRegimentalGuild,buildRegimentalGuild,auditRegimentalGuild} from "./regimentalEngine.js";

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
  const obj={code:template.server_code,guildId,templateHash:regimentTemplateHash(template),
    claimed:plan.claimed,missingRoles:plan.missingRoles,
    missingCategories:plan.missingCategories,missingChannels:plan.missingChannels,
    issues:plan.issues,extraObjects:plan.extraObjects};
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
      .setLabel("Confirm "+code+" build").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("bsaregi:cancel:"+token)
      .setLabel("Cancel").setStyle(ButtonStyle.Secondary)
  )];
}
function previewText(guild,t,p){
  return [
    "**BSA regiment generator — PRIVATE PREVIEW**",
    "Selected: **"+t.server_name+"** ("+t.server_code+").",
    "Destination: **"+guild.name+"** (ID: "+guild.id+"). Name does not affect authorization.",
    p.counts.roles+" proposed roles • "+p.counts.categories+" categories • "+p.counts.channels+" channels.",
    p.validation.duplicateRoleNames.length?"**Identical duplicate role names skipped ("+
      (p.validation.roleEntries-p.validation.roles)+"):** "+
      p.validation.duplicateRoleNames.join(", ")+
      ". One of each will be created using common zero-permission defaults. "+
      "The highest listed occurrence determines hierarchy position.":null,
    "To create: "+p.size.newRoles+" roles, "+p.size.newCategories+
      " categories, "+p.size.newChannels+" channels; "+(p.claimed?"reuse":"create")+" builder lock.",
    p.extraObjects.length?"**Existing unmatched objects (PRESERVED, not deleted or edited):** "+
      p.extraObjects.slice(0,4).map(x=>x.name).join(", ")+
      (p.extraObjects.length>4?" (+"+(p.extraObjects.length-4)+" more in JSON)":"")+".":null,
    p.issues.length?"**BLOCKED ("+p.issues.length+")**\n"+brief(p.issues,6):
      "**Structural preflight passed.**",
    "**Source warning:** PROPOSAL_NOT_APPROVED. No exact role colours, channel-role permission lists or integrations are provided. "+
    "Public sections will be READ-ONLY. Private and mixed sections will deny everyone and receive NO guessed access grants.",
    "This preview changes nothing. Review the full attached template and report before confirming."
  ].filter(Boolean).join("\n").slice(0,1920);
}

export async function handleRegimentalInteraction(i,env=process.env){
  const command=i.isChatInputCommand?.()&&
    ["bsa-generate","bsa-regiment-audit"].includes(i.commandName);
  const button=i.isButton?.()&&String(i.customId||"").startsWith("bsaregi:");
  if(!command&&!button)return false;
  try{
    const presets=await getRegimentalPresets();
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
      if(!template||regimentTemplateHash(template)!==job.templateHash){
        await respondError(i,"Proposal changed since preview. Nothing was created. Run /bsa-generate again.");
        return true;
      }
      const plan=await preflightRegimentalGuild(guild,template);
      if(!plan.ok||planHash(template,plan,guild.id)!==job.planHash){
        await respondError(i,"Guild changed since preview or failed revalidation. Nothing was created. Run /bsa-generate again.");
        return true;
      }
      busy.add(guild.id);
      try{
        await i.editReply({content:"Building "+job.code+" STRUCTURE in this new guild. No deletion or guessed access.",
          components:[],allowedMentions:{parse:[]}});
        let lastProgress=0;
        const build=await buildRegimentalGuild(guild,template,async msg=>{
          if(Date.now()-lastProgress<12000)return;
          lastProgress=Date.now();
          await i.editReply({content:"**Building "+job.code+"**\n"+msg+
            "\nExisting server objects remain untouched.",components:[]}).catch(()=>{});
        });
        const audit=await auditRegimentalGuild(guild,template);
        await i.editReply({content:"**"+job.code+" build finished.** Created "+
          build.createdRoles.length+" roles (including lock if needed), "+
          build.createdCategories.length+" categories and "+
          build.createdChannels.length+" channels. Operational issues: "+
          build.errors.length+"; audit issues: "+audit.issues.length+
          ".\n**Private access is deliberately locked pending approval.** "+
          "Use /bsa-regiment-audit to review.",
          components:[],files:[attachment({build,audit},
            "bsa-"+job.code.toLowerCase()+"-build-result.json")],allowedMentions:{parse:[]}});
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
      const report=await auditRegimentalGuild(guild,presets[code]);
      const body="**"+code+" structural audit (read-only)**\n"+
        report.found.roles+"/"+report.counts.roles+" roles • "+
        report.found.categories+"/"+report.counts.categories+" categories • "+
        report.found.channels+"/"+report.counts.channels+" channels.\n"+
        (report.issues.length?"**Issues:**\n"+brief(report.issues,6):
          "**Proposed structural layout present.**")+
        "\nSource ZIP does not approve final access permissions/role colours/integrations.";
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
    const template=presets[code];
    const plan=await preflightRegimentalGuild(guild,template);
    let components=[];
    if(plan.ok&&!busy.has(guild.id)){
      for(const [token,item] of pending)if(item.expiresAt<Date.now())pending.delete(token);
      const token=randomBytes(15).toString("hex");
      pending.set(token,{userId:i.user.id,guildId:guild.id,code,
        planHash:planHash(template,plan,guild.id),
        templateHash:regimentTemplateHash(template),expiresAt:Date.now()+EXPIRES_MS});
      components=buttons(token,code);
    }
    await i.editReply({content:previewText(guild,template,plan),components,
      files:[attachment({kind:"regiment-preview",template,plan,
        note:"Confirmed generation creates proposal STRUCTURE ONLY, with private channels locked."},
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
  const presets=await getRegimentalPresets();
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
