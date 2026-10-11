import fs from "node:fs";
import path from "node:path";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, SlashCommandBuilder } from "discord.js";

const DATA_DIR = process.env.TARC_DATA_DIR || "./data";
const FILE = path.join(DATA_DIR, "event-dm.json");
const GAME_URL = process.env.TARC_EVENT_GAME_URL || "https://www.roblox.com/games/121135265635696";
const drafts = new Map();
const load = () => { try { return JSON.parse(fs.readFileSync(FILE,"utf8")); } catch { return { subscribers:[], optedOut:[], deliveries:[] }; } };
let state = load();
state.subscribers ||= []; state.optedOut ||= []; state.deliveries ||= [];
const save = () => { fs.mkdirSync(DATA_DIR,{recursive:true}); const temp=FILE+".tmp"; fs.writeFileSync(temp,JSON.stringify(state,null,2)); fs.renameSync(temp,FILE); };
const privateReply = (i,msg) => i.reply({content:msg,flags:64});
const validUrl = u => { try { const x=new URL(u); return x.protocol==="https:" && !x.username && !x.password; } catch { return false; } };
const eventCommand = new SlashCommandBuilder().setName("eventdm").setDescription("Create a major TARC event announcement (owner only)").toJSON();
const alertsCommand = new SlashCommandBuilder().setName("eventalerts").setDescription("Opt in or out of major TARC event DMs").addStringOption(o=>o.setName("setting").setDescription("Event DM preference").setRequired(true).addChoices({name:"Subscribe",value:"on"},{name:"Unsubscribe",value:"off"})).toJSON();
function subscribed(id){return state.subscribers.includes(id)&&!state.optedOut.includes(id);}
function subscribe(id,on){state.subscribers=state.subscribers.filter(x=>x!==id);state.optedOut=state.optedOut.filter(x=>x!==id);(on?state.subscribers:state.optedOut).push(id);save();}
function parseTime(v){
  // Explicit offset required, so a time entered in London is never silently treated as Railway UTC.
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)) throw Error("Use ISO date/time with a timezone offset, e.g. 2026-10-24T19:00+01:00 (BST) or +00:00 (GMT).");
  const ms=Date.parse(v); if(!Number.isFinite(ms)||ms<=Date.now()) throw Error("Enter a valid future date and time.");
  return Math.floor(ms/1000);
}
function embed(d){
  const e=new EmbedBuilder().setColor(d.color||0x2864b4).setTitle(d.title||"TARC Major Event").setDescription([d.description||"Major TARC event","", "**Starts:** <t:"+d.time+":F>","**Countdown:** <t:"+d.time+":R>", d.reward?"**Reward:** "+d.reward:""].filter(Boolean).join("\n"));
  if(d.banner)e.setImage(d.banner);
  return e;
}
function buttons(d,dm=false){
  const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel("Join Event").setStyle(ButtonStyle.Link).setURL(d.link||GAME_URL));
  if(dm)row.addComponents(new ButtonBuilder().setCustomId("tedm:stop").setLabel("Stop Notifications").setStyle(ButtonStyle.Danger));
  return [row];
}
function builder(i,d){
  return {embeds:[embed(d)],components:[
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("tedm:edit").setLabel("Edit Event").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("tedm:preview").setLabel("Preview DM").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("tedm:confirm").setLabel("Review & Confirm").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("tedm:cancel").setLabel("Cancel").setStyle(ButtonStyle.Danger)
    )
  ],flags:64};
}
function owner(i){return i.user.id===process.env.TARC_OWNER_DISCORD_ID;}
function modal(d){
  const m=new ModalBuilder().setCustomId("tedm:save").setTitle("Major TARC Event");
  const fields=[
    ["title","Event title","e.g. Coruscant Invasion",d.title||"",true],
    ["description","Short description","What's happening?",d.description||"",true],
    ["time","Start time (ISO + timezone)","2026-10-24T19:00+01:00",d.inputTime||"",true],
    ["reward","Reward (optional)","e.g. Double XP",d.reward||"",false],
    ["extras","Colour | banner URL | game URL","hex colour | https://image | https://game",d.extras||"",false]
  ];
  for(const [id,label,placeholder,value,required] of fields){
    const input=new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(id==="description"?TextInputStyle.Paragraph:TextInputStyle.Short).setRequired(required).setMaxLength(id==="description"?450: id==="extras"?900:180).setPlaceholder(placeholder);
    if(value)input.setValue(value);
    m.addComponents(new ActionRowBuilder().addComponents(input));
  }
  return m;
}
async function sendBatch(i,d){
  const recipients=[...new Set(state.subscribers)].filter(id=>subscribed(id));
  const result={event:d.title,at:new Date().toISOString(),attempted:0,sent:0,failed:0,errors:[]};
  state.deliveries.push(result);save();
  for(const id of recipients){
    if(!subscribed(id))continue;
    result.attempted++;
    try{
      const user=await i.client.users.fetch(id);
      await user.send({embeds:[embed(d)],components:buttons(d,true),allowedMentions:{parse:[]}});
      result.sent++;
    }catch(e){
      result.failed++;
      result.errors.push({id,code:e.code||"unknown"});
    }
    save();
    if(result.attempted%10===0)await i.editReply({content:"Sending event DMs: "+result.attempted+"/"+recipients.length+" processed.",components:[],embeds:[]});
    await new Promise(resolve=>setTimeout(resolve,350));
  }
  save();
  await i.editReply({content:"Event DMs complete. Sent: **"+result.sent+"**. Failed: **"+result.failed+"**. Subscribed recipients: **"+recipients.length+"**.",components:[],embeds:[]});
}
export function getEventCommands(){return [eventCommand,alertsCommand];}
export async function handleEventInteraction(i){
  const isEvent=(i.isChatInputCommand()&&["eventdm","eventalerts"].includes(i.commandName))||((i.isButton()||i.isModalSubmit())&&i.customId.startsWith("tedm:"));
  if(!isEvent)return false;
  try{
    if(i.isChatInputCommand()&&i.commandName==="eventalerts"){
      const on=i.options.getString("setting")==="on";subscribe(i.user.id,on);
      await privateReply(i,on?"Subscribed to major TARC event DMs. You can unsubscribe anytime with /eventalerts.":"Event DMs disabled. You will not receive future event alerts.");
      return true;
    }
    if(i.isButton()&&i.customId==="tedm:stop"){
      subscribe(i.user.id,false);await privateReply(i,"You've unsubscribed from future TARC event DMs. Use /eventalerts to subscribe again.");return true;
    }
    if(!owner(i)){await privateReply(i,"Only the bot owner can manage major event announcements.");return true;}
    if(!i.inGuild()){await privateReply(i,"Run this command in the TARC server.");return true;}
    if(i.isChatInputCommand()){
      drafts.set(i.user.id,{title:"TARC Major Event",description:"Event details coming soon.",time:Math.floor(Date.now()/1000)+3600,link:GAME_URL});
      await i.reply(builder(i,drafts.get(i.user.id)));return true;
    }
    const d=drafts.get(i.user.id);
    if(!d){await privateReply(i,"Your event draft expired. Run /eventdm again.");return true;}
    if(i.isModalSubmit()){
      const get=id=>i.fields.getTextInputValue(id).trim();
      const time=parseTime(get("time"));
      const extras=get("extras").split("|").map(x=>x.trim());
      const [colour,banner,link]=extras;
      if(colour&&!/^#?[0-9a-fA-F]{6}$/.test(colour))throw Error("Colour must be a six-digit hex code.");
      if(banner&&!validUrl(banner))throw Error("Banner must be an HTTPS image URL.");
      if(link&&!validUrl(link))throw Error("Game link must be an HTTPS URL.");
      Object.assign(d,{title:get("title"),description:get("description"),time,inputTime:get("time"),reward:get("reward"),color:colour?parseInt(colour.replace("#",""),16):0x2864b4,banner:banner||"",link:link||GAME_URL,extras:get("extras")});
      await i.update(builder(i,d));return true;
    }
    if(i.customId==="tedm:edit"){await i.showModal(modal(d));return true;}
    if(i.customId==="tedm:preview"){await i.reply({content:"Private DM preview. Only subscribed members will receive this when you confirm.",embeds:[embed(d)],components:buttons(d,true),flags:64});return true;}
    if(i.customId==="tedm:cancel"){drafts.delete(i.user.id);await i.update({content:"Event cancelled.",embeds:[],components:[]});return true;}
    if(i.customId==="tedm:confirm"){
      await i.update({content:"**Final confirmation**\nSend this major event DM to **"+state.subscribers.filter(id=>subscribed(id)).length+"** opted-in members?",embeds:[embed(d)],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("tedm:send").setLabel("Send Event").setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId("tedm:cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary))]});return true;
    }
    if(i.customId==="tedm:send"){
      if(d.sending){await privateReply(i,"This event is already sending.");return true;}
      d.sending=true;await i.update({content:"Delivering opted-in event DMs...",embeds:[],components:[]});
      try{await sendBatch(i,d);drafts.delete(i.user.id);}catch(e){d.sending=false;throw e;}
      return true;
    }
    return true;
  }catch(e){
    console.error("[EVENTDM]",e);
    const msg="Event DM error: "+String(e.message||"Unknown error").slice(0,300);
    if(i.deferred||i.replied)await i.followUp({content:msg,flags:64}).catch(()=>{});
    else await privateReply(i,msg).catch(()=>{});
    return true;
  }
}
