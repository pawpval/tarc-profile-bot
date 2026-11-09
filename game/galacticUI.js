import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, UserSelectMenuBuilder } from "discord.js";
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
const userSelect = (id, action, placeholder) => row(new UserSelectMenuBuilder().setCustomId(`ga:${id}:${action}`).setPlaceholder(placeholder));
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
    `**HP:** ${n(Math.round((card.defense * 2 + card.attack * .55) * scale))}  ·  **Attack:** ${n(Math.round(card.attack * scale))}  ·  **Defence:** ${n(Math.round(card.defense * scale))}`,
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
    .setDescription("Roll Star Wars cards, build a **five-card squad**, and battle other players.\n\nChoose your starting faction. Your **five free starter cards** will be from that faction; later rolls can contain characters from every faction.");
  const options = Object.entries(FACTIONS).map(([value,f]) => ({ value, label:f.name, description: value === "republic" ? "Clone troopers, Jedi and Republic divisions" : value === "cis" ? "Battle droids, MagnaGuards and commanders" : "Bounty hunters and Mandalorians" }));
  return { embeds:[embed],components:[ownerSelect(userId,"faction","Choose your faction",options)] };
}

export function homeScreen(p, now = Date.now(), note = "", displayName = "Commander", avatarUrl = null) {
  const faction = FACTIONS[p.faction];
  const embed = new EmbedBuilder().setColor(BLUE).setTitle(`${clean(displayName)}'s Galactic Command`)
    .setDescription([
      note ? `${note}\n` : null,
      `**${faction?.name}**`,
      `Level ${playerLevel(p.xp)} · ${rankFromLevel(playerLevel(p.xp))}`,
      "",
      `**Credits:** ${n(p.credits)}`,
      "",
      `**Cards:** ${n(p.cards.length)} collected`,
      `**Squad:** ${p.combat.length}/5 fighters equipped`,
      "",
      `**Auto-income:** +${n(hourlyIncome(p))} Credits/hour`
    ].filter(line=>line!==null).join("\n"))
    .setFooter({text:"Roll cards, equip your strongest five, then play missions."});
  if (avatarUrl) embed.setThumbnail(avatarUrl);
  const more = [
    { label: "Leaderboards", value:"leaderboard", description:"Compete for weekly rewards" },
    { label: "Trade Cards", value:"trade", description:"Swap cards with another player" },
    { label: "How to Play", value:"help", description:"A quick guide to your next steps" }
  ];
  return { embeds:[embed], components:[
    row(ownerButton(p.id,"roll","Roll Card",ButtonStyle.Success),ownerButton(p.id,"cards","My Cards",ButtonStyle.Primary),ownerButton(p.id,"missions","Missions",ButtonStyle.Primary),ownerButton(p.id,"shop","Shop",ButtonStyle.Primary)),
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
  const grouped=new Map();
  for (const owned of p.cards) {
    const existing=grouped.get(owned.cardId)||[];
    existing.push(owned);grouped.set(owned.cardId,existing);
  }
  const groups=[...grouped.values()].sort((a,b)=>Math.max(...b.map(c=>c.acquiredAt))-Math.max(...a.map(c=>c.acquiredAt)));
  const preferred=group=>[...group].sort((a,b)=>Number(p.combat.includes(b.uid))-Number(p.combat.includes(a.uid))||b.level-a.level)[0];
  const perPage = 10, pages = Math.max(1, Math.ceil(groups.length/perPage));
  const current = Math.max(0, Math.min(pages-1, Number(page)||0));
  const list=groups.slice(current*perPage,(current+1)*perPage).map(group=>({owned:preferred(group),copies:group.length}));
  const fighting = p.combat.map((uid,i) => {
    const owned=p.cards.find(c=>c.uid===uid),card=owned && getCard(owned.cardId);
    return `${i+1}. **${clean(card?.name || "Unknown")}**  ·  Lv ${owned?.level||1}`;
  });
  const text = list.map(({owned,copies},i) => {
    const c = getCard(owned.cardId);
    const assignment = p.combat.includes(owned.uid) ? "⚔️ Deck" : p.production.includes(owned.uid) ? "Working" : "Stored";
    return `**${current*perPage + i + 1}. ${clean(c?.name || "Unknown card")}** ×${copies}  ·  ${c?.rarity || "Unknown"}  ·  Lv ${owned.level}  ·  ${assignment}`;
  }).join("\n") || "No cards yet. Roll your first card to start collecting.";
  const options = list.map(({owned,copies}) => ({label:(getCard(owned.cardId)?.name || "Unknown").slice(0,100),description:`${copies} copies · Lv ${owned.level} · ${getCard(owned.cardId)?.rarity || "Unknown"}`,value:owned.uid}));
  const embed = new EmbedBuilder().setColor(BLUE).setTitle(`MY CARDS  ·  ${p.cards.length} COPIES`)
    .setDescription([note||null,"**Your fighting deck · 5 slots**",...fighting, ...(fighting.length?[`${5-fighting.length} empty slot(s)`]:["No fighters selected yet."]),"","**Collection**",text].filter(Boolean).join("\n"))
    .setFooter({text:`Page ${current+1} of ${pages} · Select a card to upgrade, equip or recycle`});
  // Classic Discord embeds permit one thumbnail, not individual thumbnails
  // beside each line. Keep the list readable and show one real card portrait.
  const firstCard=list[0]&&getCard(list[0].owned.cardId);
  if (firstCard) embed.setThumbnail(cardImage(firstCard));
  return { embeds:[embed],components:[
    ...(options.length ? [ownerSelect(p.id,"inspect","Choose a card to manage",options)] : []),
    row(...(pages>1?[ownerButton(p.id,`page:${current-1}`,"Previous").setDisabled(current===0),ownerButton(p.id,`page:${current+1}`,"Next").setDisabled(current===pages-1)]:[]),ownerButton(p.id,"roll","Roll Card",ButtonStyle.Success),homeButton(p.id))
  ] };
}

export function inspectScreen(p, uid, note = "") {
  const owned = p.cards.find(c => c.uid === uid), card = owned && getCard(owned.cardId);
  if (!card) return collectionScreen(p,0,"Card no longer exists.");
  const assignment = p.combat.includes(uid) ? "Fighting Deck" : p.production.includes(uid) ? "Working (passive income)" : "Storage";
  const sameCards = p.cards.filter(c=>c.cardId===owned.cardId),copies=sameCards.length;
  const embed = cardEmbed(card,owned,"MY CARD");
  embed.addFields({name:"Owned & equipped",value:`${copies} ${copies===1?"copy":"copies"}  ·  **${assignment}**  ·  +${n(card.income)} Credits/hr if working`});
  if (note) embed.addFields({name:"Updated",value:note.slice(0,1000)});
  return { embeds:[embed],components:[
    ...(copies>1?[ownerSelect(p.id,"inspect","Choose which copy to manage",sameCards.slice(0,25).map((copy,i)=>({label:`Copy ${i+1} · Lv ${copy.level}${copy.uid===uid?" (selected)":""}`,value:copy.uid,description:p.combat.includes(copy.uid)?"In fighting deck":p.production.includes(copy.uid)?"Working for Credits":"In storage"})))]:[]),
    row(ownerButton(p.id,`cardoptions:${uid}`,"Upgrade Card",ButtonStyle.Success),
      ownerButton(p.id,`set:${uid}:${p.combat.includes(uid)?"reserve":"combat"}`,p.combat.includes(uid)?"Remove from Deck":"Add to Deck",ButtonStyle.Primary),
      ownerButton(p.id,`set:${uid}:${p.production.includes(uid)?"reserve":"production"}`,p.production.includes(uid)?"Stop Working":"Make Worker")),
    row(ownerButton(p.id,`discard:${uid}`,"Delete Card",ButtonStyle.Danger),ownerButton(p.id,"cards","My Cards",ButtonStyle.Primary),homeButton(p.id))
  ] };
}

export function cardOptionsScreen(p, uid, note = "") {
  const owned=p.cards.find(c=>c.uid===uid), card=owned && getCard(owned.cardId);
  if (!card) return collectionScreen(p,0,"Card no longer exists.");
  const duplicate=p.cards.find(c=>c.uid!==uid && c.cardId===owned.cardId && !p.combat.includes(c.uid) && !p.production.includes(c.uid));
  const rarity=RARITIES[card.rarity].multiplier;
  const abilityCost=Math.round(800*(owned.abilityLevel||1)*rarity);
  const cost=Math.round(260*owned.level*rarity),scrap=Math.max(1,Math.ceil(owned.level/2));
  return {embeds:[new EmbedBuilder().setColor(BLUE).setTitle("UPGRADE CARD").setDescription([
    note||null,`**${card.name} · Level ${owned.level}/20**`,"",
    `**Level up:** ${owned.level>=20?"Max level":`${n(cost)} Credits + ${scrap} Scrap`}`,
    `**Improve ability:** ${owned.abilityLevel>=5?"Max level":`${n(abilityCost)} Credits + ${(owned.abilityLevel||1)*4} Scrap`}`,
    `**Merge copy:** ${duplicate?"Ready · +2 levels":"Requires an extra stored copy"}`,
    "","*Your duplicate is consumed when merged.*"
  ].filter(Boolean).join("\n"))],components:[
    row(ownerButton(p.id,`upgrade:${uid}`,"Level Up",ButtonStyle.Success).setDisabled(owned.level>=20),ownerButton(p.id,`ability:${uid}`,"Improve Ability").setDisabled(owned.abilityLevel>=5),ownerButton(p.id,`fuse:${uid}`,"Merge Copy",ButtonStyle.Primary).setDisabled(!duplicate||owned.level>=20)),
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
    "Only a card in Storage can be deleted. Remove it from your deck or workers first."
  ].join("\n"))],components:[row(ownerButton(p.id,`confirmdiscard:${uid}`,"Yes, Recycle",ButtonStyle.Danger),ownerButton(p.id,`inspect:${uid}`,"Cancel",ButtonStyle.Primary),homeButton(p.id))]};
}

export function rollScreen(p, found, cost = 300) {
  const card = found[0];
  const embed = cardEmbed(card,{level:1,uid:card.uid},found.length === 1 ? "NEW CARD!" : `${found.length} NEW CARDS!`);
  if (found.length > 1) embed.addFields({name:"Pack contents",value:found.map(c=>`${c.rarity} · **${clean(c.name)}** · \`${c.uid}\``).join("\n").slice(0,1024)});
  embed.setFooter({text:`${cost?`${n(cost)} Credits spent`:"Free reward"}  ·  ${n(p.credits)} Credits left  ·  Saved to My Cards`});
  const copies=p.cards.filter(c=>c.cardId===card.id).length;
  if (found.length===1 && copies>1) embed.addFields({name:"Duplicate",value:`You own ${copies} copies. Open Upgrade Card to merge two copies for +2 levels.`});
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
    "**Single card:** 300 Credits · use Roll Card.",
    "**Crates:** 3 cards each, with different rarity chances.",
    "Choose a crate from the price-labelled list below.",
    "",
    `**Daily deal:** ${deal.crate.name} · ${n(deal.price)} Credits${p.cooldowns.dailyDeal===deal.key?" · Already purchased":""}`
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
  return { embeds:[new EmbedBuilder().setColor(BLUE).setTitle("MISSIONS").setDescription([
    note||null,
    "Use your **five-card fighting deck** to earn Credits, XP and Scrap.",
    `**Ready:** ${ready}/${missions.length} · Pick a mission below.`,
    event.active ? `**Bonus active:** ${event.name} · 1.5x rewards` : null,
    isDoubleXp(now)?"**Weekend bonus:** 2x XP":null,
  ].filter(Boolean).join("\n"))],components:[ownerSelect(p.id,"mission","Choose a mission · rewards shown",options),row(ownerButton(p.id,"quests:daily","Daily Objectives",ButtonStyle.Primary),ownerButton(p.id,"salvage","Collect Scrap"),homeButton(p.id))] };
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
  return { embeds:[new EmbedBuilder().setColor(BLUE).setTitle(`${period.toUpperCase()} OBJECTIVES`).setDescription((note?note+"\n\n":"")+"Finish objectives to earn extra rewards.\n\n"+desc)],components:[
    ...claimMenu,
    row(ownerButton(p.id,"quests:daily","Daily",period==="daily"?ButtonStyle.Success:ButtonStyle.Secondary),ownerButton(p.id,"quests:weekly","Weekly",period==="weekly"?ButtonStyle.Success:ButtonStyle.Secondary),ownerButton(p.id,"quests:monthly","Monthly",period==="monthly"?ButtonStyle.Success:ButtonStyle.Secondary)),
    row(ownerButton(p.id,"missions","Missions",ButtonStyle.Primary),homeButton(p.id))
  ] };
}

export function leaderboardScreen(rows, title = "WEEKLY COMMAND RANKINGS", userId = null) {
  const embed = new EmbedBuilder().setColor(BLUE).setTitle(title).setDescription(rows.length ? rows.map((p,i)=>`**${i+1}.** <@${p.id}> · **${n(p.weekScore)} points** · ${getLeague(p.weekScore)}`).join("\n") : "No active players yet.")
    .setFooter({text:"Weekly scores reset on Mondays (UTC). Cards and Credits remain. Top 3 win automatic game rewards."});
  return { embeds:[embed],components:userId?[row(homeButton(userId))]:[] };
}

export function helpScreen(p) {
  return { embeds:[new EmbedBuilder().setColor(BLUE).setTitle("HOW TO PLAY")
    .setDescription([
      "**1. Roll cards.** One card costs 300 Credits. Your starter squad is free.",
      "**2. Build your deck.** Equip up to five fighters in My Cards. Your deck handles missions and battles.",
      "**3. Earn automatically.** Workers generate Credits while you're away (up to 12 hours offline).",
      "**4. Play missions.** Complete operations and daily/weekly objectives for rewards.",
      "**5. Compete.** Battle, raid and climb the weekly leaderboard to win prizes.",
      "",
      "*Your collection and Credits stay yours. Only the weekly leaderboard resets.*"
    ].join("\n"))],components:[row(homeButton(p.id))] };
}

export function tradeScreen(p,note="") {
  return {embeds:[new EmbedBuilder().setColor(BLUE).setTitle("TRADE CARDS")
    .setDescription([note||null,"Trade one **stored card** for another player's stored card.","","**Step 1:** Choose the player you want to trade with.","**Step 2:** Pick your card, then theirs.","They'll receive a separate trade request to accept or decline."].filter(Boolean).join("\n"))],components:[
    userSelect(p.id,"tradetarget","Choose a player to trade with"),row(ownerButton(p.id,"cards","My Cards",ButtonStyle.Primary),homeButton(p.id))
  ]};
}

export function tradeOfferScreen(p,other) {
  const options=p.cards.filter(c=>!p.combat.includes(c.uid) && !p.production.includes(c.uid))
    .sort((a,b)=>b.acquiredAt-a.acquiredAt).slice(0,25).map(owned=>({label:clean(getCard(owned.cardId)?.name||"Unknown"),value:owned.uid,description:`${getCard(owned.cardId)?.rarity||"Unknown"} · Lv ${owned.level} · ${owned.uid}`}));
  return {embeds:[new EmbedBuilder().setColor(BLUE).setTitle("TRADE · YOUR CARD")
    .setDescription(`Trading with <@${other}>.\n\nChoose a card from your **Storage** to offer.${options.length?"":"\n\nYou have no stored cards. Move one from your deck first."}`)],components:[
      ...(options.length?[ownerSelect(p.id,`tradeoffer:${other}`,"Choose your card",options)]:[]),row(ownerButton(p.id,"trade","Back to Trade",ButtonStyle.Primary),homeButton(p.id))
    ]};
}

export function tradeWantedScreen(p,other,offerUid,otherProfile) {
  const owned=p.cards.find(c=>c.uid===offerUid),card=owned&&getCard(owned.cardId);
  const options=otherProfile.cards.filter(c=>!otherProfile.combat.includes(c.uid) && !otherProfile.production.includes(c.uid))
    .sort((a,b)=>b.acquiredAt-a.acquiredAt).slice(0,25).map(item=>({label:clean(getCard(item.cardId)?.name||"Unknown"),value:item.uid,description:`${getCard(item.cardId)?.rarity||"Unknown"} · Lv ${item.level} · ${item.uid}`}));
  return {embeds:[new EmbedBuilder().setColor(BLUE).setTitle("TRADE · THEIR CARD")
    .setDescription(`**You offer:** ${card?.name||"Unknown card"}\n**Trading with:** <@${other}>\n\nChoose the card you want in return.${options.length?"":"\n\nThat player has no stored cards available."}`)],components:[
      ...(options.length?[ownerSelect(p.id,`tradewant:${other}:${offerUid}`,"Choose their card",options)]:[]),
      row(ownerButton(p.id,`tradetargetback:${other}`,"Back",ButtonStyle.Primary),homeButton(p.id))
    ]};
}

export function statsLine(p) { return `Level ${playerLevel(p.xp)} · ${rankFromLevel(playerLevel(p.xp))} · ${n(p.credits)} Credits · ${n(p.weekScore)} CP`; }
