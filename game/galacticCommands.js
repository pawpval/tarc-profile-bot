import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, MessageFlags, SlashCommandBuilder } from "discord.js";
import { ABILITIES, CARD_CATALOG, CRATES, FACTIONS, getCard, listCards, RARITIES } from "./galacticCatalog.js";
import {
  adminGameAction, answerDuel, answerTrade, assignCard, attachDropMessage, claimQuest, attackBoss,
  chooseFaction, configureDropChannel, createGuild, currentEvent, daily, buyDailyDeal, donateGuild, enterDrop,
  finishDrop, guildDetails, hourlyIncome, joinGuild, leaders, leaveGuild, proposeDuel, proposeTrade, researchGuild, transferGuild, bossSnapshot,
  raid, recycleCard, roll, runMission, salvage, scheduledGameState, snapshot, startAutomaticDrop, upgradeAttribute,
  upgradeBase, upgradeCard, trainAbility, isDoubleXp, updateEventAnnouncement, markWeeklyAnnouncement
} from "./galacticState.js";
import {
  BLUE, baseScreen, bossScreen, cardEmbed, cardOptionsScreen, collectionScreen, cratePreviewScreen, factionScreen, helpScreen, homeScreen, inspectScreen,
  leaderboardScreen, missionsScreen, questsScreen, recycleConfirmScreen, rollScreen, shopScreen, upgradesScreen
} from "./galacticUI.js";

const num = n => Number(n||0).toLocaleString("en-GB");
const ephemeral = { flags: MessageFlags.Ephemeral };
const idPattern = /^[a-f0-9]{8}$/i;

function row(...buttons){return new ActionRowBuilder().addComponents(...buttons);}
function plain(message){return {content:String(message),allowedMentions:{parse:[]}};}
async function present(i, screen, { update = false, privateReply = false } = {}) {
  const payload = { ...screen, allowedMentions:screen.allowedMentions||{parse:[]} };
  if (update && (i.isButton() || i.isStringSelectMenu())) return i.deferred ? i.editReply(payload) : i.update(payload);
  if (i.deferred || i.replied) return i.editReply(payload);
  return i.reply({...payload,...(privateReply?ephemeral:{})});
}
async function sendError(i,error) {
  const payload = { ...plain(error), ...ephemeral };
  // A deferred component update belongs to the existing game panel. Never
  // replace the panel with error text; send a private notice alongside it.
  if (i.deferred && (i.isButton?.() || i.isStringSelectMenu?.())) return i.followUp(payload);
  if (i.deferred && !i.replied) return i.editReply(plain(error));
  if (i.replied) return i.followUp(payload);
  return i.reply(payload);
}
function displayName(i) { return i.member?.displayName || i.user.globalName || i.user.username || "Commander"; }
function avatarURL(i) { return typeof i.user?.displayAvatarURL==="function" ? i.user.displayAvatarURL({size:128}) : null; }
function gameEntry(p,note="",username="Commander",avatar=null) {return p.faction ? homeScreen(p,Date.now(),note,username,avatar) : factionScreen(p.id);}
async function showHome(i, note = "", update = false) {
  const { profile } = await snapshot(i.user.id);
  return present(i, gameEntry(profile,note,displayName(i),avatarURL(i)),{update});
}

export function getGalacticCommands() {
  const crateOptions = Object.entries(CRATES).sort((a,b)=>a[1].price-b[1].price)
    .map(([value,c])=>({name:`${c.name} — ${num(c.price)} Credits`.slice(0,100),value}));
  return [
    new SlashCommandBuilder().setName("game").setDescription("Build a Star Wars army, collect cards and run your own outpost"),
    new SlashCommandBuilder().setName("roll").setDescription("Roll for a Star Wars card or open a supply crate")
      .addStringOption(o=>o.setName("crate").setDescription("Optional crate; default roll is 300 Credits").setRequired(false).addChoices(...crateOptions)),
    new SlashCommandBuilder().setName("cards").setDescription("Browse and manage your card collection")
      .addStringOption(o=>o.setName("id").setDescription("Optional card ID from your collection").setRequired(false)),
    new SlashCommandBuilder().setName("catalog").setDescription("Search the 350+ card catalogue")
      .addStringOption(o=>o.setName("search").setDescription("Character, division, company or card ID").setRequired(false)),
    new SlashCommandBuilder().setName("raid").setDescription("Attack another player's outpost")
      .addUserOption(o=>o.setName("player").setDescription("Player to raid").setRequired(true)),
    new SlashCommandBuilder().setName("boss").setDescription("Fight this week's community boss"),
    new SlashCommandBuilder().setName("duel").setDescription("Challenge another player to a squad battle")
      .addUserOption(o=>o.setName("player").setDescription("Player to duel").setRequired(true))
      .addBooleanOption(o=>o.setName("ranked").setDescription("Compete for ranked rating (default is casual)").setRequired(false)),
    new SlashCommandBuilder().setName("trade").setDescription("Offer a card swap to another player")
      .addUserOption(o=>o.setName("player").setDescription("Player to trade with").setRequired(true))
      .addStringOption(o=>o.setName("your_card").setDescription("Your reserve card ID from /cards").setRequired(true))
      .addStringOption(o=>o.setName("their_card").setDescription("Their reserve card ID").setRequired(true)),
    new SlashCommandBuilder().setName("rankings").setDescription("Show the weekly Galactic Command leaderboard"),
    new SlashCommandBuilder().setName("guild").setDescription("Create, join or manage your independent guild")
      .addSubcommand(o=>o.setName("create").setDescription("Create a guild for 10,000 Credits").addStringOption(q=>q.setName("name").setDescription("Your guild's name").setRequired(true)))
      .addSubcommand(o=>o.setName("join").setDescription("Join an open guild by code").addStringOption(q=>q.setName("code").setDescription("Guild invitation code").setRequired(true)))
      .addSubcommand(o=>o.setName("leave").setDescription("Leave your current guild"))
      .addSubcommand(o=>o.setName("info").setDescription("View your current guild"))
      .addSubcommand(o=>o.setName("donate").setDescription("Contribute Credits to your guild").addIntegerOption(q=>q.setName("amount").setDescription("100–20,000 Credits").setMinValue(100).setMaxValue(20000).setRequired(true)))
      .addSubcommand(o=>o.setName("research").setDescription("Guild leader: spend treasury on group bonuses")
        .addStringOption(q=>q.setName("type").setDescription("Research type").setRequired(true).addChoices({name:"Economy",value:"economy"},{name:"War Tactics",value:"war"})))
      .addSubcommand(o=>o.setName("transfer").setDescription("Guild leader: transfer ownership to a member")
        .addUserOption(q=>q.setName("player").setDescription("New guild leader").setRequired(true)))
      .addSubcommand(o=>o.setName("leaderboard").setDescription("Top guilds this week")),
    new SlashCommandBuilder().setName("gameadmin").setDescription("Owner-only Galactic Command management")
      .addSubcommand(o=>o.setName("set").setDescription("Set a player's game stat (excludes prizes this week)")
        .addUserOption(q=>q.setName("player").setDescription("Player").setRequired(true))
        .addStringOption(q=>q.setName("stat").setDescription("Stat").setRequired(true).addChoices(...["credits","xp","scrap","weekScore","baseLevel"].map(x=>({name:x,value:x}))))
        .addIntegerOption(q=>q.setName("value").setDescription("New value").setRequired(true).setMinValue(0).setMaxValue(50000000)))
      .addSubcommand(o=>o.setName("grantcard").setDescription("Give a player one or more cards")
        .addUserOption(q=>q.setName("player").setDescription("Recipient").setRequired(true))
        .addStringOption(q=>q.setName("card_id").setDescription("Card ID from /catalog").setRequired(true))
        .addIntegerOption(q=>q.setName("amount").setDescription("Quantity (1–20)").setMinValue(1).setMaxValue(20).setRequired(false)))
      .addSubcommand(o=>o.setName("reset").setDescription("Reset a player's new-game progress")
        .addUserOption(q=>q.setName("player").setDescription("Player").setRequired(true))
        .addStringOption(q=>q.setName("confirm").setDescription("Type RESET").setRequired(true)))
      .addSubcommand(o=>o.setName("drops").setDescription("Set the automatic card-drop channel")
        .addChannelOption(q=>q.setName("channel").setDescription("Card-drop channel").addChannelTypes(ChannelType.GuildText).setRequired(true)))
      .addSubcommand(o=>o.setName("dropnow").setDescription("Start a public card drop immediately"))
      .addSubcommand(o=>o.setName("fulfill").setDescription("Mark an external prize as delivered to a winner")
        .addUserOption(q=>q.setName("player").setDescription("Winner").setRequired(true)))
  ].map(c=>c.toJSON());
}

// Register public gameplay once across Discord's global/User Install scope.
// Only ownership controls belong in the guild command registration.
export function getGlobalGalacticCommands() {
  return getGalacticCommands().filter(c=>c.name!=="gameadmin")
    .map(c=>({...c,integration_types:[0,1],contexts:[0,1,2]}));
}
export function getGuildGalacticCommands() {
  return getGalacticCommands().filter(c=>c.name==="gameadmin");
}

function makeBattleEmbed(title, result, attackerId, defenderId, label="Raid") {
  return new EmbedBuilder().setColor(result.win?0x2aaa83:0xdd5c58).setTitle(title)
    .setDescription([
      `${label}: <@${attackerId}> vs <@${defenderId}>`,
      result.win ? `**${attackerId === result.winner || !result.winner ? "Victory" : "Defeat"}**` : "**Defeat**",
      `Attack strength **${num(result.attackerPower)}** · Defence strength **${num(result.defenderPower)}**`,
      result.rewards ? `Rewards: +${num(result.rewards.credits)} Credits · +${num(result.rewards.xp)} XP · +${num(result.rewards.points)} Command Points` : null,
      "No cards or Credits are taken from the defender."
    ].filter(Boolean).join("\n"));
}

async function handleSlash(i,options) {
  const name = i.commandName;
  const target = i.options.getUser?.("player");
  if (name === "game") return showHome(i);
  if (name === "roll") {
    const {profile:existing}=await snapshot(i.user.id);
    if (!existing.faction) return present(i,factionScreen(i.user.id));
    const crate = i.options.getString("crate") || "single";
    const result = await roll(i.user.id,crate);
    if (!result.ok) return sendError(i,result.error);
    const {profile} = await snapshot(i.user.id);
    return present(i,rollScreen(profile,result.found,result.spent));
  }
  if (name === "cards") {
    const {profile} = await snapshot(i.user.id), uid=i.options.getString("id");
    return present(i,uid?inspectScreen(profile,uid):profile.faction?collectionScreen(profile):factionScreen(i.user.id),{privateReply:true});
  }
  if (name === "catalog") {
    const term = i.options.getString("search") || "";
    const matched = listCards({term}).slice(0,20);
    const exact = CARD_CATALOG.find(c=>c.id === term.toLowerCase() || c.name.toLowerCase() === term.toLowerCase());
    const embed = exact ? cardEmbed(exact,null,"CARD CATALOGUE") : new EmbedBuilder().setColor(BLUE).setTitle(`CARD CATALOGUE  (${CARD_CATALOG.length} cards)`)
      .setDescription((matched.length?matched.map(c=>`**${c.name}**  ·  ${c.rarity}  ·  ${FACTIONS[c.faction].short}\nID \`${c.id}\``).join("\n"):"No matching cards found.").slice(0,3950))
      .setFooter({text:"Search by name, faction unit, company or exact ID. Owner grants use card IDs."});
    return present(i,{embeds:[embed],components:[]},{privateReply:true});
  }
  if (name === "raid") {
    if (!target || target.bot) return sendError(i,"Choose a real player.");
    const result = await raid(i.user.id,target.id);
    if (!result.ok) return sendError(i,result.error);
    return present(i,{embeds:[makeBattleEmbed(result.win?"OUTPOST RAID SUCCESS":"OUTPOST RAID FAILED",result,i.user.id,target.id)],components:[]});
  }
  if (name === "boss") {
    const {profile}=await snapshot(i.user.id);
    if (!profile.faction) return present(i,factionScreen(i.user.id));
    return present(i,bossScreen(profile,await bossSnapshot()));
  }
  if (name === "duel") {
    if (!target || target.bot) return sendError(i,"Choose a real player.");
    const ranked=Boolean(i.options.getBoolean("ranked"));
    const result=await proposeDuel(i.user.id,target.id,ranked);
    if (!result.ok) return sendError(i,result.error);
    const embed=new EmbedBuilder().setColor(BLUE).setTitle(ranked?"RANKED SQUAD DUEL":"SQUAD DUEL CHALLENGE").setDescription(`<@${i.user.id}> has challenged <@${target.id}>.\nThe opponent has 5 minutes to accept. Results depend on equipped cards, upgrades and abilities.${ranked?"\nWinner gains 22 rating; loser loses 18. Rematches only count once a day.":""}`);
    return present(i,{content:`<@${target.id}>`,embeds:[embed],components:[row(new ButtonBuilder().setCustomId(`gb:duel:${result.id}:yes`).setLabel("Accept Duel").setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`gb:duel:${result.id}:no`).setLabel("Decline").setStyle(ButtonStyle.Secondary))],allowedMentions:{users:[target.id]}});
  }
  if (name === "trade") {
    if (!target || target.bot) return sendError(i,"Choose a real player.");
    const offer=i.options.getString("your_card"), wanted=i.options.getString("their_card");
    if (!idPattern.test(offer) || !idPattern.test(wanted)) return sendError(i,"Use the 8-character card IDs shown by /cards.");
    const result=await proposeTrade(i.user.id,target.id,offer,wanted);
    if (!result.ok) return sendError(i,result.error);
    const embed=new EmbedBuilder().setColor(BLUE).setTitle("CARD TRADE OFFER")
      .setDescription(`<@${i.user.id}> offers **${result.offer.name}** for <@${target.id}>'s **${result.wanted.name}**.\n\nBoth cards must remain in reserve. Expires in 10 minutes.`);
    return present(i,{content:`<@${target.id}>`,embeds:[embed],components:[row(new ButtonBuilder().setCustomId(`gb:trade:${result.id}:yes`).setLabel("Accept Trade").setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`gb:trade:${result.id}:no`).setLabel("Decline").setStyle(ButtonStyle.Danger))],allowedMentions:{users:[target.id]}});
  }
  if (name === "rankings") return present(i,leaderboardScreen(await leaders()));
  if (name === "guild") return handleGuildSlash(i);
  if (name === "gameadmin") return handleAdminSlash(i,options);
  return null;
}

async function handleGuildSlash(i) {
  const sub = i.options.getSubcommand(),{profile}=await snapshot(i.user.id);
  let result;
  if (sub === "create") result=await createGuild(i.user.id,i.options.getString("name"));
  else if (sub === "join") result=await joinGuild(i.user.id,i.options.getString("code"));
  else if (sub === "leave") result=await leaveGuild(i.user.id);
  else if (sub === "donate") result=await donateGuild(i.user.id,i.options.getInteger("amount"));
  else if (sub === "research") result=await researchGuild(i.user.id,i.options.getString("type"));
  else if (sub === "transfer") result=await transferGuild(i.user.id,i.options.getUser("player",true).id);
  else if (sub === "leaderboard") {
    const guilds=await guildDetails(null);
    return present(i,{embeds:[new EmbedBuilder().setColor(BLUE).setTitle("GUILD LEADERBOARD")
      .setDescription(guilds.map((g,n)=>`**${n+1}. ${g.name}** · ${num(g.weekScore)} CP · ${g.members.length} members`).join("\n")||"No guilds yet.")],components:[]});
  } else if (sub === "info") {
    if (!profile.guild) return sendError(i,"You aren't in a guild. Create one with /guild create, or join with /guild join.");
    const g=await guildDetails(profile.guild);
    return present(i,{embeds:[new EmbedBuilder().setColor(BLUE).setTitle(g?.name||"Guild")
      .setDescription(`Code **${g?.code}**\nLeader <@${g?.ownerId}>\nMembers **${g?.members.length}/20**\nWeekly Points **${num(g?.weekScore)}**\nTreasury **${num(g?.treasury)} Credits**\nEconomy Research **${g?.upgrades?.economy||0}/10** · War Tactics **${g?.upgrades?.war||0}/10**`)],components:[]});
  }
  if (!result?.ok) return sendError(i,result?.error||"Action failed.");
  return present(i,{embeds:[new EmbedBuilder().setColor(BLUE).setTitle("GUILD UPDATED")
    .setDescription(result.guild?`**${result.guild.name}** · Code \`${result.guild.code}\``:sub==="donate"?`Treasury: **${num(result.treasury)} Credits**`:sub==="research"?`Guild ${result.type} research upgraded to **${result.level}**.`:"Guild membership updated.")],components:[]},{privateReply:true});
}

async function isOwner(i, options) {
  // Game profiles are global. Never let the owner of an unrelated guild issue
  // admin commands against TARC players or grant themselves competitive cards.
  const mainGuildId=String(process.env.TARC_MAIN_GUILD_ID || process.env.GUILD_ID || String(process.env.GUILD_IDS || "").split(",")[0]).trim();
  if (!mainGuildId || i.guildId!==mainGuildId) return false;
  const ids=String(process.env.GAME_OWNER_DISCORD_IDS || "").split(",").map(x=>x.trim());
  if (ids.includes(i.user.id) || i.guild?.ownerId === i.user.id) return true;
  return typeof options?.isGameOwner === "function" && await options.isGameOwner(i);
}
async function handleAdminSlash(i,options) {
  await i.deferReply({ephemeral:true});
  if (!i.inGuild() || !(await isOwner(i,options))) return sendError(i,"Only verified TARC ownership can use these controls in the main server.");
  const sub=i.options.getSubcommand();
  if (sub === "drops") {
    const channel=i.options.getChannel("channel",true);
    if (!channel.isTextBased() || !channel.permissionsFor(i.client.user)?.has("SendMessages")) return sendError(i,"The bot needs to be able to send messages in that channel.");
    await configureDropChannel(channel.id,i.user.id);
    return sendError(i,`Automatic card drops scheduled in <#${channel.id}>. First drop in about 3 minutes.`);
  }
  if (sub === "dropnow") {
    const {config}=await scheduledGameState();
    if (!config.dropChannelId) return sendError(i,"Set the drop channel first with /gameadmin drops.");
    const channel=await i.client.channels.fetch(config.dropChannelId).catch(()=>null);
    if (!channel?.isTextBased() || !channel?.send || !channel.permissionsFor(i.client.user)?.has("SendMessages"))
      return sendError(i,"The bot cannot send messages to the configured drop channel.");
    const drop=await startAutomaticDrop(channel.id,{force:true,actor:i.user.id});
    if (!drop) return sendError(i,"A card drop is already active. Wait for it to finish.");
    await publishCardDrop(channel,drop);
    return sendError(i,`Card drop posted to <#${channel.id}>.`);
  }
  const target=i.options.getUser("player",true),id=target.id;
  let result;
  if (sub==="reset") {
    if (i.options.getString("confirm")!=="RESET") return sendError(i,"Type RESET exactly to reset this player.");
    result=await adminGameAction(i.user.id,"reset",id,"",0);
  } else if (sub==="set") result=await adminGameAction(i.user.id,"set",id,i.options.getString("stat"),i.options.getInteger("value"));
  else if (sub==="grantcard") result=await adminGameAction(i.user.id,"grantcard",id,i.options.getString("card_id"),i.options.getInteger("amount")||1);
  else if (sub==="fulfill") result=await adminGameAction(i.user.id,"prize",id,"",0);
  if (!result?.ok) return sendError(i,result?.error||"Invalid admin action.");
  return sendError(i,`<@${id}>: ${result.message}`);
}

async function handleOwnerComponent(i) {
  const pieces=i.customId.split(":"),owner=pieces[1],action=pieces.slice(2).join(":");
  if (owner!==i.user.id) return sendError(i,"This is someone else's game panel. Use /game to open yours.");
  // Acknowledge the click before disk I/O. Discord invalidates unacknowledged
  // interactions after three seconds, even if the action itself succeeded.
  if (!i.deferred && !i.replied) await i.deferUpdate();
  const value=i.isStringSelectMenu()?i.values[0]:null;
  if (action==="faction") {
    const result=await chooseFaction(owner,value);
    if (!result.ok) return sendError(i,result.error);
    return showHome(i,"Faction chosen. Your 5 starter cards have been deployed.",true);
  }
  const {profile:p}=await snapshot(owner);
  if (!p.faction) return present(i,factionScreen(owner),{update:true});
  if (action==="home") return present(i,homeScreen(p,Date.now(),"",displayName(i),avatarURL(i)),{update:true});
  if (action==="base") return present(i,baseScreen(p),{update:true});
  if (action==="cards") return present(i,collectionScreen(p),{update:true});
  if (action.startsWith("page:")) return present(i,collectionScreen(p,Number(action.split(":")[1])),{update:true});
  if (action==="inspect") return present(i,inspectScreen(p,value),{update:true});
  if (action.startsWith("inspect:")) return present(i,inspectScreen(p,action.split(":")[1]),{update:true});
  if (action==="upgrades") return present(i,upgradesScreen(p),{update:true});
  if (action==="shop" || action==="market") return present(i,shopScreen(p),{update:true});
  if (action==="missions") return present(i,missionsScreen(p),{update:true});
  if (action==="boss") return present(i,bossScreen(p,await bossSnapshot()),{update:true});
  if (action==="help") return present(i,helpScreen(p),{update:true});
  if (action==="leaderboard") return present(i,leaderboardScreen(await leaders(),undefined,owner),{update:true});
  if (action==="navigate") {
    if (value==="missions") return present(i,missionsScreen(p),{update:true});
    if (value==="boss") return present(i,bossScreen(p,await bossSnapshot()),{update:true});
    if (value==="quests") return present(i,questsScreen(p),{update:true});
    if (value==="shop") return present(i,shopScreen(p),{update:true});
    if (value==="leaderboard") return present(i,leaderboardScreen(await leaders(),undefined,owner),{update:true});
    return present(i,helpScreen(p),{update:true});
  }
  if (action.startsWith("quests")) return present(i,questsScreen(p,action.split(":")[1]||"daily"),{update:true});
  if (action.startsWith("cardoptions:")) return present(i,cardOptionsScreen(p,action.split(":")[1]),{update:true});
  if (action.startsWith("discard:")) return present(i,recycleConfirmScreen(p,action.split(":")[1]),{update:true});
  if (action.startsWith("confirmdiscard:")) {
    const result=await recycleCard(owner,action.split(":")[1]);
    if (!result.ok) return sendError(i,result.error);
    return present(i,collectionScreen((await snapshot(owner)).profile,0,`Recycled ${result.name} for ${result.scrap} Scrap.`),{update:true});
  }
  if (action==="roll" || action==="reroll") {
    const result=await roll(owner);
    if (!result.ok) return sendError(i,result.error);
    return present(i,rollScreen((await snapshot(owner)).profile,result.found,result.spent),{update:true});
  }
  if (action==="buycrate" || action==="previewcrate")
    return present(i,cratePreviewScreen(p,value),{update:true});
  if (action==="previewdeal") return present(i,cratePreviewScreen(p,null,true),{update:true});
  if (action.startsWith("opencrate:")) {
    const crate=action.split(":")[1];
    if (!CRATES[crate]) return sendError(i,"That crate isn't available. Return to the shop.");
    const result=await roll(owner,crate);
    if (!result.ok) return sendError(i,result.error);
    return present(i,rollScreen((await snapshot(owner)).profile,result.found,result.spent),{update:true});
  }
  if (action==="deal") {
    const result=await buyDailyDeal(owner);
    if (!result.ok) return sendError(i,result.error);
    return present(i,rollScreen((await snapshot(owner)).profile,result.found,result.spent),{update:true});
  }
  if (action==="daily") {
    const result=await daily(owner);
    if (!result.ok) return sendError(i,result.error);
    return present(i,rollScreen((await snapshot(owner)).profile,[result.card],0),{update:true});
  }
  if (action==="income") {
    // Compatibility for buttons still visible in older messages.
    return present(i,homeScreen(p,Date.now(),"Income is now paid automatically when you return to the game.",displayName(i),avatarURL(i)),{update:true});
  }
  if (action==="upgradebase") {
    const result=await upgradeBase(owner);
    if (!result.ok) return sendError(i,result.error);
    return present(i,baseScreen((await snapshot(owner)).profile,`Base upgraded to level ${result.level}.`),{update:true});
  }
  if (action==="research") {
    const result=await upgradeAttribute(owner,value);
    if (!result.ok) return sendError(i,result.error);
    return present(i,upgradesScreen((await snapshot(owner)).profile,`Upgraded ${value} to level ${result.rank}.`),{update:true});
  }
  if (action.startsWith("set:")) {
    const [,uid,role]=action.split(":");
    const result=await assignCard(owner,uid,role);
    if (!result.ok) return sendError(i,result.error);
    return present(i,inspectScreen((await snapshot(owner)).profile,uid,`Assigned to ${role}.`),{update:true});
  }
  if (action.startsWith("assign:")) {
    const uid=action.split(":")[1];
    const result=await assignCard(owner,uid,value);
    if (!result.ok) return sendError(i,result.error);
    const location={combat:"Fighting Squad",production:"Income Workers",reserve:"Storage"}[value]||"Storage";
    return present(i,inspectScreen((await snapshot(owner)).profile,uid,`Moved to ${location}.`),{update:true});
  }
  if (action.startsWith("upgrade:") || action.startsWith("fuse:")) {
    const [op,uid]=action.split(":");
    const result=await upgradeCard(owner,uid,op==="fuse");
    if (!result.ok) return sendError(i,result.error);
    return present(i,inspectScreen((await snapshot(owner)).profile,uid,`Card upgraded to level ${result.level}.`),{update:true});
  }
  if (action.startsWith("ability:")) {
    const uid=action.split(":")[1],result=await trainAbility(owner,uid);
    if (!result.ok) return sendError(i,result.error);
    return present(i,inspectScreen((await snapshot(owner)).profile,uid,`Special ability trained to level ${result.level}.`),{update:true});
  }
  if (action==="mission" || action==="event") {
    const result=await runMission(owner,action==="event"?"droid":value,{event:action==="event"});
    if (!result.ok) return sendError(i,result.error);
    return present(i,missionsScreen((await snapshot(owner)).profile,Date.now(),`${result.win?"Mission succeeded":"Squad withdrew"}: **${result.name}**. +${num(result.credits)} Credits, +${num(result.xp)} XP, +${num(result.scrap)} Scrap.`),{update:true});
  }
  if (action==="salvage") {
    const result=await salvage(owner);
    if (!result.ok) return sendError(i,result.error);
    return present(i,missionsScreen((await snapshot(owner)).profile,Date.now(),`Salvaged ${result.scrap} Scrap and 85 Credits.`),{update:true});
  }
  if (action==="attackboss") {
    const result=await attackBoss(owner);
    if (!result.ok) return sendError(i,result.error);
    return present(i,bossScreen((await snapshot(owner)).profile,await bossSnapshot(),`Dealt **${num(result.damage)} damage**. +${result.defeated?"The boss was defeated! ":""}Rewards have been added.`),{update:true});
  }
  if (action.startsWith("claimquest:")) {
    const period=action.split(":")[1],result=await claimQuest(owner,period,value);
    if (!result.ok) return sendError(i,result.error);
    return present(i,questsScreen((await snapshot(owner)).profile,period,Date.now(),`Quest complete: +${num(result.rewards.credits)} Credits, +${num(result.rewards.xp)} XP, +${num(result.points)} CP.`),{update:true});
  }
  // Stale buttons from before a deployment should recover into a valid menu.
  return showHome(i,"This menu has been updated. You can continue here.",true);
}

async function handlePublicComponent(i) {
  const [,type,token,decision]=i.customId.split(":");
  if (type==="drop") {
    const result=await enterDrop(token,i.user.id);
    return sendError(i,result.ok?`You're entered for this card drop (${result.entered} entrants so far). Winners are picked when the timer ends.`:result.error);
  }
  if (!["trade","duel"].includes(type)) return sendError(i,"Unknown button.");
  const result=type==="trade" ? await answerTrade(token,i.user.id,decision==="yes") : await answerDuel(token,i.user.id,decision==="yes");
  if (!result.ok) return sendError(i,result.error);
  const message=result.declined?`${type==="trade"?"Trade":"Duel"} declined.`:type==="trade"?`Trade completed. Both cards have been transferred.`:`Duel complete. Winner: <@${result.winner}>.`;
  return i.update({content:message,embeds:[],components:[],allowedMentions:{parse:[]}});
}

export async function handleGalacticInteraction(i,options={}) {
  if (i.isChatInputCommand() && ["game","roll","cards","catalog","raid","boss","duel","trade","rankings","guild","gameadmin"].includes(i.commandName)) {
    if (i.commandName!=="gameadmin" && !i.deferred && !i.replied)
      await i.deferReply(["cards","catalog"].includes(i.commandName)?{flags:MessageFlags.Ephemeral}:{});
    await handleSlash(i,options);return true;
  }
  if ((i.isButton() || i.isStringSelectMenu()) && i.customId?.startsWith("ga:")) {
    await handleOwnerComponent(i);return true;
  }
  if (i.isButton() && i.customId?.startsWith("gb:")) {
    await handlePublicComponent(i);return true;
  }
  return false;
}

let timer;
async function publishCardDrop(channel,drop) {
  const card=getCard(drop.cardId),embed=cardEmbed(card,null,"GALACTIC CARD DROP");
  embed.setFooter({text:"Enter within 2 minutes. Up to 3 winners are picked randomly."});
  const sent=await channel.send({embeds:[embed],components:[row(new ButtonBuilder().setCustomId(`gb:drop:${drop.id}:enter`).setLabel("Enter Card Drop").setStyle(ButtonStyle.Success))]});
  await attachDropMessage(drop.id,sent.id);
}
export function startGalacticScheduler(client) {
  if (timer) return;
  const tick = async () => {
    const {config,event,doubleXp,week,winners}=await scheduledGameState();
    if (!config.dropChannelId) return;
    const channel=await client.channels.fetch(config.dropChannelId).catch(()=>null);
    if (!channel?.isTextBased() || !channel?.send) return;
    const previousWeek=winners[0]?.week;
    if (previousWeek && config.announcedWeek!==previousWeek) {
      const top=winners.slice(0,3);
      const desc=top.map(w=>`**#${w.position}** <@${w.userId}> · ${num(w.score)} Command Points`).join("\n");
      await channel.send({embeds:[new EmbedBuilder().setColor(0xe4bb58).setTitle("GALACTIC COMMAND · WEEKLY RESULTS")
        .setDescription(`${desc}\n\n**Automatic in-game prizes have been awarded.** Ownership will announce any external prizes separately.\nThe new season is live — check /rankings.`)]
        ,allowedMentions:{parse:[]}});
      await markWeeklyAnnouncement(previousWeek);
    }
    if (config.activeDrop && Date.now() >= config.activeDrop.expiresAt) {
      const done=await finishDrop();
      if (done) {
        const list=done.winners.length ? done.winners.map(id=>`<@${id}>`).join(", ") : "No entrants this time";
        await channel.send({content:`**Card drop finished:** ${getCard(done.cardId)?.name || "Card"}\nWinners: ${list}`,allowedMentions:{parse:[]}}).catch(console.error);
      }
    }
    if (!config.activeDrop && config.nextDropAt <= Date.now()) {
      const drop=await startAutomaticDrop(channel.id);
      if (drop) await publishCardDrop(channel,drop);
    }
    const eventKey=`${week}:${event.id}:${doubleXp?"xp":"normal"}`;
    if (config.announcedEvent!==eventKey) {
      // Avoid announcement spam after restarts and only announce active events.
      await updateEventAnnouncement(eventKey);
      if (event.active) await channel.send({embeds:[new EmbedBuilder().setColor(BLUE).setTitle(`LIVE EVENT: ${event.name}`).setDescription("Open /game → Missions → Join Live Event. Event missions award 1.5x rewards."+(doubleXp?"\nWeekend 2x XP is active.":""))]}).catch(console.error);
    }
  };
  timer=setInterval(()=>tick().catch(err=>console.error("[GALACTIC SCHEDULER]",err)),60000);
  timer.unref();
  tick().catch(err=>console.error("[GALACTIC SCHEDULER]",err));
}
