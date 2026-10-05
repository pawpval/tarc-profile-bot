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
  getLevelProgress, getPlayer, mutatePlayer, purchaseItem, recordQuizAnswer
} from "./gameState.js";
import { ACHIEVEMENTS, GAME_STORE, earnedAchievements, findStoreItem, randomBetween, randomPatrol } from "./gameContent.js";
import { getQuestionPool } from "./questions.js";

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
function homeRows(){
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("game:play").setLabel("Play").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("game:profile").setLabel("Profile").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("game:shop").setLabel("Shop").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("game:leaderboard").setLabel("Leaderboard").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("game:daily").setLabel("Daily").setStyle(ButtonStyle.Success)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("game:patrol").setLabel("Patrol").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("game:achievements").setLabel("Achievements").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("game:how").setLabel("How to Play").setStyle(ButtonStyle.Secondary)
    )
  ];
}
async function homeEmbed(user){
  const p=await getPlayer(user.id);
  const lp=getLevelProgress(p);
  return new EmbedBuilder()
    .setColor(0x2b7fff)
    .setTitle("TARC Game")
    .setDescription([
      `**${p.equippedTitle || "Rookie"}**  <@${user.id}>`,
      `Level **${lp.level}**  ${progressBar(lp.current,lp.needed)} ${fmt(lp.current)}/${fmt(lp.needed)} XP`,
      "",
      `Credits: **${fmt(p.credits)}**`,
      `Quiz Elo: **${fmt(p.elo)}**  ${rankName(p.elo)}`,
      `Accuracy: **${pct(p.correctAnswers,p.questionsAnswered)}%**`,
      `Best Streak: **${fmt(p.bestStreak)}**`,
      "",
      "Pick something below. Quizzes are the main game, but everything feeds the same profile."
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
  const scope = new StringSelectMenuBuilder().setCustomId(`quiz:scope:${mode}`).setPlaceholder("Choose question category").addOptions(
    {label:"Mixed",value:"mixed"},{label:"Star Wars",value:"starwars"},{label:"TARC",value:"tarc"}
  );
  return [new ActionRowBuilder().addComponents(scope),backRow()];
}
function difficultyRows(mode,scope){
  const select = new StringSelectMenuBuilder().setCustomId(`quiz:difficulty:${mode}:${scope}`).setPlaceholder("Choose difficulty").addOptions(
    {label:"Random",value:"Random"},{label:"Easy",value:"Easy"},{label:"Medium",value:"Medium"},{label:"Hard",value:"Hard"},{label:"Extreme",value:"Extreme"}
  );
  return [new ActionRowBuilder().addComponents(select),backRow()];
}
function makeQuestionSession(userId,{mode="classic",scope="mixed",difficulty="Random",count=10}={}){
  let pool=getQuestionPool({scope,difficulty});
  if(mode==="extreme") pool=getQuestionPool({scope}).filter(q=>q.difficulty==="Hard"||q.difficulty==="Extreme");
  if(mode==="tarc"){scope="tarc";pool=getQuestionPool({scope,difficulty});}
  if(mode==="starwars"){scope="starwars";pool=getQuestionPool({scope,difficulty});}
  const questions=shuffle(pool).slice(0,Math.min(count,pool.length));
  const id=sid();
  const s={id,type:"solo",userId:String(userId),mode,scope,difficulty,questions,index:0,score:0,correct:0,wrong:0,createdAt:Date.now(),answered:false};
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
  return [new ActionRowBuilder().addComponents(...answers.map((answer,i)=>
    new ButtonBuilder().setCustomId(`quiz:answer:${s.id}:${i}:${encodeURIComponent(answer).slice(0,60)}`).setLabel(answer.slice(0,80)).setStyle(ButtonStyle.Secondary)
  ))];
}
async function finishSolo(interaction,s){
  const accuracy=pct(s.correct,s.questions.length);
  const completionCredits=Math.round(s.score*0.18);
  const completionXp=Math.round(s.score*0.10);
  await addRewards(s.userId,{credits:completionCredits,xp:completionXp});
  let eloDelta=0;
  const ranked=s.mode==="extreme";
  if(ranked){
    eloDelta=Math.max(-20,Math.min(35,Math.round((accuracy-60)/2)));
  }
  await completeQuiz(s.userId,{score:s.correct,total:s.questions.length,ranked,won:accuracy>=70,eloDelta,mode:s.mode});
  sessions.delete(s.id);
  const p=await getPlayer(s.userId);
  const embed=new EmbedBuilder().setColor(accuracy>=70?0x31c48d:0xff9500).setTitle("Quiz Complete").setDescription([
    `Score: **${s.correct}/${s.questions.length}**  ${accuracy}%`,
    `Quiz Score: **${fmt(s.score)}**`,
    `Rewards: **+${fmt(completionCredits)} Credits  +${fmt(completionXp)} XP**`,
    ranked ? `Elo: **${eloDelta>=0?"+":""}${eloDelta}**  New Elo: **${fmt(p.elo)}**` : null,
    "",
    accuracy===100?"Perfect run.":accuracy>=80?"Strong run.":accuracy>=60?"Not bad. Run it again and beat it.":"That one hurt. Try another category."
  ].filter(Boolean).join("\n"));
  return interaction.update({embeds:[embed],components:[new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("game:play").setLabel("Play Again").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("game:home").setLabel("Home").setStyle(ButtonStyle.Secondary)
  )]});
}
async function showProfile(interaction,user=interaction.user){
  const p=await getPlayer(user.id), lp=getLevelProgress(p);
  const achievements=earnedAchievements(p);
  const embed=new EmbedBuilder().setColor(0x2b7fff).setTitle(`${user.username}'s Game Profile`).setDescription([
    `**${p.equippedTitle || "Rookie"}**`,
    `Level **${lp.level}**  ${progressBar(lp.current,lp.needed)}`,
    `XP: **${fmt(p.xp)}**`,
    `Credits: **${fmt(p.credits)}**`,
    `Elo: **${fmt(p.elo)}**  ${rankName(p.elo)}`,
    "",
    `Quizzes: **${fmt(p.quizzesCompleted)}**`,
    `Questions: **${fmt(p.questionsAnswered)}**`,
    `Accuracy: **${pct(p.correctAnswers,p.questionsAnswered)}%**`,
    `Best Streak: **${fmt(p.bestStreak)}**`,
    `Ranked: **${p.rankedWins}W / ${p.rankedLosses}L**`,
    `Patrols: **${fmt(p.patrols)}**`,
    `Achievements: **${achievements.length}/${ACHIEVEMENTS.length}**`
  ].join("\n"));
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
  const e=randomPatrol(), credits=randomBetween(e.credits), xp=randomBetween(e.xp);
  await mutatePlayer(interaction.user.id,p2=>{p2.lastPatrol=Date.now();p2.patrols+=1;p2.credits+=credits;p2.lifetimeCredits+=credits;p2.xp+=xp;});
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

export function getGameCommands(){
  return [
    new SlashCommandBuilder().setName("game").setDescription("Open the TARC game hub").toJSON(),
    new SlashCommandBuilder().setName("quiz").setDescription("Start a quiz or challenge another player")
      .addUserOption(o=>o.setName("opponent").setDescription("Optional player to challenge").setRequired(false)).toJSON(),
    new SlashCommandBuilder().setName("quizleaderboard").setDescription("Open the quiz leaderboard").toJSON(),
    new SlashCommandBuilder().setName("gameadmin").setDescription("Owner-only game controls")
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
  return [new ActionRowBuilder().addComponents(...answers.map((a,i)=>new ButtonBuilder().setCustomId(`faceoff:answer:${s.id}:${i}:${encodeURIComponent(a).slice(0,60)}`).setLabel(a.slice(0,80)).setStyle(ButtonStyle.Secondary)))];
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
      return interaction.reply({embeds:[await homeEmbed(interaction.user)],components:homeRows(),ephemeral:true}).then(()=>true);
    }
    if(interaction.commandName==="quiz"){
      const opponent=interaction.options.getUser("opponent");
      if(opponent){await startChallenge(interaction,opponent);return true;}
      return interaction.reply({embeds:[new EmbedBuilder().setColor(0x2b7fff).setTitle("Play Quiz").setDescription("Choose a mode. You can change category and difficulty next.")],components:playMenu(),ephemeral:true}).then(()=>true);
    }
    if(interaction.commandName==="quizleaderboard"){
      await interaction.reply({embeds:[new EmbedBuilder().setColor(0x2b7fff).setTitle("Loading leaderboard...")],ephemeral:true});
      const rows=await getLeaderboard("elo",10);
      await interaction.editReply({embeds:[new EmbedBuilder().setColor(0x2b7fff).setTitle("Quiz Elo Leaderboard").setDescription(rows.length?rows.map((p,i)=>`**${i+1}.** <@${p.userId}>  **${fmt(p.elo)}**  ${rankName(p.elo)}`).join("\n"):"No scores yet.")],components:[]});
      return true;
    }
    if(interaction.commandName==="gameadmin"){
      if(!interaction.inGuild()) {await interaction.reply({content:"Use this in the TARC server.",ephemeral:true});return true;}
      // Discord server owner is an additional safety gate. server.js may add Roblox rank-255 verification later.
      if(interaction.guild.ownerId!==interaction.user.id){await interaction.reply({content:"Owner only.",ephemeral:true});return true;}
      const target=interaction.options.getUser("player",true),stat=interaction.options.getString("stat",true),value=interaction.options.getInteger("value",true);
      const p=await adminSetStat(target.id,stat,value);
      await interaction.reply({content:`Updated <@${target.id}>: **${stat} = ${fmt(p[stat])}**`,ephemeral:true});return true;
    }
    return false;
  }
  if(!(interaction.isButton()||interaction.isStringSelectMenu())) return false;
  const id=interaction.customId;
  if(!(id.startsWith("game:")||id.startsWith("quiz:")||id.startsWith("faceoff:"))) return false;

  if(id==="game:home") {await interaction.update({embeds:[await homeEmbed(interaction.user)],components:homeRows()});return true;}
  if(id==="game:play") {await interaction.update({embeds:[new EmbedBuilder().setColor(0x2b7fff).setTitle("Play").setDescription("Pick a mode. Everything rewards the same profile.")],components:playMenu()});return true;}
  if(id==="game:profile") {await showProfile(interaction);return true;}
  if(id==="game:leaderboard") {await showLeaderboard(interaction);return true;}
  if(id==="game:shop") {await showShop(interaction);return true;}
  if(id==="game:patrol") {await doPatrol(interaction);return true;}
  if(id==="game:achievements") {await showAchievements(interaction);return true;}
  if(id==="game:daily") {await daily(interaction);return true;}
  if(id==="game:how") {await interaction.update({embeds:[new EmbedBuilder().setColor(0x2b7fff).setTitle("How to Play").setDescription("Play quizzes to earn Credits, XP and competitive Elo. Use Credits in the shop. Level up your profile, build streaks, complete achievements and run patrols between quizzes.\n\n**Ranked rule:** Credits and shop items never buy Elo. Elo comes from competitive quiz performance.")],components:[backRow()]});return true;}

  if(id==="game:playmode"){
    const mode=interaction.values[0];
    if(mode==="extreme"){
      const s=makeQuestionSession(interaction.user.id,{mode,scope:"mixed",difficulty:"Random"});
      await interaction.update({embeds:[questionEmbed(s)],components:answerRows(s)});return true;
    }
    if(mode==="tarc"||mode==="starwars"){
      await interaction.update({embeds:[new EmbedBuilder().setColor(0x2b7fff).setTitle(mode==="tarc"?"TARC Specialist":"Galactic Specialist").setDescription("Choose a difficulty.")],components:difficultyRows(mode,mode)});return true;
    }
    await interaction.update({embeds:[new EmbedBuilder().setColor(0x2b7fff).setTitle("Choose Category").setDescription("Pick what you want to be tested on.")],components:setupRows(mode)});return true;
  }
  if(id.startsWith("quiz:scope:")){
    const mode=id.split(":")[2],scope=interaction.values[0];
    await interaction.update({embeds:[new EmbedBuilder().setColor(0x2b7fff).setTitle("Choose Difficulty").setDescription("Easy, Medium, Hard, Extreme or Random.")],components:difficultyRows(mode,scope)});return true;
  }
  if(id.startsWith("quiz:difficulty:")){
    const [, , mode,scope]=id.split(":"), difficulty=interaction.values[0];
    const s=makeQuestionSession(interaction.user.id,{mode,scope,difficulty,count:10});
    if(!s.questions.length){sessions.delete(s.id);await interaction.update({content:"No questions are available for that combination yet.",embeds:[],components:[backRow()]});return true;}
    await interaction.update({embeds:[questionEmbed(s)],components:answerRows(s)});return true;
  }
  if(id.startsWith("quiz:answer:")){
    const parts=id.split(":"), s=sessions.get(parts[2]);
    if(!s){await interaction.reply({content:"That quiz expired. Start a new one.",ephemeral:true});return true;}
    if(s.userId!==interaction.user.id){await interaction.reply({content:"This quiz belongs to someone else.",ephemeral:true});return true;}
    if(s.answered){await interaction.reply({content:"Already answered.",ephemeral:true});return true;}
    s.answered=true;
    const answer=decodeURIComponent(parts.slice(4).join(":")), item=s.questions[s.index], correct=answer===item.correct, reward=DIFFICULTY_REWARD[item.difficulty]||DIFFICULTY_REWARD.Medium;
    const credits=correct?reward.credits:0,xp=correct?reward.xp:3;
    if(correct){s.correct+=1;s.score+=reward.score;}else{s.wrong+=1;}
    await recordQuizAnswer(s.userId,{correct,category:item.category,difficulty:item.difficulty,credits,xp});
    if(s.mode==="survival"&&!correct){
      s.questions=s.questions.slice(0,s.index+1);
      return finishSolo(interaction,s);
    }
    s.index+=1;s.answered=false;
    if(s.index>=s.questions.length)return finishSolo(interaction,s);
    const result=correct?`Correct. **+${credits} Credits  +${xp} XP**`:`Wrong. The answer was **${item.correct}**.`;
    const embed=questionEmbed(s);embed.setFooter({text:result});
    await interaction.update({embeds:[embed],components:answerRows(s)});return true;
  }
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
    const answer=decodeURIComponent(parts.slice(4).join(":")),item=s.questions[s.index],correct=answer===item.correct,reward=DIFFICULTY_REWARD[item.difficulty]||DIFFICULTY_REWARD.Medium;
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
