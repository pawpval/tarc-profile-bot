import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } from "discord.js";
import { ABILITIES, CARD_CATALOG, CRATES, FACTIONS, MISSIONS, RARITIES, dailyContract, getCard, getLeague, rankFromLevel } from "./galacticCatalog.js";
import { activeQuests, combatSlots, combatStats, currentEvent, dailyDeal, hourlyIncome, isDoubleXp, playerLevel, productionSlots } from "./galacticState.js";
import { realStarWarsImage } from "./galacticImages.js";

export const BLUE = 0x2b7fff;
const n = value => Number(value || 0).toLocaleString("en-GB");
const ownerButton = (id, action, label, style = ButtonStyle.Secondary) =>
  new ButtonBuilder().setCustomId(`ga:${id}:${action}`).setLabel(label).setStyle(style);
const homeButton = id => ownerButton(id,"home","Home",ButtonStyle.Primary).setEmoji("🏠");
const row = (...components) => new ActionRowBuilder().addComponents(...components);
const ownerSelect = (id, action, placeholder, entries) => row(new StringSelectMenuBuilder()
  .setCustomId(`ga:${id}:${action}`).setPlaceholder(placeholder).addOptions(entries.slice(0,25)));
const clean = text => String(text || "").replace(/[@`]/g, "").slice(0,100);

export function cardImage(card) {
  return realStarWarsImage(card);
}

export function cardEmbed(card, owned = null, title = "CARD ACQUIRED") {
  const level = owned?.level || 1;
  const scale = 1 + (level - 1) * .13;
  const detail = [
    `**${card.name}**`,
    `${card.rarity}  ·  ${FACTIONS[card.faction]?.short || "Unknown"}  ·  ${card.role}`,
    "",
    `**Attack:** ${n(Math.round(card.attack * scale))}     **Defence:** ${n(Math.round(card.defense * scale))}`,
    `**Income:** ${n(Math.round(card.income * scale))} Credits/hr when assigned as a worker`,
    `**Ability:** ${ABILITIES[card.ability] || "None"}`,
    ...(owned ? ["",`**Level ${level}**${owned.uid ? `  ·  ID: \`${owned.uid}\`` : ""}`] : [])
  ];
  const embed = new EmbedBuilder().setColor(RARITIES[card.rarity]?.color || BLUE).setTitle(title).setDescription(detail.join("\n"));
  const image = cardImage(card);
  if (image) embed.setImage(image);
  return embed;
}

export function factionScreen(userId) {
  const embed = new EmbedBuilder().setColor(BLUE).setTitle("GALACTIC COMMAND")
    .setDescription("Build your own outpost, collect cards and battle other players.\n\nChoose a faction to receive **5 starter cards**, an active squad and production units. Your cards can still come from every faction.");
  const options = Object.entries(FACTIONS).map(([value,f]) => ({ value, label:f.name, description: value === "republic" ? "Clone troopers, Jedi and Republic divisions" : value === "cis" ? "Battle droids, MagnaGuards and commanders" : "Bounty hunters and Mandalorians" }));
  return { embeds:[embed],components:[ownerSelect(userId,"faction","Choose your faction",options)] };
}

export function homeScreen(p, now = Date.now(), note = "", displayName = "Commander", avatarUrl = null) {
  const faction = FACTIONS[p.faction];
  const embed = new EmbedBuilder().setColor(BLUE).setTitle(`${clean(displayName)}'s Galactic Command`)
    .setDescription([
      note || null,
      `**${faction?.name}**`,
      `**Level ${playerLevel(p.xp)}** | ${rankFromLevel(playerLevel(p.xp))}`,
      `**Credits:** ${n(p.credits)}   ·   **Cards:** ${n(p.cards.length)}`,
      `**Income:** +${n(hourlyIncome(p))}/hr (automatic)   ·   **Base:** Lv ${p.baseLevel}`,
      "",
      "*Roll cards → put them in your squad or base → earn more Credits.*"
    ].filter(Boolean).join("\n"));
  if (avatarUrl) embed.setThumbnail(avatarUrl);
  const more = [
    { label: "Missions & Events", value:"missions", description:"Send your squad on operations" },
    { label: "Weekly Community Boss", value:"boss", description:"Fight together for special rewards" },
    { label: "Leaderboards", value:"leaderboard", description:"Compete for weekly rewards" },
    { label: "How to Play", value:"help", description:"A quick guide to your next steps" }
  ];
  return { embeds:[embed], components:[
    row(ownerButton(p.id,"roll","Roll Card",ButtonStyle.Success),ownerButton(p.id,"cards","My Cards",ButtonStyle.Primary),ownerButton(p.id,"base","My Base",ButtonStyle.Primary)),
    row(ownerButton(p.id,"daily","Daily Pack",ButtonStyle.Success),ownerButton(p.id,"quests","Quests",ButtonStyle.Primary),ownerButton(p.id,"shop","Shop",ButtonStyle.Primary)),
    ownerSelect(p.id,"navigate","More activities",more)
  ] };
}

export function baseScreen(p, note = "") {
  const stats = combatStats(p);
  const cost = p.baseLevel * 1500, scrap = p.baseLevel * 4;
  const embed = new EmbedBuilder().setColor(BLUE).setTitle(`MY BASE  ·  LEVEL ${p.baseLevel}`)
    .setDescription([
      note || null,
      "Your cards can **fight**, **work**, or stay in **storage**. Manage them in My Cards."
    ].filter(Boolean).join("\n"));
  embed.addFields(
    {name:"Squad · Fights & raids",value:`${p.combat.length}/${combatSlots(p)} cards  ·  ${n(stats.attack)} attack  ·  ${n(stats.defense)} defence`,inline:false},
    {name:"Workers · Earn Credits",value:`${p.production.length}/${productionSlots(p)} cards  ·  **+${n(hourlyIncome(p))}/hr automatically**`,inline:false},
    {name:"Next base upgrade",value:p.baseLevel >= 30?"Your base is fully upgraded.":`${n(cost)} Credits + ${n(scrap)} Scrap · Unlocks stronger defences and more card slots`,inline:false}
  ).setFooter({text:`Your balance: ${n(p.credits)} Credits  ·  ${n(p.scrap)} Scrap`});
  return { embeds:[embed], components:[
    row(ownerButton(p.id,"upgradebase","Upgrade Base",ButtonStyle.Success).setDisabled(p.baseLevel>=30),ownerButton(p.id,"cards","My Cards",ButtonStyle.Primary)),
    row(ownerButton(p.id,"upgrades","Base Training"),homeButton(p.id))
  ] };
}

export function upgradesScreen(p, note = "") {
  const upgrades = [
    ["luck","Better Luck","Better chances of rare cards"],
    ["assault","Squad Attack","Your fighters hit harder"],
    ["fortify","Base Defence","Your fighters defend better"],
    ["logistics","Worker Income","Your workers earn more Credits"]
  ];
  const desc = upgrades.map(([id,label,description]) => {
    const rank = p.upgrades[id], price = Math.round(700 * (rank+1)**1.45);
    return `**${label} · Level ${rank}/10**\n${description}  ·  ${rank === 10 ? "Max level" : n(price) + " Credits to upgrade"}`;
  }).join("\n\n");
  return { embeds:[new EmbedBuilder().setColor(BLUE).setTitle("BASE TRAINING").setDescription((note?note+"\n\n":"")+"Choose one upgrade below. Each has a permanent bonus.\n\n"+desc)],components:[
    ownerSelect(p.id,"research","Choose a training upgrade",upgrades.map(([value,label])=>({value,label}))),
    row(ownerButton(p.id,"base","My Base",ButtonStyle.Primary),homeButton(p.id))
  ] };
}

export function collectionScreen(p, page = 0, note = "") {
  const perPage = 7, pages = Math.max(1, Math.ceil(p.cards.length/perPage));
  const current = Math.max(0, Math.min(pages-1, Number(page)||0));
  const list = [...p.cards].sort((a,b) => b.acquiredAt - a.acquiredAt).slice(current*perPage,(current+1)*perPage);
  const text = list.map((owned,i) => {
    const c = getCard(owned.cardId);
    const assignment = p.combat.includes(owned.uid) ? "Fighting" : p.production.includes(owned.uid) ? "Working" : "Stored";
    return `**${current*perPage + i + 1}. ${clean(c?.name || "Unknown card")}**\n${c?.rarity || "Unknown"} · Level ${owned.level} · ${assignment}`;
  }).join("\n\n") || "No cards yet. Roll your first card to start collecting.";
  const options = list.map(owned => ({label:(getCard(owned.cardId)?.name || "Unknown").slice(0,100),description:`Lv ${owned.level} · ${getCard(owned.cardId)?.rarity || "Unknown"} · ${owned.uid}`,value:owned.uid}));
  return { embeds:[new EmbedBuilder().setColor(BLUE).setTitle(`MY CARDS  ·  ${p.cards.length} OWNED`).setDescription((note?note+"\n\n":"")+"Select any card below to manage it.\n\n"+text).setFooter({text:`Page ${current+1} of ${pages}  ·  Fighting, Working or Stored`})],components:[
    ...(options.length ? [ownerSelect(p.id,"inspect","Choose a card to manage",options)] : []),
    row(...(pages>1?[ownerButton(p.id,`page:${current-1}`,"Previous").setDisabled(current===0),ownerButton(p.id,`page:${current+1}`,"Next").setDisabled(current===pages-1)]:[]),ownerButton(p.id,"base","My Base",ButtonStyle.Primary),homeButton(p.id))
  ] };
}

export function inspectScreen(p, uid, note = "") {
  const owned = p.cards.find(c => c.uid === uid), card = owned && getCard(owned.cardId);
  if (!card) return collectionScreen(p,0,"Card no longer exists.");
  const assignment = p.combat.includes(uid) ? "Fighting" : p.production.includes(uid) ? "Working" : "Stored";
  const copies = p.cards.filter(c=>c.cardId===owned.cardId).length;
  const embed = cardEmbed(card,owned,"MANAGE CARD");
  embed.addFields({name:"In your collection",value:`${copies} ${copies===1?"copy":"copies"}  ·  Currently: **${assignment}**`});
  const cost=Math.round(260*owned.level*RARITIES[card.rarity].multiplier), scrap=Math.max(1,Math.ceil(owned.level/2));
  embed.addFields({name:"Next level",value:owned.level>=20?"Maximum level reached":`${n(cost)} Credits + ${scrap} Scrap`});
  if (note) embed.addFields({name:"Updated",value:note.slice(0,1000)});
  return { embeds:[embed],components:[
    ownerSelect(p.id,`assign:${uid}`,"Move card to...",[
      {label:"Fighting Squad",value:"combat",description:"This card helps you battle and raid"},
      {label:"Income Workers",value:"production",description:"This card earns Credits automatically"},
      {label:"Storage",value:"reserve",description:"Keep card without using a slot"}
    ]),
    row(ownerButton(p.id,`upgrade:${uid}`,"Upgrade Card",ButtonStyle.Success).setDisabled(owned.level>=20),ownerButton(p.id,`cardoptions:${uid}`,"More Options")),
    row(ownerButton(p.id,"cards","My Cards",ButtonStyle.Primary),homeButton(p.id))
  ] };
}

export function cardOptionsScreen(p, uid, note = "") {
  const owned=p.cards.find(c=>c.uid===uid), card=owned && getCard(owned.cardId);
  if (!card) return collectionScreen(p,0,"Card no longer exists.");
  const duplicate=p.cards.find(c=>c.uid!==uid && c.cardId===owned.cardId && !p.combat.includes(c.uid) && !p.production.includes(c.uid));
  const rarity=RARITIES[card.rarity].multiplier;
  const abilityCost=Math.round(800*(owned.abilityLevel||1)*rarity);
  return {embeds:[new EmbedBuilder().setColor(BLUE).setTitle("CARD OPTIONS").setDescription([
    note||null,`**${card.name} · Level ${owned.level}**`,"",
    `**Train ability:** ${owned.abilityLevel>=5?"Max level":`${n(abilityCost)} Credits + ${(owned.abilityLevel||1)*4} Scrap`}`,
    "Improves this card's special bonus.",
    "",
    `**Fuse duplicate:** ${duplicate?"Available":"Requires a second stored copy"}`,
    "Use a duplicate to gain two card levels.",
    "",
    "**Recycle:** Permanently removes this card for Scrap."
  ].filter(Boolean).join("\n"))],components:[
    row(ownerButton(p.id,`ability:${uid}`,"Train Ability",ButtonStyle.Success),ownerButton(p.id,`fuse:${uid}`,"Fuse Copy").setDisabled(!duplicate),ownerButton(p.id,`discard:${uid}`,"Recycle",ButtonStyle.Danger)),
    row(ownerButton(p.id,`inspect:${uid}`,"Back to Card",ButtonStyle.Primary),homeButton(p.id))
  ]};
}

export function recycleConfirmScreen(p, uid) {
  const owned=p.cards.find(c=>c.uid===uid), card=owned && getCard(owned.cardId);
  if (!card) return collectionScreen(p,0,"Card no longer exists.");
  return {embeds:[new EmbedBuilder().setColor(0xdb5454).setTitle("RECYCLE THIS CARD?").setDescription([
    `**${card.name}** · ${card.rarity}`,
    "",
    "This permanently removes your copy. You will receive Scrap in return.",
    "Move it to Storage first if it is fighting or working."
  ].join("\n"))],components:[row(ownerButton(p.id,`confirmdiscard:${uid}`,"Yes, Recycle",ButtonStyle.Danger),ownerButton(p.id,`inspect:${uid}`,"Cancel",ButtonStyle.Primary),homeButton(p.id))]};
}

export function rollScreen(p, found, cost = 300) {
  const card = found[0];
  const embed = cardEmbed(card,{level:1,uid:card.uid},found.length === 1 ? "NEW CARD!" : `${found.length} NEW CARDS!`);
  if (found.length > 1) embed.addFields({name:"Pack contents",value:found.map(c=>`${c.rarity} · **${clean(c.name)}** · \`${c.uid}\``).join("\n").slice(0,1024)});
  embed.setFooter({text:`${cost?`${n(cost)} Credits spent`:"Free reward"}  ·  ${n(p.credits)} Credits left  ·  Saved to My Cards`});
  return { embeds:[embed],components:[row(ownerButton(p.id,"reroll","Roll Again · 300",ButtonStyle.Success).setDisabled(p.credits<300),ownerButton(p.id,found.length===1?`inspect:${card.uid}`:"cards",found.length===1?"Manage Card":"My Cards",ButtonStyle.Primary),homeButton(p.id))] };
}

export function shopScreen(p,note = "") {
  const entries = Object.entries(CRATES).sort((a,b)=>a[1].price-b[1].price).map(([id,c])=>({
    label:`${c.name} — ${n(c.price)} Credits`,value:id,
    description:(id === "elite" || id === "legendary") ? `${c.count} cards · Improved rare card odds` : `${c.count} cards · ${c.pool?FACTIONS[c.pool].short:"All factions"}`
  }));
  const deal=dailyDeal();
  return { embeds:[new EmbedBuilder().setColor(BLUE).setTitle("CARD SHOP").setDescription([
    note || null,
    `**You have ${n(p.credits)} Credits.**`,
    "",
    "Each crate contains **3 random cards**. More expensive crates offer better chances of rare cards.",
    "",
    "**Choose a crate below** to see its price before buying.",
    "",
    `**Today's deal:** ${deal.crate.name} · ${n(deal.price)} Credits (30% off)${p.cooldowns.dailyDeal===deal.key?" · Sold out":""}`
  ].filter(Boolean).join("\n"))],components:[ownerSelect(p.id,"previewcrate","Choose a crate (prices shown)",entries),row(ownerButton(p.id,"previewdeal","View Daily Deal",ButtonStyle.Success).setDisabled(p.cooldowns.dailyDeal===deal.key),ownerButton(p.id,"roll","Single Roll · 300",ButtonStyle.Success),homeButton(p.id))] };
}

export function cratePreviewScreen(p, crateId, isDeal = false) {
  const deal = dailyDeal(), crate = isDeal ? deal.crate : CRATES[crateId];
  if (!crate) return shopScreen(p,"That crate is unavailable.");
  const price = isDeal ? deal.price : crate.price;
  return {embeds:[new EmbedBuilder().setColor(BLUE).setTitle("OPEN CRATE?").setDescription([
    `**${crate.name}**`,
    "",
    `**Cards inside:** ${crate.count} random cards`,
    `**Price:** ${n(price)} Credits${isDeal?" (today's discount)":""}`,
    `**Your balance:** ${n(p.credits)} Credits`,
    "",
    p.credits<price?`You need **${n(price-p.credits)} more Credits**. Complete missions to earn more.`:"Confirm to spend Credits and receive your cards immediately."
  ].join("\n"))],components:[row(ownerButton(p.id,isDeal?"deal":`opencrate:${crateId}`,"Open Crate",ButtonStyle.Success).setDisabled(p.credits<price),ownerButton(p.id,"shop","Back to Shop",ButtonStyle.Primary),homeButton(p.id))]};
}

export function missionsScreen(p, now = Date.now(), note = "") {
  const event = currentEvent(now);
  const missions=[...MISSIONS,dailyContract(now)];
  const ready=missions.filter(m=>now-(p.missions[m.id]||0)>=m.cooldown).length;
  const options=missions.map(m=>{const left=m.cooldown-(now-(p.missions[m.id]||0));return {
    label:m.name,value:m.id,description:`${left>0?"On cooldown":"Ready"} · ${n(m.credits[0])}–${n(m.credits[1])} Credits · ${m.xp} XP`
  };});
  return { embeds:[new EmbedBuilder().setColor(BLUE).setTitle("MISSIONS & LIVE EVENTS").setDescription([
    note||null,
    "Send your **Fighting Squad** on a mission to earn Credits, XP and Scrap.",
    "",
    `**Available missions:** ${ready}/${missions.length}`,
    event.active ? `**Live now:** ${event.name} · 1.5x rewards` : "**Live event:** Next operation starts soon.",
    isDoubleXp(now)?"**Weekend bonus:** 2x XP":null,
    "",
    "Choose a mission below to send your squad."
  ].filter(Boolean).join("\n"))],components:[ownerSelect(p.id,"mission","Choose your mission",options),row(ownerButton(p.id,"event","Join Live Event",ButtonStyle.Success).setDisabled(!event.active),ownerButton(p.id,"salvage","Collect Scrap"),ownerButton(p.id,"boss","Weekly Boss")),row(homeButton(p.id))] };
}

export function bossScreen(p, boss, note="") {
  const progress = Math.round(100*boss.hp/boss.maxHp);
  const leaders=Object.entries(boss.contributors).sort((a,b)=>b[1]-a[1]).slice(0,3);
  const embed=new EmbedBuilder().setColor(boss.defeated?0x2aaa83:0xc65dbb)
    .setTitle(`WEEKLY BOSS  ·  ${boss.name}`)
    .setDescription([
      note||null,
      boss.defeated ? "**Boss defeated!** A new one appears next Monday." : `**Health: ${n(boss.hp)}/${n(boss.maxHp)}**  ·  ${progress}%`,
      "Fight with your squad every 30 minutes to earn rewards.",
      "Top three damage dealers win bonus cards and Credits when the boss falls.",
      "",
      "**Top contributors**",
      ...leaders.map(([id,damage],i)=>`${i+1}. <@${id}>  ${n(damage)} damage`),
      leaders.length?null:"No attacks yet."
    ].filter(Boolean).join("\n"));
  return {embeds:[embed],components:[row(ownerButton(p.id,"attackboss","Attack Boss",ButtonStyle.Danger).setDisabled(boss.defeated),ownerButton(p.id,"missions","Missions",ButtonStyle.Primary),homeButton(p.id))]};
}

export function questsScreen(p, period = "daily", now = Date.now(), note = "") {
  const all = activeQuests(p,period,now);
  const desc = all.map(q => `**${q.label}** · ${Math.min(q.progress,q.target)}/${q.target} ${q.claimed?"(Claimed)":q.progress>=q.target?"(Ready to claim)":""}\n${n(q.credits)} Credits + ${n(q.xp)} XP`).join("\n\n");
  const claimable=all.filter(q=>!q.claimed && q.progress>=q.target);
  const claimMenu=claimable.length ? [ownerSelect(p.id,`claimquest:${period}`,`Claim ${claimable.length} ready quests`,claimable.map(q=>({
    label:q.label, value:q.id, description:`${n(q.credits)} Credits + ${n(q.xp)} XP`
  })))] : [];
  return { embeds:[new EmbedBuilder().setColor(BLUE).setTitle(`${period.toUpperCase()} QUESTS`).setDescription((note?note+"\n\n":"")+"Complete tasks, then claim your rewards.\n\n"+desc)],components:[
    ...claimMenu,
    row(ownerButton(p.id,"quests:daily","Daily",period==="daily"?ButtonStyle.Success:ButtonStyle.Secondary),ownerButton(p.id,"quests:weekly","Weekly",period==="weekly"?ButtonStyle.Success:ButtonStyle.Secondary),ownerButton(p.id,"quests:monthly","Monthly",period==="monthly"?ButtonStyle.Success:ButtonStyle.Secondary),homeButton(p.id))
  ] };
}

export function leaderboardScreen(rows, title = "WEEKLY COMMAND RANKINGS", userId = null) {
  const embed = new EmbedBuilder().setColor(BLUE).setTitle(title).setDescription(rows.length ? rows.map((p,i)=>`**${i+1}.** <@${p.id}> · **${n(p.weekScore)} points** · ${getLeague(p.weekScore)}`).join("\n") : "No active players yet.")
    .setFooter({text:"Weekly scores reset every Monday (UTC). Cards, bases and Credits remain. Top 3 receive automatic in-game rewards."});
  return { embeds:[embed],components:userId?[row(homeButton(userId))]:[] };
}

export function helpScreen(p) {
  return { embeds:[new EmbedBuilder().setColor(BLUE).setTitle("HOW TO PLAY")
    .setDescription([
      "**1. Roll cards.** One card costs 300 Credits. Your starter squad is free.",
      "**2. Use your cards.** Put fighters in your Squad or workers in your Base from My Cards.",
      "**3. Earn automatically.** Workers generate Credits while you're away (up to 12 hours offline).",
      "**4. Play more.** Use Daily Pack, Quests and Missions for extra rewards.",
      "**5. Compete.** Battle, raid and climb the weekly leaderboard to win prizes.",
      "",
      "*Your cards, Credits and base stay yours. Only the weekly leaderboard resets.*"
    ].join("\n"))],components:[row(homeButton(p.id))] };
}

export function statsLine(p) { return `Level ${playerLevel(p.xp)} · ${rankFromLevel(playerLevel(p.xp))} · ${n(p.credits)} Credits · ${n(p.weekScore)} CP`; }
