export const GAME_STORE = [
  { id:"title_trooper", name:"Trooper", type:"title", value:"Trooper", price:750, description:"Equip the Trooper profile title." },
  { id:"title_veteran", name:"Veteran", type:"title", value:"Veteran", price:1800, description:"Equip the Veteran profile title." },
  { id:"title_tactician", name:"Tactician", type:"title", value:"Tactician", price:3500, description:"For players who live on the leaderboard." },
  { id:"title_holocron", name:"Holocron Hunter", type:"title", value:"Holocron Hunter", price:6000, description:"A rare quiz profile title." },
  { id:"title_legend", name:"Galactic Legend", type:"title", value:"Galactic Legend", price:15000, description:"The expensive one. Pure flex." },
  { id:"style_republic", name:"Republic Reactions", type:"answerStyle", value:"republic", price:1200, description:"Republic themed result reactions." },
  { id:"style_cis", name:"CIS Reactions", type:"answerStyle", value:"cis", price:1200, description:"CIS themed result reactions." },
  { id:"style_fire", name:"Fire Reactions", type:"answerStyle", value:"fire", price:2500, description:"Adds a hotter result style to your quiz runs." }
,
  { id:"title_commander", name:"Clone Commander", type:"title", value:"Clone Commander", price:5000, description:"A command-grade profile title." },
  { id:"title_arc", name:"ARC Veteran", type:"title", value:"ARC Veteran", price:7500, description:"For players who know their way around the Republic." },
  { id:"title_droid", name:"Tactical Droid", type:"title", value:"Tactical Droid", price:7500, description:"A CIS themed profile title." },
  { id:"title_general", name:"Jedi General", type:"title", value:"Jedi General", price:12000, description:"A high-end Republic title." },
  { id:"boost_xp", name:"XP Booster", type:"consumable", value:"xp_boost", price:2200, description:"Boosts XP from your next 20 correct quiz answers." },
  { id:"boost_credits", name:"Credit Booster", type:"consumable", value:"credit_boost", price:2200, description:"Boosts Credits from your next 20 correct quiz answers." },
  { id:"shield_streak", name:"Streak Shield", type:"consumable", value:"streak_shield", price:1800, description:"Protects your answer streak from one wrong answer." },
  { id:"crate_republic", name:"Republic Supply Crate", type:"crate", value:"republic_crate", price:1500, description:"Open for Credits, XP and a chance at a collectible." },
  { id:"crate_cis", name:"CIS Salvage Crate", type:"crate", value:"cis_crate", price:1500, description:"Open for Credits, XP and a chance at a collectible." }
];

export function findStoreItem(id) {
  return GAME_STORE.find(item => item.id === id) || null;
}

export const PATROL_ENCOUNTERS = [
  { id:"quiet", text:"The patrol stayed quiet. You completed the route without trouble.", weight:18, credits:[80,150], xp:[35,65] },
  { id:"civilian", text:"You helped a civilian through the city and finished the patrol.", weight:14, credits:[120,210], xp:[45,80] },
  { id:"border", text:"You assisted with activity around the Border and completed your assignment.", weight:14, credits:[150,240], xp:[55,90] },
  { id:"rogue", text:"A suspicious traveller turned hostile. You handled the encounter.", weight:10, credits:[220,340], xp:[80,125] },
  { id:"b1", text:"You ran into a B1 patrol in the Wastelands and cleared it.", weight:12, credits:[250,380], xp:[90,140] },
  { id:"b2", text:"A B2 made the patrol interesting. You brought it down and returned safely.", weight:8, credits:[340,500], xp:[120,180] },
  { id:"cisbase", text:"You gathered useful information near the CIS Base and made it back.", weight:8, credits:[300,460], xp:[105,160] },
  { id:"sewers", text:"You checked the sewers and found abandoned supplies.", weight:7, credits:[380,560], xp:[90,140] },
  { id:"invasion", text:"Your patrol crossed into a CIS attack. You survived and helped push it back.", weight:5, credits:[550,800], xp:[180,260] },
  { id:"jackpot", text:"You recovered a valuable Republic supply cache during the patrol.", weight:2, credits:[900,1300], xp:[220,320] },
  { id:"failed", text:"The patrol went wrong and you had to pull back. You still gained some experience.", weight:2, credits:[20,60], xp:[45,80] }
];

export function randomPatrol() {
  const total = PATROL_ENCOUNTERS.reduce((n,e)=>n+e.weight,0);
  let roll = Math.random()*total;
  for (const e of PATROL_ENCOUNTERS) {
    roll -= e.weight;
    if (roll <= 0) return e;
  }
  return PATROL_ENCOUNTERS[0];
}

export function randomBetween([min,max]) {
  return Math.floor(min + Math.random() * (max-min+1));
}

export const ACHIEVEMENTS = [
  { id:"first_question", name:"First Answer", description:"Answer your first quiz question.", test:p=>p.questionsAnswered>=1 },
  { id:"quiz_10", name:"Getting Started", description:"Complete 10 quizzes.", test:p=>p.quizzesCompleted>=10 },
  { id:"quiz_50", name:"Regular", description:"Complete 50 quizzes.", test:p=>p.quizzesCompleted>=50 },
  { id:"quiz_100", name:"Quiz Veteran", description:"Complete 100 quizzes.", test:p=>p.quizzesCompleted>=100 },
  { id:"correct_100", name:"Centurion", description:"Answer 100 questions correctly.", test:p=>p.correctAnswers>=100 },
  { id:"correct_500", name:"Walking Databank", description:"Answer 500 questions correctly.", test:p=>p.correctAnswers>=500 },
  { id:"streak_10", name:"On Fire", description:"Reach a 10 answer streak.", test:p=>p.bestStreak>=10 },
  { id:"streak_25", name:"Locked In", description:"Reach a 25 answer streak.", test:p=>p.bestStreak>=25 },
  { id:"elo_1250", name:"Ranked", description:"Reach 1,250 Elo.", test:p=>p.elo>=1250 },
  { id:"elo_1500", name:"Contender", description:"Reach 1,500 Elo.", test:p=>p.elo>=1500 },
  { id:"elo_2000", name:"Elite Mind", description:"Reach 2,000 Elo.", test:p=>p.elo>=2000 },
  { id:"rich_10000", name:"Loaded", description:"Hold 10,000 Credits.", test:p=>p.credits>=10000 },
  { id:"patrol_25", name:"Patrol Regular", description:"Complete 25 patrols.", test:p=>p.patrols>=25 }
];

export function earnedAchievements(profile) {
  return ACHIEVEMENTS.filter(a=>a.test(profile));
}


export const GAME_QUESTS = [
  { id:"q_answer_10", name:"Warm Up", key:"answers", target:10, credits:300, xp:120, seasonXp:100, description:"Answer 10 quiz questions." },
  { id:"q_correct_8", name:"Sharp Shooter", key:"correct", target:8, credits:400, xp:160, seasonXp:125, description:"Get 8 quiz answers correct." },
  { id:"q_quiz_3", name:"Study Session", key:"quizzes", target:3, credits:500, xp:200, seasonXp:150, description:"Complete 3 quizzes." },
  { id:"q_patrol_3", name:"On Duty", key:"patrols", target:3, credits:550, xp:220, seasonXp:150, description:"Complete 3 patrols." },
  { id:"q_faceoff_1", name:"Challenge Accepted", key:"faceoffs", target:1, credits:650, xp:250, seasonXp:200, description:"Complete a Face Off." },
  { id:"q_streak_5", name:"Locked In", key:"streak5", target:1, credits:450, xp:180, seasonXp:125, description:"Reach a 5-answer streak." }
];

export const COLLECTIBLES = [
  {id:"holocron_blue",name:"Blue Holocron",rarity:"Common"},
  {id:"clone_helmet",name:"Clone Helmet",rarity:"Common"},
  {id:"b1_head",name:"B1 Droid Head",rarity:"Common"},
  {id:"republic_emblem",name:"Republic Emblem",rarity:"Uncommon"},
  {id:"cis_emblem",name:"CIS Emblem",rarity:"Uncommon"},
  {id:"kyber_green",name:"Green Kyber Shard",rarity:"Rare"},
  {id:"kyber_blue",name:"Blue Kyber Shard",rarity:"Rare"},
  {id:"commando_badge",name:"Commando Badge",rarity:"Rare"},
  {id:"darksaber_fragment",name:"Darksaber Fragment",rarity:"Epic"},
  {id:"gold_holocron",name:"Golden Holocron",rarity:"Legendary"}
];

export const SEASON_REWARDS = [
  {tier:1,credits:0,xp:0,label:"Season Recruit"},
  {tier:2,credits:300,xp:100,label:"300 Credits"},
  {tier:3,credits:500,xp:150,label:"500 Credits"},
  {tier:4,credits:750,xp:200,label:"750 Credits"},
  {tier:5,credits:1000,xp:300,label:"1,000 Credits"},
  {tier:6,credits:1250,xp:350,label:"1,250 Credits"},
  {tier:7,credits:1500,xp:400,label:"1,500 Credits"},
  {tier:8,credits:2000,xp:500,label:"2,000 Credits"},
  {tier:9,credits:2500,xp:600,label:"2,500 Credits"},
  {tier:10,credits:4000,xp:1000,label:"Season Veteran"}
];


export const COMMAND_UNITS = [
  {id:"second_lieutenant",name:"Second Lieutenant",cost:1200,income:45,level:2},
  {id:"lieutenant",name:"Lieutenant",cost:2600,income:95,level:4},
  {id:"captain",name:"Captain",cost:5200,income:190,level:7},
  {id:"major",name:"Major",cost:9500,income:340,level:11},
  {id:"lieutenant_colonel",name:"Lieutenant Colonel",cost:16500,income:575,level:16},
  {id:"colonel",name:"Colonel",cost:28000,income:950,level:22}
];

export const SKILL_TREE = [
  {id:"quiz_pay",name:"Field Pay",description:"+10% Credits from correct quiz answers per rank.",max:3,costs:[1500,3500,7000]},
  {id:"quiz_xp",name:"Combat Training",description:"+10% XP from correct quiz answers per rank.",max:3,costs:[1500,3500,7000]},
  {id:"patrol_pay",name:"Patrol Logistics",description:"+10% Credits from patrols per rank.",max:3,costs:[1800,4000,8000]},
  {id:"event_pay",name:"Operational Command",description:"+10% Credits from dynamic events per rank.",max:3,costs:[2000,4500,9000]},
  {id:"crate_luck",name:"Salvage Training",description:"Improves collectible chances from supply crates.",max:3,costs:[2200,5000,10000]}
];

export const OPERATION_EVENTS = [
  {id:"cis_raid",name:"CIS Raid",icon:"🚨",text:"A CIS force pushes toward the city. You join the defence.",credits:[300,470],xp:[130,200]},
  {id:"bomb",name:"Bomb Threat",icon:"💣",text:"A device is reported near a public route. Your team secures the area.",credits:[260,420],xp:[120,185]},
  {id:"vip",name:"VIP Escort",icon:"🛡️",text:"You escort a Republic VIP through a hostile route.",credits:[330,510],xp:[145,215]},
  {id:"droids",name:"Droid Swarm",icon:"🤖",text:"B1 units flood a checkpoint and you help clear them.",credits:[290,460],xp:[125,195]},
  {id:"supplies",name:"Supply Recovery",icon:"📦",text:"Republic supplies have gone missing in the Wastelands.",credits:[250,430],xp:[115,180]},
  {id:"sewers",name:"Sewer Sweep",icon:"🔦",text:"Hostile movement is reported beneath the city. You clear the route.",credits:[310,480],xp:[135,205]},
  {id:"terminal",name:"Terminal Defence",icon:"⚔️",text:"The terminal comes under attack. You reinforce the defenders.",credits:[340,530],xp:[150,225]}
];

export const CRATE_DROPS = [
  {rarity:"Common",weight:55,credits:[200,450],xp:[60,120]},
  {rarity:"Uncommon",weight:28,credits:[450,800],xp:[120,210]},
  {rarity:"Rare",weight:12,credits:[800,1400],xp:[210,340]},
  {rarity:"Epic",weight:4,credits:[1400,2300],xp:[340,520]},
  {rarity:"Legendary",weight:1,credits:[2500,4000],xp:[600,900]}
];
