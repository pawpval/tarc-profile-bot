import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } from "discord.js";
import { ABILITIES, CARD_CATALOG, CRATES, FACTIONS, MISSIONS, RARITIES, dailyContract, getCard, getLeague, rankFromLevel } from "./galacticCatalog.js";
import { activeQuests, combatSlots, combatStats, currentEvent, dailyDeal, hourlyIncome, isDoubleXp, playerLevel, productionSlots } from "./galacticState.js";
import { realStarWarsImage } from "./galacticImages.js";

export const BLUE = 0x2b7fff;
const n = value => Number(value || 0).toLocaleString("en-GB");
const ownerButton = (id, action, label, style = ButtonStyle.Secondary) =>
  new ButtonBuilder().setCustomId(`ga:${id}:${action}`).setLabel(label).setStyle(style);
const row = (...components) => new ActionRowBuilder().addComponents(...components);
const ownerSelect = (id, action, placeholder, entries) => row(new StringSelectMenuBuilder()
  .setCustomId(`ga:${id}:${action}`).setPlaceholder(placeholder).addOptions(entries.slice(0,25)));
const clean = text => String(text || "").replace(/[@`]/g, "").slice(0,100);

export function cardImage(card) {
  return realStarWarsImage(card);
}

export function cardEmbed(card, owned = null, title = "CARD ACQUIRED") {
  const detail = [
    `**${card.name}**`,
    `${FACTIONS[card.faction]?.name || "Unknown"}  |  ${card.role}`,
    `**${card.rarity}**  |  ${ABILITIES[card.ability] || "No ability"}${owned ? ` · Ability Lv ${owned.abilityLevel||1}/5` : ""}`,
    "",
    `Attack **${n(Math.round(card.attack * (1 + ((owned?.level || 1) - 1)*.13)))}**   Defence **${n(Math.round(card.defense * (1 + ((owned?.level || 1) - 1)*.13)))}**`,
    `Income **${n(Math.round(card.income * (1 + ((owned?.level || 1)-1)*.13)))} Credits/hr**`,
    ...(owned ? [`Level **${owned.level}**   ID: \`${owned.uid}\``] : [])
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
      `**Credits:** ${n(p.credits)}     **Cards:** ${n(p.cards.length)}`,
      `**Income:** ${n(hourlyIncome(p))}/hr     **Base:** Level ${p.baseLevel}`,
      "",
      "*Roll a card to grow your collection, then equip it in My Cards.*"
    ].filter(Boolean).join("\n"));
  if (avatarUrl) embed.setThumbnail(avatarUrl);
  const more = [
    { label: "Crates & Shop", value:"shop", description:"Buy packs of cards" },
    { label: "Missions & Events", value:"missions", description:"Send your squad on operations" },
    { label: "Weekly Community Boss", value:"boss", description:"Fight together for special rewards" },
    { label: "Leaderboards", value:"leaderboard", description:"Compete for weekly rewards" },
    { label: "How to Play", value:"help", description:"A quick guide to your next steps" }
  ];
  return { embeds:[embed], components:[
    row(ownerButton(p.id,"roll","Roll Card",ButtonStyle.Success),ownerButton(p.id,"cards","My Cards",ButtonStyle.Primary),ownerButton(p.id,"base","My Base",ButtonStyle.Primary)),
    row(ownerButton(p.id,"daily","Daily Pack",ButtonStyle.Success),ownerButton(p.id,"income","Claim Income"),ownerButton(p.id,"quests","Quests")),
    ownerSelect(p.id,"navigate","More activities",more)
  ] };
}

export function baseScreen(p, note = "") {
  const stats = combatStats(p);
  const cost = p.baseLevel * 1500, scrap = p.baseLevel * 4;
  const embed = new EmbedBuilder().setColor(BLUE).setTitle("YOUR OUTPOST")
    .setDescription([
      note || null,
      `**Base level ${p.baseLevel}/30**  |  ${FACTIONS[p.faction]?.name}`,
      `Combat squad **${p.combat.length}/${combatSlots(p)}**  |  Attack **${n(stats.attack)}**  Defence **${n(stats.defense)}**`,
      `Production **${p.production.length}/${productionSlots(p)}**  |  **${n(hourlyIncome(p))} Credits/hr**`,
      `Credits **${n(p.credits)}**  |  Scrap **${n(p.scrap)}**`,
      "",
      `**Upgrade base**  ·  ${n(cost)} Credits + ${scrap} Scrap`,
      "Upgrades unlock slots, reinforce your defences and improve income. Each card can be assigned to combat or production, not both."
    ].filter(Boolean).join("\n"));
  return { embeds:[embed], components:[
    row(ownerButton(p.id,"upgradebase","Upgrade Base",ButtonStyle.Success),ownerButton(p.id,"upgrades","Research"),ownerButton(p.id,"income","Claim Income")),
    row(ownerButton(p.id,"cards","Assign Cards"),ownerButton(p.id,"home","Home"))
  ] };
}

export function upgradesScreen(p, note = "") {
  const upgrades = [
    ["luck","Luck","Improves high-rarity card chances"],
    ["assault","Assault Training","Raises your squad attack"],
    ["fortify","Defence Training","Raises your squad defence"],
    ["logistics","Logistics","Improves passive production income"]
  ];
  const desc = upgrades.map(([id,label,description]) => {
    const rank = p.upgrades[id], price = Math.round(700 * (rank+1)**1.45);
    return `**${label}**  Lv ${rank}/10 · ${rank === 10 ? "MAX" : n(price) + " Credits"}\n${description}`;
  }).join("\n\n");
  return { embeds:[new EmbedBuilder().setColor(BLUE).setTitle("RESEARCH & UPGRADES").setDescription((note?note+"\n\n":"")+desc)],components:[
    ownerSelect(p.id,"research","Choose research",upgrades.map(([value,label])=>({value,label}))),
    row(ownerButton(p.id,"base","Back to Base"),ownerButton(p.id,"home","Home"))
  ] };
}

export function collectionScreen(p, page = 0, note = "") {
  const perPage = 10, pages = Math.max(1, Math.ceil(p.cards.length/perPage));
  const current = Math.max(0, Math.min(pages-1, Number(page)||0));
  const list = [...p.cards].sort((a,b) => b.acquiredAt - a.acquiredAt).slice(current*perPage,(current+1)*perPage);
  const text = list.map((owned,i) => {
    const c = getCard(owned.cardId);
    const assignment = p.combat.includes(owned.uid) ? "Squad" : p.production.includes(owned.uid) ? "Income" : "Reserve";
    return `**${current*perPage + i + 1}.** ${clean(c?.name)}  ·  ${c?.rarity}  ·  Lv ${owned.level}  ·  ${assignment}\nID \`${owned.uid}\``;
  }).join("\n") || "No cards yet. Use /roll or claim your starter pack.";
  const options = list.map(owned => ({label:getCard(owned.cardId)?.name.slice(0,100)||"Unknown",description:`${owned.level} · ${getCard(owned.cardId)?.rarity} · ${owned.uid}`,value:owned.uid}));
  return { embeds:[new EmbedBuilder().setColor(BLUE).setTitle(`YOUR CARDS  ${current+1}/${pages}`).setDescription((note?note+"\n\n":"")+text).setFooter({text:`${p.cards.length} owned  |  Select a card to assign, inspect, upgrade or fuse`})],components:[
    ...(options.length ? [ownerSelect(p.id,"inspect","Inspect a card",options)] : []),
    row(ownerButton(p.id,`page:${Math.max(0,current-1)}`,"Previous"),ownerButton(p.id,`page:${Math.min(pages-1,current+1)}`,"Next"),ownerButton(p.id,"home","Home"))
  ] };
}

export function inspectScreen(p, uid, note = "") {
  const owned = p.cards.find(c => c.uid === uid), card = owned && getCard(owned.cardId);
  if (!card) return collectionScreen(p,0,"Card no longer exists.");
  const assignment = p.combat.includes(uid) ? "Combat" : p.production.includes(uid) ? "Production" : "Reserve";
  const embed = cardEmbed(card,owned,`CARD DETAILS  ·  ${assignment}`);
  if (note) embed.addFields({name:"Result",value:note.slice(0,1000)});
  return { embeds:[embed],components:[
    row(ownerButton(p.id,`set:${uid}:combat`,"Combat",ButtonStyle.Primary),ownerButton(p.id,`set:${uid}:production`,"Production",ButtonStyle.Success),ownerButton(p.id,`set:${uid}:reserve`,"Reserve")),
    row(ownerButton(p.id,`upgrade:${uid}`,"Upgrade"),ownerButton(p.id,`ability:${uid}`,"Train Ability"),ownerButton(p.id,`fuse:${uid}`,"Fuse Duplicate"),ownerButton(p.id,"cards","Collection"))
  ] };
}

export function rollScreen(p, found, cost = 300) {
  const card = found[0];
  const embed = cardEmbed(card,{level:1,uid:card.uid},found.length === 1 ? "NEW CARD ACQUIRED" : `${found.length} CARDS ACQUIRED`);
  if (found.length > 1) embed.addFields({name:"Pack contents",value:found.map(c=>`${c.rarity} · **${clean(c.name)}** · \`${c.uid}\``).join("\n").slice(0,1024)});
  embed.setFooter({text:`${n(cost)} Credits spent  |  Balance: ${n(p.credits)} Credits  |  Cards are saved immediately`});
  return { embeds:[embed],components:[row(ownerButton(p.id,"reroll","Re-roll (300)",ButtonStyle.Success),ownerButton(p.id,`inspect:${card.uid}`,"View Card"),ownerButton(p.id,"home","Home"))] };
}

export function shopScreen(p,note = "") {
  const entries = Object.entries(CRATES).sort((a,b)=>a[1].price-b[1].price).map(([id,c])=>({
    label:`${c.name} — ${n(c.price)} Credits`,value:id,
    description:(id === "elite" || id === "legendary") ? `${c.count} cards with better high-rarity odds` : `${c.count} cards${c.pool?` from ${FACTIONS[c.pool].short}`:" from any faction"}`
  }));
  const deal=dailyDeal();
  return { embeds:[new EmbedBuilder().setColor(BLUE).setTitle("CRATES & SHOP").setDescription([
    note || null,
    `**Your Credits:** ${n(p.credits)}`,
    "",
    "Choose a crate below to open **3 cards**. Prices are shown beside each name, cheapest first.",
    "",
    `**Daily deal:** ${deal.crate.name} for ${n(deal.price)} Credits (30% off)${p.cooldowns.dailyDeal===deal.key?" — already purchased":""}`,
    "A single card roll costs **300 Credits**."
  ].filter(Boolean).join("\n"))],components:[ownerSelect(p.id,"buycrate","Choose a crate and see its price",entries),row(ownerButton(p.id,"deal","Daily Deal",ButtonStyle.Success),ownerButton(p.id,"roll","Roll Card (300)",ButtonStyle.Success),ownerButton(p.id,"upgrades","Research"),ownerButton(p.id,"home","Home"))] };
}

export function missionsScreen(p, now = Date.now(), note = "") {
  const event = currentEvent(now);
  const missions=[...MISSIONS,dailyContract(now)];
  const text = missions.map(m => {const last = p.missions[m.id]||0;const left=m.cooldown-(now-last);
    return `**${m.name}**  ·  ${left > 0 ? `Ready <t:${Math.floor((now+left)/1000)}:R>` : "Ready"}\n${n(m.credits[0])}–${n(m.credits[1])} Credits · ${m.xp} XP · ${m.scrap} Scrap`;}).join("\n\n");
  return { embeds:[new EmbedBuilder().setColor(BLUE).setTitle("MISSIONS & LIVE EVENTS").setDescription([
    note||null,event.active ? `**LIVE:** ${event.name} · 1.5x mission rewards` : "Dynamic event rotates every 4 hours (active for 1 hour).",
    isDoubleXp(now)?"**2x XP weekend active**":null,"",text
  ].filter(Boolean).join("\n"))],components:[ownerSelect(p.id,"mission","Deploy your squad",missions.map(m=>({label:m.name,value:m.id,description:`${m.xp} XP · ${m.scrap} Scrap`}))),row(ownerButton(p.id,"event","Join Live Event",ButtonStyle.Success),ownerButton(p.id,"boss","Weekly Boss"),ownerButton(p.id,"salvage","Collect Scrap"),ownerButton(p.id,"home","Home"))] };
}

export function bossScreen(p, boss, note="") {
  const progress = Math.round(100*boss.hp/boss.maxHp);
  const leaders=Object.entries(boss.contributors).sort((a,b)=>b[1]-a[1]).slice(0,3);
  const embed=new EmbedBuilder().setColor(boss.defeated?0x2aaa83:0xc65dbb)
    .setTitle(`WEEKLY BOSS  ·  ${boss.name}`)
    .setDescription([
      note||null,
      boss.defeated ? "**Boss defeated!** A new one appears next Monday." : `**Health: ${n(boss.hp)}/${n(boss.maxHp)}**  ·  ${progress}%`,
      "Fight together using your equipped squad. Each player can attack every 30 minutes.",
      "The top three contributors receive automatic special cards and Credits when the boss falls. All other contributors also receive rewards.",
      "",
      "**Top contributors**",
      ...leaders.map(([id,damage],i)=>`${i+1}. <@${id}>  ${n(damage)} damage`),
      leaders.length?null:"No attacks yet."
    ].filter(Boolean).join("\n"));
  return {embeds:[embed],components:[row(ownerButton(p.id,"attackboss","Attack Boss",ButtonStyle.Danger),ownerButton(p.id,"missions","Missions"),ownerButton(p.id,"home","Home"))]};
}

export function questsScreen(p, period = "daily", now = Date.now(), note = "") {
  const all = activeQuests(p,period,now);
  const desc = all.map(q => `**${q.label}**  ${Math.min(q.progress,q.target)}/${q.target}${q.claimed?"  ·  Claimed":q.progress>=q.target?"  ·  READY":""}\n${n(q.credits)} Credits · ${n(q.xp)} XP`).join("\n\n");
  return { embeds:[new EmbedBuilder().setColor(BLUE).setTitle(`${period.toUpperCase()} QUESTS`).setDescription((note?note+"\n\n":"")+desc)],components:[
    ownerSelect(p.id,`claimquest:${period}`,"Claim a completed quest",all.map(q=>({label:q.label,value:q.id,description:`${Math.min(q.progress,q.target)}/${q.target}${q.claimed?" · Claimed":""}`}))),
    row(ownerButton(p.id,"quests:daily","Daily"),ownerButton(p.id,"quests:weekly","Weekly"),ownerButton(p.id,"quests:monthly","Monthly"),ownerButton(p.id,"home","Home"))
  ] };
}

export function leaderboardScreen(rows, title = "WEEKLY COMMAND RANKINGS", userId = null) {
  const embed = new EmbedBuilder().setColor(BLUE).setTitle(title).setDescription(rows.length ? rows.map((p,i)=>`**${i+1}.** <@${p.id}> · **${n(p.weekScore)} CP** · ${getLeague(p.weekScore)}${i<3?" · Prize rank":""}`).join("\n") : "No active players yet.")
    .setFooter({text:"Weekly scores reset every Monday (UTC). Cards, bases and Credits remain. Top 3 receive automatic in-game rewards."});
  return { embeds:[embed],components:userId?[row(ownerButton(userId,"home","Back to Game"))]:[] };
}

export function helpScreen(p) {
  return { embeds:[new EmbedBuilder().setColor(BLUE).setTitle("HOW TO PLAY")
    .setDescription([
      "**1. Build your squad.** Your first 5 cards are free. Use My Cards to set combat and production units.",
      "**2. Collect more.** /roll costs 300 Credits. Daily packs, crates and channel drops offer more cards.",
      "**3. Grow your base.** Production cards earn Credits each hour. Claim them before the 12h cap.",
      "**4. Fight.** Use /raid @player to attack a base, /duel @player to challenge, or complete missions.",
      "**5. Compete weekly.** Earn Command Points from active play. Weekly winners automatically receive Credits and cards.",
      "",
      "**More:** /cards, /guild, /trade, /quiz (training). Quests refresh daily, weekly and monthly. A weekend 2x XP bonus and rotating events keep the world alive.",
      "",
      "Cards and base progress never reset weekly. Weekly Command Points do. Real-world prize fulfilment remains with server ownership."
    ].join("\n"))],components:[row(ownerButton(p.id,"home","Back to Game"))] };
}

export function statsLine(p) { return `Level ${playerLevel(p.xp)} · ${rankFromLevel(playerLevel(p.xp))} · ${n(p.credits)} Credits · ${n(p.weekScore)} CP`; }
