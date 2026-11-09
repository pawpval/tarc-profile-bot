// Galactic Command V2. Card IDs, not display names, are the permanent identifiers.
// Only clone military units receive clone military ranks. Custom TARC companies
// may exist in the game, but Jedi, guards, intelligence and droids use their own
// real unit designations rather than invented cross-division military ranks.
export const RARITIES = {
  Common: { color: 0x92969c, weight: 54, multiplier: 1 },
  Uncommon: { color: 0x37b96e, weight: 27, multiplier: 1.3 },
  Rare: { color: 0x298be8, weight: 12, multiplier: 1.75 },
  Epic: { color: 0x9b5de5, weight: 5, multiplier: 2.4 },
  Legendary: { color: 0xffa726, weight: 1.7, multiplier: 3.5 },
  Mythical: { color: 0xed568c, weight: 0.3, multiplier: 5 }
};

export const FACTIONS = {
  republic: { name: "Galactic Republic", short: "Republic", color: 0x3989ff },
  cis: { name: "Separatist Alliance", short: "CIS", color: 0xe28e2b },
  independent: { name: "Independent Outlaws", short: "Independent", color: 0x47ae9a }
};

export const CRATES = {
  standard: { name: "Galactic Supply Crate", price: 900, count: 3, pool: null, weights: [60, 25, 10, 4, 0.9, 0.1] },
  republic: { name: "Republic Military Crate", price: 1250, count: 3, pool: "republic", weights: [53, 28, 13, 5, 0.9, 0.1] },
  cis: { name: "Separatist Arsenal", price: 1250, count: 3, pool: "cis", weights: [53, 28, 13, 5, 0.9, 0.1] },
  outlaw: { name: "Underworld Cache", price: 1250, count: 3, pool: "independent", weights: [53, 28, 13, 5, 0.9, 0.1] },
  elite: { name: "Elite Command Crate", price: 4000, count: 3, pool: null, weights: [10, 32, 38, 16, 3.5, 0.5] },
  legendary: { name: "Legendary Vault", price: 12000, count: 3, pool: null, weights: [0, 10, 38, 37, 13, 2] }
};

export const MISSIONS = [
  { id: "border", name: "Border Patrol", cooldown: 8 * 60000, credits: [180, 270], xp: 70, scrap: 2, difficulty: 12 },
  { id: "supplies", name: "Supply Recovery", cooldown: 15 * 60000, credits: [290, 450], xp: 110, scrap: 3, difficulty: 26 },
  { id: "sewers", name: "Coruscant Sewer Sweep", cooldown: 25 * 60000, credits: [450, 690], xp: 170, scrap: 5, difficulty: 42 },
  { id: "droid", name: "Droid Uprising", cooldown: 40 * 60000, credits: [700, 1100], xp: 260, scrap: 8, difficulty: 70 },
  { id: "vip", name: "VIP Protection", cooldown: 55 * 60000, credits: [950, 1500], xp: 320, scrap: 10, difficulty: 96 },
  { id: "infiltration", name: "Enemy Base Infiltration", cooldown: 75 * 60000, credits: [1500, 2300], xp: 460, scrap: 14, difficulty: 150 }
];
const DAILY_CONTRACTS = [
  ["Track a Rogue Bounty Hunter",850,1500,320,12,105],
  ["Recover Missing Senate Intelligence",650,1150,260,9,88],
  ["Hunt a Separatist Saboteur",750,1350,300,11,95],
  ["Locate a Lost Clone Squad",700,1220,280,10,90],
  ["Intercept a Mandalorian Smuggler",920,1650,355,14,125],
  ["Investigate a Droid Factory",1050,1900,400,16,140],
  ["Escort a Damaged Fleet Transport",780,1450,330,12,110]
];
export function dailyContract(now=Date.now()) {
  const key=new Date(now).toISOString().slice(0,10);
  const index=[...key].reduce((n,c)=>n*31+c.charCodeAt(0),0)>>>0;
  const [name,min,max,xp,scrap,difficulty]=DAILY_CONTRACTS[index%DAILY_CONTRACTS.length];
  return {id:"contract",name,credits:[min,max],xp,scrap,difficulty,cooldown:90*60000};
}

export const QUESTS = [
  { id: "roll", action: "roll", label: "Recruit cards", target: 3, credits: 300, xp: 90 },
  { id: "missions", action: "mission", label: "Run missions", target: 3, credits: 420, xp: 140 },
  { id: "raid", action: "raid", label: "Attempt raids", target: 2, credits: 500, xp: 160 },
  { id: "win", action: "win", label: "Win raids", target: 1, credits: 550, xp: 150 },
  { id: "upgrade", action: "upgrade", label: "Upgrade cards", target: 1, credits: 320, xp: 120 },
  { id: "claim", action: "income", label: "Earn Credits from workers", target: 1, credits: 200, xp: 90 },
  { id: "crate", action: "crate", label: "Open supply crates", target: 1, credits: 450, xp: 160 },
  { id: "duel", action: "duel", label: "Fight duels", target: 1, credits: 340, xp: 140 },
  { id: "trade", action: "trade", label: "Complete card trades", target: 1, credits: 300, xp: 120 }
];

const slug = text => String(text).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const cards = new Map();
function put(name, faction, rarity, role, imageKey, ability = "assault", extras = {}) {
  const id = slug(`${faction}_${name}`);
  if (cards.has(id)) return;
  const tier = RARITIES[rarity];
  const roleBase = { Infantry: [13, 16, 12], Commander: [24, 18, 20], Specialist: [20, 21, 15], Guardian: [15, 26, 15], Vehicle: [30, 27, 11], Jedi: [29, 24, 19], Droid: [17, 17, 14], Bounty: [27, 17, 16] }[role] || [17, 17, 14];
  const m = tier.multiplier;
  cards.set(id, Object.freeze({ id, name, faction, rarity, role, ability, imageKey, attack: Math.round(roleBase[0] * m), defense: Math.round(roleBase[1] * m), income: Math.round(roleBase[2] * m), ...extras }));
}

const cloneDivisions = [
  ["501st Legion", ["Torrent Company", "332nd Company", "Triton Company", "Phalanx Company"]],
  ["212th Attack Battalion", ["Ghost Company", "Airborne Company", "Paratrooper Company"]],
  ["41st Elite Corps", ["Green Company", "Ranger Corps", "Sarlacc Company", "Zeus Company"]],
  ["327th Star Corps", ["Keller Company", "Foxtrot Company", "Bacta Company"]],
  ["91st Reconnaissance Corps", ["Speed Demon Company", "BARC Recon Squad"]],
  ["104th Battalion", ["Wolfpack", "ARF Company", "Timber Company"]],
  ["187th Legion", ["Magenta Company", "Wraith Company", "Airborne Company"]],
  ["552nd Legion", ["Doom Company"]],
  ["5th Fleet Security", ["Fleet Guard", "Bridge Security"]],
  ["Galactic Marines", ["Marine Guard", "Marine Heavy Weapons"]]
];

for (const [division, companies] of cloneDivisions) {
  put(`${division} Trooper`, "republic", "Common", "Infantry", "clone");
  put(`${division} Sergeant`, "republic", "Uncommon", "Infantry", "clone", "fortify");
  put(`${division} Lieutenant`, "republic", "Rare", "Specialist", "clone", "tactics");
  put(`${division} Captain`, "republic", "Epic", "Commander", "clone", "command");
  put(`${division} Commander`, "republic", "Legendary", "Commander", "clone", "command");
  for (const company of companies) {
    put(`${division} ${company} Trooper`, "republic", "Uncommon", "Infantry", "clone", "assault");
    put(`${division} ${company} Officer`, "republic", "Rare", "Specialist", "clone", "tactics");
    put(`${division} ${company} Commander`, "republic", "Epic", "Commander", "clone", "command");
  }
}

// These entries represent distinct roles, orders and unit types, not an
// automatic Sergeant/Officer/Commander progression stamped onto everything.
const specializedRepublic = [
  ["Republic Commando", "Common", "Specialist", "commando", "assault"],
  ["Republic Commando Squad Leader", "Rare", "Commander", "commando", "command"],
  ["Delta Squad Commando", "Uncommon", "Specialist", "commando", "tactics"],
  ["Omega Squad Commando", "Uncommon", "Specialist", "commando", "tactics"],
  ["Yayax Squad Commando", "Uncommon", "Specialist", "commando", "ambush"],
  ["ARC Trooper", "Common", "Specialist", "arc", "assault"],
  ["ARC Lieutenant", "Rare", "Commander", "arc", "tactics"],
  ["ARC Captain", "Epic", "Commander", "arc", "command"],
  ["Null-class ARC Trooper", "Epic", "Specialist", "arc", "ambush"],
  ["Alpha-class ARC Trooper", "Rare", "Specialist", "arc", "assault"],
  ["Coruscant Guard Shock Trooper", "Common", "Guardian", "shock", "fortify"],
  ["Coruscant Guard Riot Trooper", "Uncommon", "Guardian", "shock", "fortify"],
  ["Coruscant Guard Sergeant", "Uncommon", "Infantry", "shock", "tactics"],
  ["Coruscant Guard Lieutenant", "Rare", "Specialist", "shock", "tactics"],
  ["Coruscant Guard Captain", "Epic", "Commander", "shock", "command"],
  ["Coruscant Guard Commander", "Legendary", "Commander", "shock", "command"],
  ["Senate Guardsman", "Common", "Guardian", "senateGuard", "fortify"],
  ["Senate Honor Guard", "Uncommon", "Guardian", "senateGuard", "guardian"],
  ["Senate Commando", "Rare", "Specialist", "senateGuard", "assault"],
  ["Senate Guard Captain", "Epic", "Commander", "senateGuard", "command"],
  ["Red Guard Guardsman", "Common", "Guardian", "redGuard", "fortify"],
  ["Red Guard Shadow Guard", "Rare", "Specialist", "redGuard", "ambush"],
  ["Red Guard Sovereign Protector", "Epic", "Guardian", "redGuard", "guardian"],
  ["Republic Intelligence Junior Agent", "Common", "Specialist", "intelligence", "ambush"],
  ["Republic Intelligence Field Agent", "Uncommon", "Specialist", "intelligence", "tactics"],
  ["Republic Intelligence Senior Agent", "Rare", "Specialist", "intelligence", "tactics"],
  ["Republic Intelligence Field Officer", "Epic", "Commander", "intelligence", "command"],
  ["Republic Intelligence Covert Operative", "Rare", "Specialist", "intelligence", "ambush"],
  ["Republic Intelligence Internal Affairs Agent", "Uncommon", "Specialist", "intelligence", "tactics"],
  ["Republic Navy Crewman", "Common", "Infantry", "navy", "economy"],
  ["Republic Navy Starfighter Pilot", "Uncommon", "Specialist", "navy", "ambush"],
  ["Republic Navy Lieutenant", "Rare", "Specialist", "navy", "tactics"],
  ["Republic Navy Captain", "Epic", "Commander", "navy", "command"],
  ["Republic Navy Admiral", "Legendary", "Commander", "navy", "command"],
  ["Jedi Initiate", "Common", "Jedi", "jedi", "tactics"],
  ["Jedi Padawan", "Uncommon", "Jedi", "jedi", "assault"],
  ["Jedi Knight", "Rare", "Jedi", "jedi", "assault"],
  ["Jedi Sentinel", "Rare", "Jedi", "jedi", "ambush"],
  ["Jedi Consular", "Rare", "Jedi", "jedi", "guardian"],
  ["Jedi Temple Guard", "Epic", "Guardian", "temple", "guardian"],
  ["Jedi Master", "Legendary", "Jedi", "jedi", "command"],
  ["Jedi High Council Member", "Legendary", "Jedi", "jedi", "command"]
];
for (const [name, rarity, role, key, ability] of specializedRepublic) put(name, "republic", rarity, role, key, ability);

const separatistUnits = [
  ["B1 Battle Droid", "Common", "Droid", "b1", "assault"],
  ["B1 Security Battle Droid", "Common", "Droid", "b1", "fortify"],
  ["B1 Pilot Battle Droid", "Uncommon", "Droid", "b1", "tactics"],
  ["B1 Battle Droid Commander", "Rare", "Commander", "b1", "command"],
  ["OOM-series Command Battle Droid", "Epic", "Commander", "b1", "command"],
  ["B2 Super Battle Droid", "Common", "Droid", "b2", "assault"],
  ["B2 Rocket Droid", "Uncommon", "Droid", "b2", "assault"],
  ["BX Commando Droid", "Uncommon", "Specialist", "bx", "ambush"],
  ["BX Commando Droid Captain", "Rare", "Commander", "bx", "tactics"],
  ["Droideka", "Uncommon", "Vehicle", "droideka", "guardian"],
  ["IG-100 MagnaGuard", "Uncommon", "Guardian", "magnaguard", "guardian"],
  ["IG-100 Electrostaff MagnaGuard", "Rare", "Guardian", "magnaguard", "assault"],
  ["T-series Tactical Droid", "Rare", "Specialist", "tactical", "tactics"],
  ["Super Tactical Droid", "Epic", "Commander", "tactical", "command"],
  ["Vulture Droid Starfighter", "Common", "Vehicle", "vulture", "assault"],
  ["Hyena-class Droid Bomber", "Rare", "Vehicle", "vulture", "assault"],
  ["Droid Tri-fighter", "Epic", "Vehicle", "vulture", "ambush"],
  ["Death Watch Warrior", "Common", "Infantry", "deathWatch", "assault"],
  ["Death Watch Jetpack Warrior", "Uncommon", "Specialist", "deathWatch", "ambush"],
  ["Death Watch Captain", "Epic", "Commander", "deathWatch", "command"]
];
for (const [name, rarity, role, key, ability] of separatistUnits) put(name, "cis", rarity, role, key, ability);

// Individual characters: known film-era portraits use reliable SWAPI-indexed character IDs.
const characters = [
  ["Captain Rex", "republic", "Legendary", "Commander", "commander", "command"],
  ["Commander Cody", "republic", "Legendary", "Commander", "commander", "command"],
  ["Commander Gree", "republic", "Epic", "Commander", "commander", "tactics"],
  ["Commander Fox", "republic", "Epic", "Commander", "commander", "fortify"],
  ["Commander Thorn", "republic", "Epic", "Commander", "commander", "fortify"],
  ["Commander Bacara", "republic", "Epic", "Commander", "commander", "assault"],
  ["Commander Doom", "republic", "Epic", "Commander", "commander", "assault"],
  ["Commander Bly", "republic", "Epic", "Commander", "commander", "command"],
  ["Commander Wolffe", "republic", "Legendary", "Commander", "commander", "command"],
  ["ARC Fives", "republic", "Epic", "Specialist", "commander", "ambush"],
  ["ARC Echo", "republic", "Epic", "Specialist", "commander", "tactics"],
  ["ARC Jesse", "republic", "Rare", "Specialist", "commander", "tactics"],
  ["Clone Trooper Tup", "republic", "Common", "Infantry", "clone", "assault"],
  ["Clone Trooper Hardcase", "republic", "Uncommon", "Infantry", "clone", "assault"],
  ["Clone Trooper Kix", "republic", "Uncommon", "Specialist", "clone", "guardian"],
  ["Clone Trooper Waxer", "republic", "Uncommon", "Infantry", "clone", "fortify"],
  ["Clone Trooper Boil", "republic", "Uncommon", "Infantry", "clone", "assault"],
  ["Clone Trooper Jesse", "republic", "Rare", "Specialist", "clone", "tactics"],
  ["Delta Boss", "republic", "Epic", "Specialist", "commander", "command"],
  ["Delta Fixer", "republic", "Rare", "Specialist", "commander", "tactics"],
  ["Delta Scorch", "republic", "Rare", "Specialist", "commander", "assault"],
  ["Delta Sev", "republic", "Rare", "Specialist", "commander", "ambush"],
  ["Omega Atin", "republic", "Rare", "Specialist", "commander", "assault"],
  ["Omega Niner", "republic", "Rare", "Specialist", "commander", "tactics"],
  ["Obi-Wan Kenobi", "republic", "Mythical", "Jedi", "jedi", "guardian", { portrait: 10 }],
  ["Anakin Skywalker", "republic", "Mythical", "Jedi", "jedi", "assault", { portrait: 11 }],
  ["Yoda", "republic", "Mythical", "Jedi", "jedi", "guardian", { portrait: 20 }],
  ["Mace Windu", "republic", "Legendary", "Jedi", "jedi", "tactics", { portrait: 51 }],
  ["Plo Koon", "republic", "Legendary", "Jedi", "jedi", "guardian", { portrait: 58 }],
  ["Kit Fisto", "republic", "Legendary", "Jedi", "jedi", "guardian", { portrait: 54 }],
  ["Aayla Secura", "republic", "Legendary", "Jedi", "jedi", "assault", { portrait: 46 }],
  ["Ki-Adi-Mundi", "republic", "Legendary", "Jedi", "jedi", "tactics", { portrait: 52 }],
  ["Shaak Ti", "republic", "Legendary", "Jedi", "jedi", "guardian", { portrait: 63 }],
  ["Ahsoka Tano", "republic", "Mythical", "Jedi", "jedi", "assault"],
  ["Supreme Chancellor Palpatine", "republic", "Mythical", "Commander", "commander", "command", { portrait: 21 }],
  ["Vice Chancellor", "republic", "Epic", "Commander", "commander", "command"],
  ["Grand Marshal", "republic", "Legendary", "Commander", "commander", "command"],
  ["Supreme Commander", "republic", "Legendary", "Commander", "commander", "command"],
  ["Count Dooku", "cis", "Mythical", "Jedi", "sith", "assault", { portrait: 67 }],
  ["General Grievous", "cis", "Mythical", "Commander", "sith", "command", { portrait: 79 }],
  ["Darth Maul", "cis", "Mythical", "Jedi", "sith", "ambush", { portrait: 44 }],
  ["Asajj Ventress", "cis", "Legendary", "Jedi", "sith", "ambush"],
  ["Wat Tambor", "cis", "Epic", "Commander", "droid", "economy"],
  ["Nute Gunray", "cis", "Epic", "Commander", "droid", "economy", { portrait: 33 }],
  ["Mina Bonteri", "cis", "Uncommon", "Specialist", "senate", "tactics"],
  ["General Kalani", "cis", "Epic", "Commander", "tactical", "command"],
  ["Admiral Trench", "cis", "Legendary", "Commander", "navy", "tactics"],
  ["Poggle the Lesser", "cis", "Epic", "Commander", "droid", "economy"],
  ["Lok Durd", "cis", "Rare", "Commander", "droid", "tactics"],
  ["San Hill", "cis", "Epic", "Commander", "droid", "economy"],
  ["Riff Tamson", "cis", "Rare", "Specialist", "outlaw", "ambush"],
  ["Boba Fett", "independent", "Mythical", "Bounty", "outlaw", "ambush", { portrait: 22 }],
  ["Jango Fett", "independent", "Mythical", "Bounty", "outlaw", "ambush", { portrait: 69 }],
  ["Kuiil", "independent", "Common", "Specialist", "outlaw", "economy"],
  ["Peli Motto", "independent", "Common", "Specialist", "outlaw", "economy"],
  ["Greef Karga", "independent", "Rare", "Commander", "outlaw", "tactics"],
  ["Bo-Katan Kryze", "independent", "Legendary", "Bounty", "outlaw", "command"],
  ["Pre Vizsla", "independent", "Legendary", "Bounty", "outlaw", "command"],
  ["Cad Bane", "independent", "Legendary", "Bounty", "outlaw", "ambush"],
  ["Din Djarin", "independent", "Mythical", "Bounty", "outlaw", "guardian"],
  ["The Armorer", "independent", "Epic", "Specialist", "outlaw", "fortify"],
  ["Darth Vader", "independent", "Mythical", "Jedi", "sith", "assault", { portrait: 4 }],
  ["Darth Sidious", "cis", "Mythical", "Jedi", "sith", "command", { portrait: 21 }],
  ["Qui-Gon Jinn", "republic", "Legendary", "Jedi", "jedi", "guardian", { portrait: 32 }],
  ["Eeth Koth", "republic", "Epic", "Jedi", "jedi", "assault", { portrait: 53 }],
  ["Adi Gallia", "republic", "Epic", "Jedi", "jedi", "tactics", { portrait: 55 }],
  ["Saesee Tiin", "republic", "Epic", "Jedi", "jedi", "assault", { portrait: 56 }],
  ["Yarael Poof", "republic", "Rare", "Jedi", "jedi", "guardian", { portrait: 57 }],
  ["Padmé Amidala", "republic", "Legendary", "Commander", "senate", "tactics", { portrait: 35 }],
  ["Finis Valorum", "republic", "Rare", "Commander", "senate", "command", { portrait: 34 }],
  ["Captain Panaka", "republic", "Rare", "Specialist", "senate", "guardian", { portrait: 42 }],
  ["Mas Amedda", "republic", "Rare", "Commander", "senate", "command", { portrait: 59 }],
  ["Leia Organa", "republic", "Legendary", "Commander", "senate", "command", { portrait: 5 }],
  ["Luke Skywalker", "republic", "Mythical", "Jedi", "jedi", "guardian", { portrait: 1 }],
  ["R2-D2", "republic", "Epic", "Droid", "droid", "tactics", { portrait: 3 }],
  ["C-3PO", "republic", "Rare", "Droid", "droid", "tactics", { portrait: 2 }],
  ["Admiral Ackbar", "republic", "Epic", "Commander", "navy", "command", { portrait: 27 }],
  ["Mon Mothma", "republic", "Epic", "Commander", "senate", "command", { portrait: 28 }],
  ["Wedge Antilles", "republic", "Rare", "Specialist", "navy", "ambush", { portrait: 18 }],
  ["Chewbacca", "independent", "Legendary", "Bounty", "outlaw", "guardian", { portrait: 13 }],
  ["Han Solo", "independent", "Legendary", "Bounty", "outlaw", "ambush", { portrait: 14 }],
  ["Lando Calrissian", "independent", "Epic", "Commander", "outlaw", "economy", { portrait: 25 }],
  ["Greedo", "independent", "Rare", "Bounty", "outlaw", "ambush", { portrait: 15 }],
  ["Bossk", "independent", "Epic", "Bounty", "outlaw", "ambush", { portrait: 24 }],
  ["IG-88", "independent", "Epic", "Droid", "outlaw", "assault", { portrait: 23 }],
  ["Jabba the Hutt", "independent", "Legendary", "Commander", "outlaw", "economy", { portrait: 16 }],
  ["Wicket W. Warrick", "independent", "Rare", "Infantry", "outlaw", "ambush", { portrait: 30 }],
  ["Watto", "independent", "Uncommon", "Bounty", "outlaw", "economy", { portrait: 40 }],
  ["Sebulba", "independent", "Rare", "Bounty", "outlaw", "ambush", { portrait: 41 }],
  ["Grand Moff Tarkin", "independent", "Legendary", "Commander", "navy", "command", { portrait: 12 }],
  ["Bib Fortuna", "independent", "Rare", "Bounty", "outlaw", "economy", { portrait: 45 }],
  ["Grand Admiral Thrawn", "independent", "Legendary", "Commander", "outlaw", "tactics"],
  ["Purge Trooper", "independent", "Rare", "Guardian", "outlaw", "fortify"],
  ["Death Trooper", "independent", "Rare", "Specialist", "outlaw", "ambush"],
  ["Imperial Shock Trooper", "independent", "Uncommon", "Infantry", "outlaw", "fortify"],
  ["Mandalorian Warrior", "independent", "Uncommon", "Bounty", "outlaw", "assault"],
  ["Mandalorian Super Commando", "independent", "Epic", "Bounty", "outlaw", "assault"],
  ["Outlaw Mercenary", "independent", "Common", "Infantry", "outlaw", "ambush"]
];
const nonCharacterRoles = new Set([
  "Vice Chancellor", "Grand Marshal", "Supreme Commander",
  "Purge Trooper", "Death Trooper", "Imperial Shock Trooper",
  "Mandalorian Warrior", "Mandalorian Super Commando", "Outlaw Mercenary"
]);
for (const [name, faction, rarity, role, key, ability, extras = {}] of characters)
  put(name, faction, rarity, role, key, ability, { ...extras, named: !nonCharacterRoles.has(name) });

// Existing saves and card drops retain their original IDs. The former catalogue
// incorrectly stamped army ranks onto every organization; translate those old
// IDs to a valid current card without destroying owned copies, levels or UIDs.
const LEGACY_CARD_ALIASES = new Map();
function alias(oldName, currentName, faction) {
  const from = slug(`${faction}_${oldName}`), to = slug(`${faction}_${currentName}`);
  if (from !== to) LEGACY_CARD_ALIASES.set(from, to);
}
for (const [division, companies] of cloneDivisions) {
  alias(`${division} Company Officer`, `${division} Lieutenant`, "republic");
  alias(`${division} Company Commander`, `${division} Captain`, "republic");
  alias(`${division} Commanding Officer`, `${division} Commander`, "republic");
}
const formerSpecialDivisions = [
  ["Republic Commandos", ["Delta Squad", "Omega Squad", "Yayax Squad"], ["Republic Commando", "Republic Commando", "Republic Commando Squad Leader", "Republic Commando Squad Leader", "Republic Commando Squad Leader"], ["Delta Squad Commando", "Omega Squad Commando", "Yayax Squad Commando"]],
  ["Advanced Recon Commandos", ["Null Squad", "Alpha Squad", "Onyx Squad"], ["ARC Trooper", "ARC Trooper", "ARC Lieutenant", "ARC Captain", "ARC Captain"], ["Null-class ARC Trooper", "Alpha-class ARC Trooper", "ARC Trooper"]],
  ["Coruscant Guard", ["Shock Troopers", "Riot Company", "Hound Company"], ["Coruscant Guard Shock Trooper", "Coruscant Guard Sergeant", "Coruscant Guard Lieutenant", "Coruscant Guard Captain", "Coruscant Guard Commander"], ["Coruscant Guard Shock Trooper", "Coruscant Guard Riot Trooper", "Coruscant Guard Shock Trooper"]],
  ["Senate Guard", ["Honor Guard", "Commando Guard"], ["Senate Guardsman", "Senate Honor Guard", "Senate Commando", "Senate Guard Captain", "Senate Guard Captain"], ["Senate Honor Guard", "Senate Commando"]],
  ["Red Guard", ["Sovereign Protectors", "Shadow Guard"], ["Red Guard Guardsman", "Red Guard Guardsman", "Red Guard Shadow Guard", "Red Guard Sovereign Protector", "Red Guard Sovereign Protector"], ["Red Guard Sovereign Protector", "Red Guard Shadow Guard"]],
  ["Republic Intelligence", ["Internal Affairs", "Covert Operations", "Field Agents"], ["Republic Intelligence Junior Agent", "Republic Intelligence Field Agent", "Republic Intelligence Senior Agent", "Republic Intelligence Field Officer", "Republic Intelligence Field Officer"], ["Republic Intelligence Internal Affairs Agent", "Republic Intelligence Covert Operative", "Republic Intelligence Field Agent"]],
  ["Republic Navy", ["Fleet Command", "Starfighter Corps"], ["Republic Navy Crewman", "Republic Navy Starfighter Pilot", "Republic Navy Lieutenant", "Republic Navy Captain", "Republic Navy Admiral"], ["Republic Navy Captain", "Republic Navy Starfighter Pilot"]],
  ["Jedi Order", ["Temple Guard", "Jedi Sentinels", "Jedi Consulars"], ["Jedi Initiate", "Jedi Padawan", "Jedi Knight", "Jedi Master", "Jedi High Council Member"], ["Jedi Temple Guard", "Jedi Sentinel", "Jedi Consular"]]
];
for (const [division, companies, ranks, units] of formerSpecialDivisions) {
  for (const [i, suffix] of ["Trooper", "Sergeant", "Company Officer", "Company Commander", "Commanding Officer"].entries())
    alias(`${division} ${suffix}`, ranks[i], "republic");
  for (const [i, company] of companies.entries()) {
    for (const suffix of ["Trooper", "Officer", "Commander"])
      alias(`${division} ${company} ${suffix}`, units[i], "republic");
  }
  if (division === "Republic Navy") alias(`${division} Starfighter`, "Republic Navy Starfighter Pilot", "republic");
}
const formerSeparatistDivisions = [
  ["B1 Droid Army", ["Security Droid", "Pilot Droid", "Heavy Droid", "Officer Droid"], ["B1 Battle Droid", "B1 Security Battle Droid", "B1 Battle Droid Commander", "OOM-series Command Battle Droid"], ["B1 Security Battle Droid", "B1 Pilot Battle Droid", "B1 Battle Droid", "B1 Battle Droid Commander"]],
  ["B2 Super Battle Droids", ["Heavy Assault", "Security Unit"], ["B2 Super Battle Droid", "B2 Rocket Droid", "B2 Rocket Droid", "B2 Super Battle Droid"], ["B2 Super Battle Droid", "B2 Rocket Droid"]],
  ["BX Commando Droids", ["Stealth Unit", "Squad Leader"], ["BX Commando Droid", "BX Commando Droid", "BX Commando Droid Captain", "BX Commando Droid Captain"], ["BX Commando Droid", "BX Commando Droid Captain"]],
  ["Droideka Corps", ["Shield Unit", "Assault Unit"], ["Droideka", "Droideka", "Droideka", "Droideka"], ["Droideka", "Droideka"]],
  ["MagnaGuard Corps", ["Electrostaff Guard", "Elite Guard"], ["IG-100 MagnaGuard", "IG-100 MagnaGuard", "IG-100 Electrostaff MagnaGuard", "IG-100 Electrostaff MagnaGuard"], ["IG-100 Electrostaff MagnaGuard", "IG-100 MagnaGuard"]],
  ["Tactical Droids", ["Battlefield Coordinator", "Strategic Officer"], ["T-series Tactical Droid", "T-series Tactical Droid", "T-series Tactical Droid", "Super Tactical Droid"], ["T-series Tactical Droid", "Super Tactical Droid"]],
  ["Separatist Navy", ["Vulture Fighter", "Hyena Bomber"], ["Vulture Droid Starfighter", "Vulture Droid Starfighter", "Hyena-class Droid Bomber", "Droid Tri-fighter"], ["Vulture Droid Starfighter", "Hyena-class Droid Bomber"]],
  ["Death Watch", ["Jetpack Warrior", "Death Watch Captain"], ["Death Watch Warrior", "Death Watch Warrior", "Death Watch Jetpack Warrior", "Death Watch Captain"], ["Death Watch Jetpack Warrior", "Death Watch Captain"]]
];
for (const [division, companies, ranks, units] of formerSeparatistDivisions) {
  for (const [i, suffix] of ["Unit", "Veteran", "Officer", "Commander"].entries())
    alias(`${division} ${suffix}`, ranks[i], "cis");
  for (const [i, company] of companies.entries()) {
    alias(`${division} ${company}`, units[i], "cis");
    alias(`${division} ${company} Elite`, units[i], "cis");
  }
}

export const CARD_CATALOG = Object.freeze([...cards.values()]);
export const CARD_BY_ID = new Map(CARD_CATALOG.map(c => [c.id, c]));

const rankOrder = Object.keys(RARITIES);
export function rollRarity(weights, luck = 0, rng = Math.random) {
  const shifted = weights.map((w, i) => w * (i <= 1 ? 1 : 1 + Math.min(0.6, Math.max(0, luck) * 0.065 * (i - 1))));
  const total = shifted.reduce((a, b) => a + b, 0);
  let n = rng() * total;
  for (let i = 0; i < shifted.length; i++) if ((n -= shifted[i]) < 0) return rankOrder[i];
  return "Common";
}

export function drawCard(crateId = "standard", luck = 0, rng = Math.random) {
  const crate = CRATES[crateId] || CRATES.standard;
  const rarity = rollRarity(crate.weights, luck, rng);
  const eligible = CARD_CATALOG.filter(c => c.rarity === rarity && (!crate.pool || c.faction === crate.pool));
  if (!eligible.length) throw new Error(`Missing cards for ${crateId}/${rarity}`);
  // Named characters aren't just mythical collectibles: real lower-rarity
  // characters can appear during normal rolling without changing rarity odds.
  const named = eligible.filter(c => c.named);
  const namedChance = rarity === "Common" ? 0.25 : rarity === "Uncommon" ? 0.30 : 0.35;
  const pool = named.length && rng() < namedChance ? named : eligible;
  return pool[Math.floor(rng() * pool.length)];
}

export function migrateCardId(id) {
  const raw = String(id);
  return CARD_BY_ID.has(raw) ? raw : LEGACY_CARD_ALIASES.get(raw) || raw;
}
export function getCard(id) { return CARD_BY_ID.get(migrateCardId(id)) || null; }
export function listCards({ faction, rarity, term } = {}) {
  const query = String(term || "").toLowerCase().trim();
  return CARD_CATALOG.filter(c => (!faction || c.faction === faction) && (!rarity || c.rarity === rarity) && (!query || c.name.toLowerCase().includes(query)));
}

export const ABILITIES = {
  assault: "Assault: +12% attack in battles",
  fortify: "Fortify: +14% defence when your deck is defending",
  tactics: "Tactics: +7% attack and defence for squadmates",
  command: "Command: +10% squad attack and defence",
  ambush: "Ambush: +17% attack when raiding",
  guardian: "Guardian: +18% defence in all battles",
  economy: "Logistics: +20% income while assigned to production"
};

export const LEAGUES = [
  [0, "Bronze"], [250, "Silver"], [600, "Gold"], [1100, "Platinum"], [1700, "Diamond"], [2500, "Master"], [3600, "Galactic Legend"]
];
export function getLeague(score) { return [...LEAGUES].reverse().find(([n]) => score >= n)?.[1] || "Bronze"; }
export function rankFromLevel(level) {
  return (["Recruit", "Trooper", "Corporal", "Sergeant", "Lieutenant", "Captain", "Major", "Colonel", "Commander", "General", "Grand Marshal"])[Math.min(10, Math.floor(Math.max(0, level - 1) / 5))];
}
