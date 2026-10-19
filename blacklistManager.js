import fs from "node:fs/promises";
import path from "node:path";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, SlashCommandBuilder } from "discord.js";

const FILE=path.join(process.env.TARC_DATA_DIR||"./data","group-blacklist.json");
const INITIAL={"11230867":{reason:"This group is currently restricted due to affiliated persons repeatedly causing community disruption, misinformation, and conduct concerns.",addedAt:"migration"}};
let state=null,writing=Promise.resolve();
async function load(){
 if(state)return state;
 try{const saved=JSON.parse(await fs.readFile(FILE,"utf8"));state={version:Number(saved.version)||1,groups:saved.groups||{},audit:saved.audit||[]};}
 catch(e){if(e.code!=="ENOENT")throw e;state={version:1,groups:INITIAL,audit:[]};await persist();}
 return state;
}
async function persist(){
 writing=writing.then(async()=>{await fs.mkdir(path.dirname(FILE),{recursive:true});const tmp=FILE+".tmp";await fs.writeFile(tmp,JSON.stringify(state,null,2));await fs.rename(tmp,FILE);});return writing;
}
const fetchJSON=async url=>{const res=await fetch(url,{signal:AbortSignal.timeout(9000)});if(!res.ok)throw new Error("Roblox API returned HTTP "+res.status);return res.json();};
const groupId=value=>{const s=String(value||"").trim();if(!/^[1-9][0-9]{0,14}$/.test(s)||!Number.isSafeInteger(Number(s)))throw new Error("Enter a valid numeric Roblox group ID.");return s;};
function linkedId(data){for(const key of ["robloxId","roblox_id"]){if(/^\d+$/.test(String(data?.[key]||"")))return String(data[key]);}for(const o of [data?.roblox,data?.account,data?.roblox_user]){if(/^\d+$/.test(String(o?.id||"")))return String(o.id);}return null;}
async function authorised(i){
 const guildId=process.env.BLACKLIST_GUILD_ID||process.env.GUILD_ID;
 if(!guildId||!process.env.ROWIFI_API_TOKEN)throw new Error("RoWifi or the main Discord guild is not configured.");
 const roles=await fetchJSON("https://groups.roblox.com/v1/groups/"+(process.env.ROBLOX_GROUP_ID||"35324584")+"/roles");
 const gm=roles.roles?.find(x=>String(x.name).trim().toLowerCase()==="grand marshal");
 if(!gm||!Number.isInteger(gm.rank)||gm.rank<1)throw new Error("Cannot verify Grand Marshal's Roblox rank. Access denied.");
 const res=await fetch("https://api.rowifi.xyz/v2/guilds/"+guildId+"/members/"+i.user.id,{headers:{Authorization:"Bot "+process.env.ROWIFI_API_TOKEN},signal:AbortSignal.timeout(9000)});
 if(!res.ok)throw new Error("Could not verify your linked Roblox account with RoWifi.");
 const id=linkedId(await res.json());
 if(!id)throw new Error("No verified Roblox account is linked to this Discord account.");
 const memberships=await fetchJSON("https://groups.roblox.com/v2/users/"+id+"/groups/roles");
 const role=memberships.data?.find(x=>String(x.group?.id)===(process.env.ROBLOX_GROUP_ID||"35324584"))?.role;
 if(!role||Number(role.rank)<gm.rank)throw new Error("Grand Marshal or higher is required in the main TARC Roblox group.");
 return {robloxId:id,rank:Number(role.rank),role:role.name,minimum:gm.rank};
}
function board(s){
 const entries=Object.entries(s.groups);
 const text=entries.length?entries.slice(0,15).map(([id,v])=>"**"+v.name+"** (`"+id+"`)\n"+v.reason.slice(0,140)).join("\n\n"):"No groups blacklisted.";
 return {embeds:[new EmbedBuilder().setColor(0xb12c3d).setTitle("🛡️ TARC Group Blacklist").setDescription("**"+entries.length+" restricted groups**\n\n"+text+(entries.length>15?"\n…and "+(entries.length-15)+" more.":"")).setFooter({text:"Only verified Grand Marshal+ may make changes."})],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("blacklist:add").setLabel("New Blacklist").setEmoji("➕").setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId("blacklist:remove").setLabel("Remove / Unblacklist").setEmoji("➖").setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId("blacklist:refresh").setLabel("Refresh").setStyle(ButtonStyle.Secondary))]};
}
function modal(action){
 return new ModalBuilder().setCustomId("blacklist:submit:"+action).setTitle(action==="add"?"New Group Blacklist":"Remove Group Blacklist").addComponents(
 new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("group_id").setLabel("Roblox Group ID").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(15)),
 ...(action==="add"?[new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("reason").setLabel("Reason").setStyle(TextInputStyle.Paragraph).setRequired(true).setMinLength(3).setMaxLength(800))]:[])
 );
}
export function getBlacklistCommands(){
 const command=new SlashCommandBuilder().setName("blacklist").setDescription("Manage the TARC group blacklist (Grand Marshal+)");
 const json=command.toJSON();json.integration_types=[0,1];json.contexts=[0,1,2];return [json];
}
export async function handleBlacklistInteraction(i){
 const isCommand=i.isChatInputCommand()&&i.commandName==="blacklist";
 const isAction=(i.isButton()||i.isModalSubmit())&&i.customId.startsWith("blacklist:");
 if(!isCommand&&!isAction)return false;
 try{
  const actor=await authorised(i);
  if(isCommand){await i.reply({...board(await load()),flags:MessageFlags.Ephemeral});return true;}
  if(i.isButton()){
   const action=i.customId.split(":")[1];
   if(action==="add"||action==="remove"){await i.showModal(modal(action));return true;}
   await i.update(board(await load()));return true;
  }
  await i.deferReply({flags:MessageFlags.Ephemeral});
  const action=i.customId.split(":")[2],id=groupId(i.fields.getTextInputValue("group_id"));
  const s=await load();
  if(action==="add"){
   if(s.groups[id])throw new Error("This group is already blacklisted.");
   const reason=i.fields.getTextInputValue("reason").trim();
   if(reason.length<3)throw new Error("Please enter a meaningful reason.");
   const info=await fetchJSON("https://groups.roblox.com/v1/groups/"+id);
   if(!info?.id||String(info.id)!==id)throw new Error("Roblox could not confirm that group.");
   s.groups[id]={name:String(info.name||"Unknown Group"),owner:String(info.owner?.username||"Unknown"),reason,addedAt:new Date().toISOString(),addedBy:i.user.id,robloxId:actor.robloxId};
  }else if(action==="remove"){
   if(!s.groups[id])throw new Error("That group is not blacklisted.");
  }else throw new Error("Unknown blacklist action.");
  const previous=s.groups[id];
  if(action==="remove")delete s.groups[id];
  s.version++;
  const record={action,groupId:id,groupName:previous.name,reason:previous.reason,discordUserId:i.user.id,robloxUserId:actor.robloxId,at:new Date().toISOString()};
  s.audit.push(record);
  await persist();
  console.log("[BLACKLIST AUDIT]",JSON.stringify(record));
  await i.editReply({content:(action==="add"?"Blacklisted":"Removed")+" **"+previous.name+"** (`"+id+"`).\nVersion: **"+s.version+"**",...board(s)});
  return true;
 }catch(e){
  console.error("[BLACKLIST]",e);
  const content="⚠️ "+String(e.message||"Blacklist request failed.");
  if(i.deferred||i.replied)await i.editReply({content,embeds:[],components:[]}).catch(()=>{});
  else await i.reply({content,flags:MessageFlags.Ephemeral}).catch(()=>{});
  return true;
 }
}
export async function blacklistSnapshot(secret){
 if(!process.env.SHARED_SECRET||secret!==process.env.SHARED_SECRET)return null;
 const s=await load();
 return {version:s.version,groups:Object.entries(s.groups).map(([id,g])=>({groupId:Number(id),reason:g.reason}))};
}
