import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder
} from "discord.js";
import {
  addRewards, adminResetPlayer, adminSetStat, claimDaily, completeQuiz, getLeaderboard,
  getLevelProgress, getPlayer, mutatePlayer, purchaseItem, recordQuizAnswer,
  incrementQuestProgress, claimQuest, addCollectible
} from "./gameState.js";
import { ACHIEVEMENTS, GAME_STORE, GAME_QUESTS, COLLECTIBLES, SEASON_REWARDS, earnedAchievements, findStoreItem, randomBetween, randomPatrol } from "./gameContent.js";
import { getQuestionPool, getQuestionCategories } from "./questions.js";

const sessions = new Map();
const PATROL_COOLDOWN = 5 * 60 * 1000;
const SESSION_TTL = 30 * 60 * 1000;
const DIFFICULTY_REWARD = {
  Easy: { credits: 20, xp: 12, score: 100 },
  Medium: { credits: 30, xp: 18, score: 150 },
  Hard: { credits: 45, xp: 26, score: 220 },
  Extreme: { credits: 70, xp: 40, score: 320 }
};

function fmt(n) { return Number(n || 0).toLocaleString("en-GB"); }
function pct(a,b) { return b ? Math.round(a / b * 100) : 0; }
function shuffle(items) {
  const a=[...items];
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function sid(){ return Math.random().toString(36).slice(2,10); }
function cleanSessions(){
  const now=Date.now();
  for(const [id,s] of sessions) if(now-s.createdAt>SESSION_TTL) sessions.delete(id);
}
function rankName(elo){
  if(elo>=2200)return "Galactic Legend";
  if(elo>=1900)return "Marshal";
  if(elo>=1650)return "Commander";
  if(elo>=1450)return "Officer";
  if(elo>=1300)return "Elite";
  if(elo>=1150)return "Veteran";
  if(elo>=1000)return "Trooper";
  return "Cadet";
}
function progressBar(current, needed, size=10){
  const filled=Math.max(0,Math.min(size,Math.round((current/Math.max(1,needed))*size)));
  return `[${"#".repeat(filled)}${".".repeat(size-filled)}]`;
}

function pick(items){ return items[Math.floor(Math.random()*items.length)]; }
function resultReaction(profile, correct, item){
  const style=profile?.equippedAnswerStyle || "standard";
  const sets={
    standard:{
      good:["Correct.","Nice one.","Got it.","Clean answer.","Yep, that's right."],
      bad:["Not this time.","Missed it.","Close one.","That one got you.","Wrong answer."]
    },
    republic:{
      good:["For the Republic. Correct.","Good work, trooper.","Republic intelligence checks out.","Clean hit."],
      bad:["Back to the briefing room.","That intel was off.","Missed the target.","The Republic expects a retry."]
    },
    cis:{
      good:["Roger roger. Correct.","Tactical droid approved.","Efficient answer.","The calculation was correct."],
      bad:["Roger roger... no.","Recalculate that one.","Tactical error.","That answer malfunctioned."]
    },
    fire:{
      good:["You're cooking.","Still on fire.","That was clean.","Locked in."],
      bad:["Streak breaker.","That one cooled you off.","Rough one.","Run it back."]
    }
  };
  const set=sets[style]||sets.standard;
  return correct ? pick(set.good) : `${pick(set.bad)} Correct answer: **${item.correct}**.`;
}
function homeRows(){
  const menu = new StringSelectMenuBuilder().setCustomId("game:navigate").setPlaceholder("🧭 Explore TARC Game").addOptions(
    {label:"Profile & Stats",description:"Levels, Elo, accuracy, streaks and recent runs.",value:"profile",emoji:"📊"},
    {label:"Progression",description:"Missions, achievements, collection and season.",value:"progression",emoji:"🏅"},
    {label:"Shop",description:"Spend Credits on titles and reaction styles.",value:"shop",emoji:"🛒"},
    {label:"Leaderboards",description:"Compare Elo, Credits, XP and more.",value:"leaderboard",emoji:"🏆"},
    {label:"How to Play",description:"A quick explanation of the whole game.",value:"how",emoji:"❓"}
  );
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("game:play").setLabel("PLAY").setEmoji("🎮").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("game:daily").setLabel("DAILY").setEmoji("🎁").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("game:patrol").setLabel("PATROL").setEmoji("🛰️").setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(menu)
  ];
}
function progressionRows(){
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("game:quests").setLabel("Missions").setEmoji("🎯").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("game:achievements").setLabel("Achievements").setEmoji("🏅").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("game:collection").setLabel("Collection").setEmoji("💎").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("game:season").setLabel("Season").setEmoji("⭐").setStyle(ButtonStyle.Secondary)
    ),
    backRow()
  ];
}
async function homeEmbed(user){
  const p=await getPlayer(user.id);
  const lp=getLevelProgress(p);
  return new EmbedBuilder()
    .setColor(0x2b7fff)
    .setTitle("🎮 TARC GAME")
    .setDescription([
      `**${p.equippedTitle || "Rookie"}**  <@${user.id}>`,
      `Level **${lp.level}**  ${progressBar(lp.current,lp.needed)} ${fmt(lp.current)}/${fmt(lp.needed)} XP`,
      "",
      `Credits: **${fmt(p.credits)}**`,
      `Quiz Elo: **${fmt(p.elo)}**  ${rankName(p.elo)}`,
      `Accuracy: **${pct(p.correctAnswers,p.questionsAnswered)}%**`,
      `Best Streak: **${fmt(p.bestStreak)}**`,
      "",
      "**PLAY. EARN. CLIMB. COLLECT.**",
      "Hit **PLAY** for quizzes, claim your **DAILY**, or run a **PATROL**. Use the menu for everything else."
    ].join("\n"));
}
function backRow(){
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("game:home").setLabel("Home").setStyle(ButtonStyle.Secondary));
}
function playMenu(){
  const select = new StringSelectMenuBuilder().setCustomId("game:playmode").setPlaceholder("Choose a game mode").addOptions(
    {label:"Classic Quiz",description:"10 questions. Pick a category and difficulty.",value:"classic"},
    {label:"Quickfire",description:"10 mixed questions with bigger score rewards.",value:"quickfire"},
    {label:"Survival",description:"Keep going until you get one wrong.",value:"survival"},
    {label:"Extreme Run",description:"10 Hard and Extreme questions.",value:"extreme"},
    {label:"TARC Specialist",description:"TARC only.",value:"tarc"},
    {label:"Galactic Specialist",description:"Star Wars only.",value:"starwars"}
  );
  return [new ActionRowBuilder().addComponents(select),backRow()];
}
function setupRows(mode){
  const scope = new StringSelectMenuBuilder().setCustomId(`quiz:scope:${mode}`).setPlaceholder("Choose quiz type").addOptions(
    {label:"Mixed",description:"TARC and Star Wars together.",value:"mixed"},
    {label:"Star Wars",description:"Star Wars questions only.",value:"starwars"},
    {label:"TARC",description:"TARC member knowledge only.",value:"tarc"}
  );
  return [new ActionRowBuilder().addComponents(scope),backRow()];
}
function categoryRows(mode,scope){
  const cats=getQuestionCategories(scope).slice(0,24);
  const options=[{label:"Mixed categories",value:"Mixed"},...cats.map(c=>({label:c.slice(0,100),value:c.slice(0,100)}))];
  return [new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`quiz:category:${mode}:${scope}`).setPlaceholder("Choose a category").addOptions(...options)
  ),backRow()];
}
function difficultyRows(mode,scope,category="Mixed"){
  const select = new StringSelectMenuBuilder().setCustomId(`quiz:difficulty:${mode}:${scope}:${encodeURIComponent(category)}`).setPlaceholder("Choose difficulty").addOptions(
    {label:"Random",value:"Random"},{label:"Easy",value:"Easy"},{label:"Medium",value:"Medium"},{label:"Hard",value:"Hard"},{label:"Extreme",value:"Extreme"}
  );
  return [new ActionRowBuilder().addComponents(select),backRow()];
}
function makeQuestionSession(userId,{mode="classic",scope="mixed",difficulty="Random",category="Mixed",count=10}={}){
  let pool=getQuestionPool({scope,difficulty,category});
  if(mode==="extreme") pool=getQuestionPool({scope}).filter(q=>q.difficulty==="Hard"||q.difficulty==="Extreme");
  if(mode==="tarc"){scope="tarc";pool=getQuestionPool({scope,difficulty});}
  if(mode==="starwars"){scope="starwars";pool=getQuestionPool({scope,difficulty});}
  const questions=shuffle(pool).slice(0,Math.min(count,pool.length));
  const id=sid();
  const s={id,type:"solo",userId:String(userId),mode,scope,difficulty,category,questions,index:0,score:0,correct:0,wrong:0,createdAt:Date.now(),answered:false};
  sessions.set(id,s);
  return s;
}
function questionEmbed(s){
  const item=s.questions[s.index];
  const intro = item.difficulty==="Extreme" ? "Extreme one. Good luck." :
    item.difficulty==="Hard" ? "Hard question now." :
    item.difficulty==="Easy" ? "Easy one." : "Medium question.";
  return new EmbedBuilder().setColor(0x2b7fff).setTitle(`${intro}`)
    .setDescription([
      `**${s.index+1}/${s.questions.length}  ${item.category}  ${item.difficulty}**`,
      "",
      item.prompt,
      "",
      `Score: **${fmt(s.score)}**  Correct: **${s.correct}**`
    ].join("\n"));
}
function answerRows(s){
  const item=s.questions[s.index];
  const answers=shuffle([item.correct,...item.wrong]).slice(0,4);
  s.answerChoices=answers;
  return [new ActionRowBuilder().addComponents(...answers.map((answer,i)=>
    new ButtonBuilder().setCustomId(`quiz:answer:${s.id}:${i}`).setLabel(answer.slice(0,80)).setStyle(ButtonStyle.Secondary)
  ))];
}
async function finishSolo(interaction,s){
  const accuracy=pct(s.correct,s.questions.length);
  const completionCredits=Math.round(s.score*0.18);
  const completionXp=Math.round(s.score*0.10);
  const before=await getPlayer(s.userId);
  const beforeLevel=getLevelProgress(before).level;
  const beforeAchievements=new Set(earnedAchievements(before).map(a=>a.id));
  await addRewards(s.userId,{credits:completionCredits,xp:completionXp});
  let eloDelta=0;
  const ranked=s.mode==="extreme";
  if(ranked){
    eloDelta=Math.max(-20,Math.min(35,Math.round((accuracy-60)/2)));
  }
  await completeQuiz(s.userId,{score:s.correct,total:s.questions.length,ranked,won:accuracy>=70,eloDelta,mode:s.mode});
  await incrementQuestProgress(s.userId,"quizzes",1);
  sessions.delete(s.id);
  const p=await getPlayer(s.userId);
  const afterLevel=getLevelProgress(p).level;
  const unlocked=earnedAchievements(p).filter(a=>!beforeAchievements.has(a.id));
  const moments=[
    accuracy===100?"💯 **PERFECT RUN!**":accuracy>=80?"🔥 **STRONG RUN!**":accuracy>=60?"⚡ **RUN COMPLETE**":"🎯 **RUN COMPLETE**",
    afterLevel>beforeLevel?`⬆️ **LEVEL UP!** You reached Level ${afterLevel}.`:null,
    ...unlocked.slice(0,3).map(a=>`🏅 **ACHIEVEMENT UNLOCKED:** ${a.name}`)
  ].filter(Boolean);
  const embed=new EmbedBuilder().setColor(accuracy>=70?0x31c48d:0xff9500).setTitle("🏁 QUIZ COMPLETE").setDescription([
    moments.join("\n"),
    "",
    `**RESULT**  ${s.correct}/${s.questions.length}  •  ${accuracy}%`,
    `**SCORE**  ${fmt(s.score)}`,
    `**REWARDS**  +${fmt(completionCredits)} Credits  •  +${fmt(completionXp)} XP`,
    ranked ? `**ELO**  ${eloDelta>=0?"+":""}${eloDelta}  •  ${fmt(p.elo)} total` : null
  ].filter(Boolean).join("\n"));
  return interaction.update({embeds:[embed],components:[new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("game:play").setLabel("Play Again").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("game:home").setLabel("Home").setStyle(ButtonStyle.Secondary)
  )]});
}
async function showProfile(interaction,user=interaction.user){
  const p=await getPlayer(user.id), lp=getLevelProgress(p);
  const achievements=earnedAchievements(p);
  const categoryEntries=Object.entries(p.categoryStats||{}).filter(([,v])=>v.answered>0)
    .sort((a,b)=>b[1].answered-a[1].answered);
  const best=categoryEntries.sort((a,b)=>pct(b[1].correct,b[1].answered)-pct(a[1].correct,a[1].answered))[0];
  const recent=(p.history||[]).slice(0,3).map(h=>`${h.mode || "Quiz"} ${h.score}/${h.total}`).join(" | ") || "No completed quizzes yet";
  const embed=new EmbedBuilder().setColor(0x2b7fff).setTitle(`${user.username}'s Game Profile`)
    .addFields(
      {name:"Progress",value:`**${p.equippedTitle || "Rookie"}**\nLevel **${lp.level}**  ${progressBar(lp.current,lp.needed)}\n${fmt(lp.current)}/${fmt(lp.needed)} XP to next level\nCredits **${fmt(p.credits)}**`,inline:true},
      {name:"Competitive",value:`Elo **${fmt(p.elo)}**\nRank **${rankName(p.elo)}**\nRanked **${p.rankedWins}W / ${p.rankedLosses}L**\nFace Off **${p.faceoffWins}W / ${p.faceoffLosses}L**`,inline:true},
      {name:"Quiz Stats",value:`Quizzes **${fmt(p.quizzesCompleted)}**\nQuestions **${fmt(p.questionsAnswered)}**\nCorrect **${fmt(p.correctAnswers)}**\nAccuracy **${pct(p.correctAnswers,p.questionsAnswered)}%**\nBest streak **${fmt(p.bestStreak)}**`,inline:true},
      {name:"Progression",value:`Patrols **${fmt(p.patrols)}**\nAchievements **${achievements.length}/${ACHIEVEMENTS.length}**\nCollection **${(p.collection||[]).length}/${COLLECTIBLES.length}**\nSeason tier **${Math.max(1,Math.floor(Number(p.seasonXp||0)/500)+1)}**`,inline:true},
      {name:"Best Category",value:best?`${best[0]}  **${pct(best[1].correct,best[1].answered)}%** (${best[1].answered} answered)`:"Play some quizzes to build category stats.",inline:false},
      {name:"Recent Runs",value:recent,inline:false}
    );
  return interaction.update ? interaction.update({embeds:[embed],components:[backRow()]}) : interaction.reply({embeds:[embed],components:[backRow()]});
}
async function showLeaderboard(interaction,metric="elo"){
  const rows=await getLeaderboard(metric,10);
  const labels={elo:"Quiz Elo",credits:"Credits",xp:"XP",correctAnswers:"Correct Answers",bestStreak:"Best Streak"};
  const lines=rows.length?rows.map((p,i)=>`**${i+1}.** <@${p.userId}>  **${fmt(p[metric])}**`).join("\n"):"No scores yet.";
  const select=new StringSelectMenuBuilder().setCustomId("game:leaderboard_metric").setPlaceholder("Change leaderboard").addOptions(
    {label:"Quiz Elo",value:"elo"},{label:"Credits",value:"credits"},{label:"XP",value:"xp"},{label:"Correct Answers",value:"correctAnswers"},{label:"Best Streak",value:"bestStreak"}
  );
  return interaction.update({embeds:[new EmbedBuilder().setColor(0x2b7fff).setTitle(`${labels[metric]||"Quiz Elo"} Leaderboard`).setDescription(lines)],components:[new ActionRowBuilder().addComponents(select),backRow()]});
}
async function showShop(interaction){
  const p=await getPlayer(interaction.user.id);
  const available=GAME_STORE.filter(i=>!p.inventory.includes(i.id)).slice(0,25);
  const owned=GAME_STORE.filter(i=>p.inventory.includes(i.id));
  const embed=new EmbedBuilder().setColor(0x2b7fff).setTitle("Game Shop").setDescription([
    `Credits: **${fmt(p.credits)}**`,
    "",
    "Buy titles and reaction packs with Credits earned from playing.",
    "Shop items never increase ranked Elo.",
    "",
    owned.length?`Owned: ${owned.map(i=>i.name).join(", ")}`:"Owned: None yet"
  ].join("\n"));
  const components=[];
  if(available.length){
    const menu=new StringSelectMenuBuilder().setCustomId("game:buy").setPlaceholder("Choose an item to buy").addOptions(
      ...available.map(i=>({label:`${i.name}  ${fmt(i.price)} Credits`.slice(0,100),description:i.description.slice(0,100),value:i.id}))
    );
    components.push(new ActionRowBuilder().addComponents(menu));
  }
  if(owned.length){
    const equip=new StringSelectMenuBuilder().setCustomId("game:equip").setPlaceholder("Equip something you own").addOptions(
      ...owned.map(i=>({label:i.name,description:i.description.slice(0,100),value:i.id}))
    );
    components.push(new ActionRowBuilder().addComponents(equip));
  }
  components.push(backRow());
  return interaction.update({embeds:[embed],components});
}
async function doPatrol(interaction){
  const p=await getPlayer(interaction.user.id);
  const elapsed=Date.now()-Number(p.lastPatrol||0);
  if(elapsed<PATROL_COOLDOWN){
    const sec=Math.ceil((PATROL_COOLDOWN-elapsed)/1000);
    return interaction.update({embeds:[new EmbedBuilder().setColor(0xff9500).setTitle("Patrol").setDescription(`You're still recovering from the last patrol. Try again in **${Math.ceil(sec/60)} minute(s)**.`)],components:[backRow()]});
  }
  const encounter=randomPatrol(), e={...encounter}, credits=randomBetween(e.credits), xp=randomBetween(e.xp);
  await mutatePlayer(interaction.user.id,p2=>{p2.lastPatrol=Date.now();p2.patrols+=1;p2.credits+=credits;p2.lifetimeCredits+=credits;p2.xp+=xp;});
  await incrementQuestProgress(interaction.user.id,"patrols",1);
  if(Math.random()<0.22){const c=COLLECTIBLES[Math.floor(Math.random()*COLLECTIBLES.length)];const added=await addCollectible(interaction.user.id,c.id);if(added)e.text += ` You also found **${c.name}** (${c.rarity}).`;}
  return interaction.update({embeds:[new EmbedBuilder().setColor(0x31c48d).setTitle("Patrol Complete").setDescription(`${e.text}\n\n**+${fmt(credits)} Credits  +${fmt(xp)} XP**`)],components:[new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("game:home").setLabel("Home").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("game:profile").setLabel("Profile").setStyle(ButtonStyle.Secondary)
  )]});
}
async function showAchievements(interaction){
  const p=await getPlayer(interaction.user.id), earned=earnedAchievements(p), ids=new Set(earned.map(a=>a.id));
  const lines=ACHIEVEMENTS.map(a=>`${ids.has(a.id)?"Completed":"Locked"}  **${a.name}**  ${a.description}`);
  return interaction.update({embeds:[new EmbedBuilder().setColor(0x2b7fff).setTitle(`Achievements  ${earned.length}/${ACHIEVEMENTS.length}`).setDescription(lines.join("\n").slice(0,4000))],components:[backRow()]});
}
async function daily(interaction){
  const r=await claimDaily(interaction.user.id);
  if(!r.ok){
    const mins=Math.ceil(r.remaining/60000);
    return interaction.update({embeds:[new EmbedBuilder().setColor(0xff9500).setTitle("Daily Reward").setDescription(`Already claimed. Come back in about **${Math.ceil(mins/60)} hour(s)**.`)],components:[backRow()]});
  }
  return interaction.update({embeds:[new EmbedBuilder().setColor(0x31c48d).setTitle("Daily Reward").setDescription(`Day streak: **${r.streak}**\n\n**+${fmt(r.credits)} Credits  +${fmt(r.xp)} XP**`)],components:[backRow()]});
}


async function showQuests(interaction){
  const p=await getPlayer(interaction.user.id);
  const lines=GAME_QUESTS.map(q=>{const n=Math.min(q.target,Number(p.questProgress?.[q.key]||0));const done=p.claimedQuests?.includes(q.id);return `${done?"Claimed":n>=q.target?"Ready":"Active"}  **${q.name}**  ${n}/${q.target}\n${q.description}  Reward: ${q.credits} Credits + ${q.xp} XP`;});
  const ready=GAME_QUESTS.filter(q=>!p.claimedQuests?.includes(q.id)&&Number(p.questProgress?.[q.key]||0)>=q.target);
  const components=[];
  if(ready.length){components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("game:claimquest").setPlaceholder("Claim a completed quest").addOptions(...ready.map(q=>({label:q.name,value:q.id,description:`${q.credits} Credits + ${q.xp} XP`})))));}
  components.push(backRow());
  return interaction.update({embeds:[new EmbedBuilder().setColor(0x2b7fff).setTitle("Missions & Quests").setDescription(lines.join("\n\n").slice(0,4000))],components});
}
async function showCollection(interaction){
  const p=await getPlayer(interaction.user.id), owned=new Set(p.collection||[]);
  const lines=COLLECTIBLES.map(c=>`${owned.has(c.id)?"Found":"Unknown"}  **${owned.has(c.id)?c.name:"???"}**  ${owned.has(c.id)?c.rarity:""}`);
  return interaction.update({embeds:[new EmbedBuilder().setColor(0x2b7fff).setTitle(`Collection  ${owned.size}/${COLLECTIBLES.length}`).setDescription(lines.join("\n"))],components:[backRow()]});
}
async function showSeason(interaction){
  const p=await getPlayer(interaction.user.id), tier=Math.max(1,Math.floor(Number(p.seasonXp||0)/500)+1), into=Number(p.seasonXp||0)%500;
  const rewards=SEASON_REWARDS.map(r=>`${r.tier<=tier?"Unlocked":"Locked"}  **Tier ${r.tier}**  ${r.label}`).join("\n");
  return interaction.update({embeds:[new EmbedBuilder().setColor(0x2b7fff).setTitle("Launch Season").setDescription(`Tier **${tier}**  ${progressBar(into,500)} ${into}/500\nSeason XP: **${fmt(p.seasonXp||0)}**\n\n${rewards}`)],components:[backRow()]});
}

export function getGameCommands(){
  const everywhere = command => {
    const json = command.toJSON();
    json.integration_types = [0, 1];
    json.contexts = [0, 1, 2];
    json.dm_permission = true;
    return json;
  };

  return [
    everywhere(new SlashCommandBuilder().setName("game").setDescription("🎮 Open the TARC game hub")),
    everywhere(new SlashCommandBuilder().setName("quiz").setDescription("🧠 Start a quiz or challenge another player")
      .addUserOption(o=>o.setName("opponent").setDescription("Optional player to challenge").setRequired(false))),
    everywhere(new SlashCommandBuilder().setName("quizleaderboard").setDescription("🏆 Open the quiz leaderboard")),
    new SlashCommandBuilder().setName("gameadmin").setDescription("🎮 Owner-only game controls")
      .addUserOption(o=>o.setName("player").setDescription("Player to edit").setRequired(true))
      .addStringOption(o=>o.setName("stat").setDescription("Stat to edit").setRequired(true).addChoices(
        {name:"Credits",value:"credits"},{name:"XP",value:"xp"},{name:"Elo",value:"elo"},{name:"Correct Answers",value:"correctAnswers"},{name:"Quizzes Completed",value:"quizzesCompleted"},{name:"Best Streak",value:"bestStreak"}
      ))
      .addIntegerOption(o=>o.setName("value").setDescription("New value").setRequired(true).setMinValue(0))
      .toJSON()
  ];
}

async function startChallenge(interaction,opponent){
  if(opponent.bot||opponent.id===interaction.user.id) return interaction.reply({content:"Pick another real player.",ephemeral:true});
  const id=sid();
  const pool=shuffle(getQuestionPool({scope:"mixed",difficulty:"Random"})).slice(0,10);
  sessions.set(id,{id,type:"challenge",challenger:interaction.user.id,opponent:opponent.id,questions:pool,index:0,createdAt:Date.now(),answers:{},scores:{[interaction.user.id]:0,[opponent.id]:0},correct:{[interaction.user.id]:0,[opponent.id]:0}});
  const row=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`faceoff:accept:${id}`).setLabel("Accept").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`faceoff:decline:${id}`).setLabel("Decline").setStyle(ButtonStyle.Danger)
  );
  return interaction.reply({content:`<@${opponent.id}> you were challenged by <@${interaction.user.id}>.`,embeds:[new EmbedBuilder().setColor(0x2b7fff).setTitle("Quiz Face Off").setDescription("10 mixed questions. Same questions for both players. Highest score wins.")],components:[row],allowedMentions:{users:[opponent.id]}});
}
function faceoffQuestion(s){
  const item=s.questions[s.index];
  return new EmbedBuilder().setColor(0x2b7fff).setTitle(`Face Off  ${s.index+1}/${s.questions.length}`).setDescription(`**${item.category}  ${item.difficulty}**\n\n${item.prompt}\n\n<@${s.challenger}> **${s.scores[s.challenger]}**  vs  <@${s.opponent}> **${s.scores[s.opponent]}**`);
}
function faceoffRows(s){
  const item=s.questions[s.index], answers=shuffle([item.correct,...item.wrong]).slice(0,4);
  s.answerChoices=answers;
  return [new ActionRowBuilder().addComponents(...answers.map((a,i)=>
    new ButtonBuilder().setCustomId(`faceoff:answer:${s.id}:${i}`).setLabel(a.slice(0,80)).setStyle(ButtonStyle.Secondary)
  ))];
}
async function finishFaceoff(interaction,s){
  const a=s.challenger,b=s.opponent, as=s.scores[a],bs=s.scores[b];
  const winner=as===bs?null:(as>bs?a:b), loser=winner?(winner===a?b:a):null;
  let delta=0;
  if(winner){delta=24; await mutatePlayer(winner,p=>{p.elo+=delta;p.faceoffWins+=1;p.rankedWins+=1;p.credits+=400;p.lifetimeCredits+=400;p.xp+=250;}); await mutatePlayer(loser,p=>{p.elo=Math.max(100,p.elo-delta);p.faceoffLosses+=1;p.rankedLosses+=1;p.credits+=150;p.lifetimeCredits+=150;p.xp+=120;});}
  else {await addRewards(a,{credits:250,xp:180});await addRewards(b,{credits:250,xp:180});}
  sessions.delete(s.id);
  const desc=winner?`<@${winner}> wins.\n\n<@${a}> **${as}**  vs  <@${b}> **${bs}**\n\nWinner: **+24 Elo  +400 Credits  +250 XP**\nRunner-up: **-24 Elo  +150 Credits  +120 XP**`:`Draw.\n\n<@${a}> **${as}**  vs  <@${b}> **${bs}**\n\nBoth players: **+250 Credits  +180 XP**`;
  return interaction.update({embeds:[new EmbedBuilder().setColor(0x31c48d).setTitle("Face Off Complete").setDescription(desc)],components:[]});
}

export async function handleGameInteraction(interaction, options = {}){
  cleanSessions();
  if(interaction.isChatInputCommand()){
    if(interaction.commandName==="game"){
      return interaction.reply({embeds:[await homeEmbed(interaction.user)],components:homeRows()}).then(()=>true);
    }
    if(interaction.commandName==="quiz"){
      const opponent=interaction.options.getUser("opponent");
      if(opponent){await startChallenge(interaction,opponent);return true;}
      return interaction.reply({embeds:[new EmbedBuilder().setColor(0x2b7fff).setTitle("Play Quiz").setDescription("Choose a mode. You can change category and difficulty next.")],components:playMenu()}).then(()=>true);
    }
    if(interaction.commandName==="quizleaderboard"){
      await interaction.reply({embeds:[new EmbedBuilder().setColor(0x2b7fff).setTitle("Loading leaderboard...")]});
      const rows=await getLeaderboard("elo",10);
      await interaction.editReply({embeds:[new EmbedBuilder().setColor(0x2b7fff).setTitle("Quiz Elo Leaderboard").setDescription(rows.length?rows.map((p,i)=>`**${i+1}.** <@${p.userId}>  **${fmt(p.elo)}**  ${rankName(p.elo)}`).join("\n"):"No scores yet.")],components:[]});
      return true;
    }
    if(interaction.commandName==="gameadmin"){
      if(!interaction.inGuild()) {await interaction.reply({content:"Use this in the TARC server.",ephemeral:true});return true;}
      const allowed = typeof options.isGameOwner === "function" ? await options.isGameOwner(interaction) : false;
      if(!allowed){await interaction.reply({content:"This panel is restricted to the TARC group owner.",ephemeral:true});return true;}
      const target=interaction.options.getUser("player",true),stat=interaction.options.getString("stat",true),value=interaction.options.getInteger("value",true);
      const p=await adminSetStat(target.id,stat,value);
      await interaction.reply({content:`Updated <@${target.id}>: **${stat} = ${fmt(p[stat])}**`,ephemeral:true});return true;
    }
    return false;
  }
  if(!(interaction.isButton()||interaction.isStringSelectMenu())) return false;
  const id=interaction.customId;
  if(!(id.startsWith("game:")||id.startsWith("quiz:")||id.startsWith("faceoff:"))) return false;

  if(id==="game:navigate"){
    const target=interaction.values[0];
    if(target==="profile"){await showProfile(interaction);return true;}
    if(target==="shop"){await showShop(interaction);return true;}
    if(target==="leaderboard"){await showLeaderboard(interaction);return true;}
    if(target==="progression"){await interaction.update({embeds:[new EmbedBuilder().setColor(0x2b7fff).setTitle("🏅 Progression").setDescription("Pick a progression system. Everything here builds from playing quizzes and patrols.")],components:progressionRows()});return true;}
    if(target==="how"){await interaction.update({embeds:[new EmbedBuilder().setColor(0x2b7fff).setTitle("❓ How to Play").setDescription("🎮 **Play quizzes** to earn Credits and XP.\n🏆 **Compete** in Extreme runs and Face Offs for Elo.\n🎯 **Complete missions** for bonus rewards and Season XP.\n🛰️ **Patrol** between quizzes for random encounters and collectibles.\n🛒 **Spend Credits** on titles and reaction styles.\n\nYour profile, collection, achievements and season all progress together.")],components:[backRow()]});return true;}
  }
  if(id==="game:home") {await interaction.update({embeds:[await homeEmbed(interaction.user)],components:homeRows()});return true;}
  if(id==="game:play") {await interaction.update({embeds:[new EmbedBuilder().setColor(0x2b7fff).setTitle("Play").setDescription("Pick a mode. Everything rewards the same profile.")],components:playMenu()});return true;}
  if(id==="game:profile") {await showProfile(interaction);return true;}
  if(id==="game:leaderboard") {await showLeaderboard(interaction);return true;}
  if(id==="game:shop") {await showShop(interaction);return true;}
  if(id==="game:patrol") {await doPatrol(interaction);return true;}
  if(id==="game:achievements") {await showAchievements(interaction);return true;}
  if(id==="game:quests") {await showQuests(interaction);return true;}
  if(id==="game:collection") {await showCollection(interaction);return true;}
  if(id==="game:season") {await showSeason(interaction);return true;}
  if(id==="game:daily") {await daily(interaction);return true;}
  if(id==="game:how") {await interaction.update({embeds:[new EmbedBuilder().setColor(0x2b7fff).setTitle("How to Play").setDescription(`Play quizzes to earn Credits, XP and competitive Elo. Use Credits in the shop. Level up your profile, build streaks, complete achievements and run patrols between quizzes.\n\n**Ranked rule:** Credits and shop items never buy Elo. Elo comes from competitive quiz performance.`)],components:[backRow()]});return true;}

  if(id==="game:playmode"){
    const mode=interaction.values[0];
    if(mode==="extreme"){
      const s=makeQuestionSession(interaction.user.id,{mode,scope:"mixed",difficulty:"Random"});
      await interaction.update({embeds:[questionEmbed(s)],components:answerRows(s)});return true;
    }
    if(mode==="tarc"||mode==="starwars"){
      await interaction.update({embeds:[new EmbedBuilder().setColor(0x2b7fff).setTitle(mode==="tarc"?"TARC Specialist":"Galactic Specialist").setDescription("Choose a difficulty.")],components:categoryRows(mode,mode)});return true;
    }
    await interaction.update({embeds:[new EmbedBuilder().setColor(0x2b7fff).setTitle("Choose Category").setDescription("Pick what you want to be tested on.")],components:setupRows(mode)});return true;
  }
  if(id.startsWith("quiz:scope:")){
    const mode=id.split(":")[2],scope=interaction.values[0];
    await interaction.update({embeds:[new EmbedBuilder().setColor(0x2b7fff).setTitle("Choose Category").setDescription("Pick a specific category or keep everything mixed.")],components:categoryRows(mode,scope)});return true;
  }
  if(id.startsWith("quiz:category:")){
    const [, , mode,scope]=id.split(":"), category=interaction.values[0];
    await interaction.update({embeds:[new EmbedBuilder().setColor(0x2b7fff).setTitle("Choose Difficulty").setDescription("Easy, Medium, Hard, Extreme or Random.")],components:difficultyRows(mode,scope,category)});return true;
  }
  if(id.startsWith("quiz:difficulty:")){
    const parts=id.split(":"), mode=parts[2],scope=parts[3],category=decodeURIComponent(parts.slice(4).join(":")||"Mixed"), difficulty=interaction.values[0];
    const s=makeQuestionSession(interaction.user.id,{mode,scope,difficulty,category,count:10});
    if(!s.questions.length){sessions.delete(s.id);await interaction.update({content:"No questions are available for that combination yet.",embeds:[],components:[backRow()]});return true;}
    await interaction.update({embeds:[questionEmbed(s)],components:answerRows(s)});return true;
  }
  if(id.startsWith("quiz:answer:")){
    const parts=id.split(":"), s=sessions.get(parts[2]);
    if(!s){await interaction.reply({content:"That quiz expired. Start a new one.",ephemeral:true});return true;}
    if(s.userId!==interaction.user.id){await interaction.reply({content:"This quiz belongs to someone else.",ephemeral:true});return true;}
    if(s.answered){await interaction.reply({content:"Already answered.",ephemeral:true});return true;}
    s.answered=true;
    const choiceIndex=Number(parts[3]), item=s.questions[s.index], answer=s.answerChoices?.[choiceIndex];
    if(typeof answer!=="string"){await interaction.reply({content:"That answer button expired. Start the question again.",ephemeral:true});return true;}
    const correct=answer===item.correct, reward=DIFFICULTY_REWARD[item.difficulty]||DIFFICULTY_REWARD.Medium;
    const credits=correct?reward.credits:0,xp=correct?reward.xp:3;
    if(correct){s.correct+=1;s.score+=reward.score*(s.mode==="quickfire"?1.25:1);}else{s.wrong+=1;}
    await recordQuizAnswer(s.userId,{correct,category:item.category,difficulty:item.difficulty,credits,xp});
    await incrementQuestProgress(s.userId,"answers",1);
    if(correct) await incrementQuestProgress(s.userId,"correct",1);
    const qp=await getPlayer(s.userId); if(qp.currentStreak>=5) await incrementQuestProgress(s.userId,"streak5",1);
    if(s.mode==="survival"&&!correct){
      s.questions=s.questions.slice(0,s.index+1);
      return finishSolo(interaction,s);
    }
    s.index+=1;s.answered=false;
    if(s.index>=s.questions.length)return finishSolo(interaction,s);
    const reaction=resultReaction(qp,correct,item);
    const result=correct?`${reaction} +${credits} Credits, +${xp} XP`:reaction;
    const embed=questionEmbed(s);embed.setFooter({text:result});
    await interaction.update({embeds:[embed],components:answerRows(s)});return true;
  }
  if(id==="game:claimquest"){const q=GAME_QUESTS.find(x=>x.id===interaction.values[0]);if(!q){await interaction.reply({content:"Quest not found.",ephemeral:true});return true;}const r=await claimQuest(interaction.user.id,q);await interaction.reply({content:r.ok?`Claimed **${q.name}**: +${q.credits} Credits, +${q.xp} XP and +${q.seasonXp} Season XP.`:"That quest is not ready to claim.",ephemeral:true});return true;}
  if(id==="game:buy"){
    const item=findStoreItem(interaction.values[0]); if(!item){await interaction.reply({content:"That item no longer exists.",ephemeral:true});return true;}
    const r=await purchaseItem(interaction.user.id,item);
    if(!r.ok){await interaction.reply({content:r.reason==="owned"?"You already own that.":`You need ${fmt(item.price)} Credits for that.`,ephemeral:true});return true;}
    await interaction.reply({content:`Bought **${item.name}** for **${fmt(item.price)} Credits**.`,ephemeral:true});return true;
  }
  if(id==="game:equip"){
    const item=findStoreItem(interaction.values[0]); if(!item){await interaction.reply({content:"That item no longer exists.",ephemeral:true});return true;}
    await mutatePlayer(interaction.user.id,p=>{if(!p.inventory.includes(item.id))throw new Error("Not owned.");if(item.type==="title")p.equippedTitle=item.value;if(item.type==="answerStyle")p.equippedAnswerStyle=item.value;});
    await interaction.reply({content:`Equipped **${item.name}**.`,ephemeral:true});return true;
  }
  if(id==="game:leaderboard_metric"){await showLeaderboard(interaction,interaction.values[0]);return true;}

  if(id.startsWith("faceoff:accept:")){
    const s=sessions.get(id.split(":")[2]);if(!s){await interaction.reply({content:"That challenge expired.",ephemeral:true});return true;}
    if(interaction.user.id!==s.opponent){await interaction.reply({content:"Only the challenged player can accept.",ephemeral:true});return true;}
    await interaction.update({content:`<@${s.challenger}> vs <@${s.opponent}>`,embeds:[faceoffQuestion(s)],components:faceoffRows(s)});return true;
  }
  if(id.startsWith("faceoff:decline:")){
    const s=sessions.get(id.split(":")[2]);if(!s){await interaction.reply({content:"That challenge expired.",ephemeral:true});return true;}
    if(interaction.user.id!==s.opponent){await interaction.reply({content:"Only the challenged player can decline.",ephemeral:true});return true;}
    sessions.delete(s.id);await interaction.update({content:"Challenge declined.",embeds:[],components:[]});return true;
  }
  if(id.startsWith("faceoff:answer:")){
    const parts=id.split(":"),s=sessions.get(parts[2]);if(!s){await interaction.reply({content:"That face off expired.",ephemeral:true});return true;}
    const uid=interaction.user.id;if(uid!==s.challenger&&uid!==s.opponent){await interaction.reply({content:"You're not in this face off.",ephemeral:true});return true;}
    s.answers[s.index] ||= {};
    if(s.answers[s.index][uid]){await interaction.reply({content:"You've already answered this question.",ephemeral:true});return true;}
    const choiceIndex=Number(parts[3]),item=s.questions[s.index],answer=s.answerChoices?.[choiceIndex];
    if(typeof answer!=="string"){await interaction.reply({content:"That answer button expired.",ephemeral:true});return true;}
    const correct=answer===item.correct,reward=DIFFICULTY_REWARD[item.difficulty]||DIFFICULTY_REWARD.Medium;
    s.answers[s.index][uid]={answer,correct};if(correct){s.correct[uid]+=1;s.scores[uid]+=reward.score;}
    await recordQuizAnswer(uid,{correct,category:item.category,difficulty:item.difficulty,credits:correct?reward.credits:0,xp:correct?reward.xp:3});
    const both=s.answers[s.index][s.challenger]&&s.answers[s.index][s.opponent];
    if(!both){await interaction.reply({content:correct?"Locked in. Correct.":"Locked in.",ephemeral:true});return true;}
    s.index+=1;
    if(s.index>=s.questions.length)return finishFaceoff(interaction,s);
    await interaction.update({content:`<@${s.challenger}> vs <@${s.opponent}>\nPrevious answer: **${item.correct}**`,embeds:[faceoffQuestion(s)],components:faceoffRows(s)});return true;
  }
  return false;
}
