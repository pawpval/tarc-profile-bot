export const GAME_STORE = [
  { id:"title_trooper", name:"Trooper", type:"title", value:"Trooper", price:750, description:"Equip the Trooper profile title." },
  { id:"title_veteran", name:"Veteran", type:"title", value:"Veteran", price:1800, description:"Equip the Veteran profile title." },
  { id:"title_tactician", name:"Tactician", type:"title", value:"Tactician", price:3500, description:"For players who live on the leaderboard." },
  { id:"title_holocron", name:"Holocron Hunter", type:"title", value:"Holocron Hunter", price:6000, description:"A rare quiz profile title." },
  { id:"title_legend", name:"Galactic Legend", type:"title", value:"Galactic Legend", price:15000, description:"The expensive one. Pure flex." },
  { id:"style_republic", name:"Republic Reactions", type:"answerStyle", value:"republic", price:1200, description:"Republic themed result reactions." },
  { id:"style_cis", name:"CIS Reactions", type:"answerStyle", value:"cis", price:1200, description:"CIS themed result reactions." },
  { id:"style_fire", name:"Fire Reactions", type:"answerStyle", value:"fire", price:2500, description:"Adds a hotter result style to your quiz runs." }
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
