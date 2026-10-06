// TARC Game question bank.
// No AI is used to create questions at runtime. This module builds a fixed,
// deterministic bank from curated facts.

const q = (id, category, difficulty, prompt, correct, wrong, extra = {}) => ({
  id, category, difficulty, prompt, correct, wrong, ...extra
});

const DIRECT = [
  q("sw001","Characters","Easy","Who trained Anakin Skywalker as a Jedi?","Obi-Wan Kenobi",["Mace Windu","Yoda","Qui-Gon Jinn"]),
  q("sw002","Characters","Easy","Who was Anakin Skywalker's Padawan?","Ahsoka Tano",["Barriss Offee","Luminara Unduli","Shaak Ti"]),
  q("sw003","Characters","Easy","Who is the Sith identity of Chancellor Palpatine?","Darth Sidious",["Darth Maul","Darth Tyranus","Darth Plagueis"]),
  q("sw004","Characters","Easy","Who leads the Separatist droid armies as a cyborg general?","General Grievous",["Count Dooku","Admiral Trench","Wat Tambor"]),
  q("sw005","Characters","Easy","Which clone captain served closely with Anakin and Ahsoka?","Captain Rex",["Commander Cody","Commander Wolffe","Commander Bly"]),
  q("sw006","Characters","Medium","What was Count Dooku's Sith name?","Darth Tyranus",["Darth Bane","Darth Nihilus","Darth Sion"]),
  q("sw007","Characters","Medium","Who was Obi-Wan Kenobi's Jedi Master?","Qui-Gon Jinn",["Mace Windu","Yoda","Ki-Adi-Mundi"]),
  q("sw008","Characters","Medium","Who was the genetic template for the Republic clone army?","Jango Fett",["Boba Fett","Cad Bane","Din Djarin"]),
  q("sw009","Characters","Medium","Which Jedi discovered Ahsoka Tano as a child?","Plo Koon",["Kit Fisto","Mace Windu","Saesee Tiin"]),
  q("sw010","Characters","Hard","What was Kanan Jarrus' birth name?","Caleb Dume",["Cal Kestis","Galen Marek","Ezra Bridger"]),
  q("sw011","Characters","Hard","Which bounty hunter species is Duros?","Cad Bane",["Jango Fett","Bossk","Embo"]),
  q("sw012","Characters","Hard","Who commanded the 212th Attack Battalion alongside Obi-Wan Kenobi?","Commander Cody",["Captain Rex","Commander Bly","Commander Bacara"]),
  q("sw013","Characters","Extreme","Which clone was known as CT-5555?","Fives",["Echo","Hevy","Jesse"]),
  q("sw014","Characters","Extreme","Which clone was known as CT-1409?","Echo",["Fives","Hardcase","Dogma"]),
  q("sw015","Characters","Extreme","Who represented Kamino in the Galactic Senate?","Halle Burtoni",["Orn Free Taa","Bail Organa","Mee Deechi"]),

  q("sw016","Clone Wars","Easy","Who fought against the Galactic Republic during the Clone Wars?","Confederacy of Independent Systems",["Rebel Alliance","First Order","New Republic"]),
  q("sw017","Clone Wars","Easy","What soldiers formed the backbone of the Republic military?","Clone troopers",["Stormtroopers","Rebel troopers","Death troopers"]),
  q("sw018","Clone Wars","Easy","Which order turned the clone army against the Jedi?","Order 66",["Order 65","Order 99","Order 501"]),
  q("sw019","Clone Wars","Medium","On which world was the Republic clone army created?","Kamino",["Geonosis","Coruscant","Kashyyyk"]),
  q("sw020","Clone Wars","Medium","Which battle began the Clone Wars?","Battle of Geonosis",["Battle of Coruscant","Battle of Umbara","Battle of Christophsis"]),
  q("sw021","Clone Wars","Medium","Which legion was led by Captain Rex?","501st Legion",["212th Attack Battalion","104th Battalion","327th Star Corps"]),
  q("sw022","Clone Wars","Medium","Which planet became known for a brutal campaign involving General Pong Krell?","Umbara",["Ryloth","Felucia","Naboo"]),
  q("sw023","Clone Wars","Hard","Which clone unit was also called the Bad Batch?","Clone Force 99",["Domino Squad","Delta Squad","Wolfpack"]),
  q("sw024","Clone Wars","Hard","Which clone survived the Citadel mission and was later used by the Separatists on Skako Minor?","Echo",["Fives","Jesse","Hardcase"]),
  q("sw025","Clone Wars","Hard","Which Mandalorian group opposed Duchess Satine's pacifist government?","Death Watch",["Nite Owls","Protectors","Journeyman Protectors"]),
  q("sw026","Clone Wars","Extreme","What clone bar on Coruscant was popular with Republic soldiers?","79's",["Dex's Diner","Outlander Club","The Lodge"]),
  q("sw027","Clone Wars","Extreme","Which species are the native inhabitants of Umbara?","Umbarans",["Twi'leks","Zabraks","Pantorans"]),
  q("sw028","Clone Wars","Extreme","Which Separatist admiral was a Harch?","Admiral Trench",["Admiral Coburn","Admiral Yularen","Admiral Tarkin"]),

  q("sw029","Republic","Easy","What was the Republic capital during the Clone Wars?","Coruscant",["Naboo","Alderaan","Kamino"]),
  q("sw030","Republic","Easy","Which order served the Republic as peacekeepers before the Empire?","Jedi Order",["Sith Order","Knights of Ren","Inquisitorius"]),
  q("sw031","Republic","Medium","Which vehicle is a Republic walker with six legs?","AT-TE",["AT-AT","AT-ST","AAT"]),
  q("sw032","Republic","Medium","Which fighter was commonly used by clone pilots late in the Clone Wars?","ARC-170",["TIE Fighter","X-wing","TIE Interceptor"]),
  q("sw033","Republic","Medium","What is the common nickname for the LAAT/i?","Republic gunship",["Vulture droid","Jedi interceptor","Droid gunship"]),
  q("sw034","Republic","Hard","Which clone commander served with Jedi General Plo Koon?","Commander Wolffe",["Commander Cody","Commander Bly","Commander Gree"]),
  q("sw035","Republic","Hard","Which clone commander served with Aayla Secura?","Commander Bly",["Commander Gree","Commander Cody","Commander Fox"]),
  q("sw036","Republic","Hard","Which clone commander served with Ki-Adi-Mundi and the Galactic Marines?","Commander Bacara",["Commander Neyo","Commander Fox","Commander Thorn"]),
  q("sw037","Republic","Extreme","Which Republic walker is a smaller open-topped bipedal scout vehicle?","AT-RT",["AT-TE","AT-AP","AT-OT"]),

  q("sw038","CIS","Easy","Who was the political leader of the Separatists?","Count Dooku",["General Grievous","Nute Gunray","Wat Tambor"]),
  q("sw039","CIS","Easy","What is the standard Separatist infantry droid?","B1 battle droid",["B2 super battle droid","Droideka","MagnaGuard"]),
  q("sw040","CIS","Medium","Which droid is known for rolling into battle with a personal shield?","Droideka",["B1 battle droid","Tactical droid","Buzz droid"]),
  q("sw041","CIS","Medium","What does CIS stand for?","Confederacy of Independent Systems",["Coalition of Interstellar Systems","Confederation of Imperial States","Council of Independent Sectors"]),
  q("sw042","CIS","Medium","Which heavier infantry droid is commonly called a Super Battle Droid?","B2",["B1","BX","IG-100"]),
  q("sw043","CIS","Hard","What elite droid model served as General Grievous' bodyguards?","IG-100 MagnaGuard",["BX commando droid","T-series tactical droid","B2 super battle droid"]),
  q("sw044","CIS","Hard","Which droid type specialised in infiltration and commando operations?","BX commando droid",["B1 battle droid","Dwarf spider droid","Buzz droid"]),
  q("sw045","CIS","Hard","Which species was Nute Gunray?","Neimoidian",["Muun","Geonosian","Skakoan"]),
  q("sw046","CIS","Extreme","What does STAP stand for?","Single Trooper Aerial Platform",["Single Tactical Assault Platform","Separatist Trooper Attack Platform","Scout Transport Aerial Platform"]),

  q("sw047","Jedi and Sith","Easy","What weapon is most associated with Jedi and Sith?","Lightsaber",["Vibroblade","Bowcaster","Electrostaff"]),
  q("sw048","Jedi and Sith","Easy","What energy field do Jedi and Sith use?","The Force",["The Nexus","The Current","The Ether"]),
  q("sw049","Jedi and Sith","Medium","Which lightsaber form is associated with Count Dooku?","Makashi",["Soresu","Ataru","Shien"]),
  q("sw050","Jedi and Sith","Medium","Which lightsaber form is strongly associated with Obi-Wan Kenobi?","Soresu",["Makashi","Juyo","Shii-Cho"]),
  q("sw051","Jedi and Sith","Medium","Which Jedi Master famously used a purple lightsaber?","Mace Windu",["Kit Fisto","Plo Koon","Ki-Adi-Mundi"]),
  q("sw052","Jedi and Sith","Hard","What is lightsaber Form II called?","Makashi",["Soresu","Ataru","Niman"]),
  q("sw053","Jedi and Sith","Hard","What is lightsaber Form III called?","Soresu",["Makashi","Juyo","Shien"]),
  q("sw054","Jedi and Sith","Hard","What is lightsaber Form IV called?","Ataru",["Niman","Soresu","Shii-Cho"]),
  q("sw055","Jedi and Sith","Extreme","What is lightsaber Form VI called?","Niman",["Juyo","Makashi","Ataru"]),
  q("sw056","Jedi and Sith","Extreme","What is lightsaber Form VII commonly called?","Juyo",["Shien","Soresu","Niman"]),

  q("sw057","Planets","Easy","What is the Wookiee homeworld?","Kashyyyk",["Endor","Naboo","Dathomir"]),
  q("sw058","Planets","Easy","On which planet did Anakin Skywalker grow up?","Tatooine",["Coruscant","Naboo","Alderaan"]),
  q("sw059","Planets","Easy","Which planet is covered by a city on a planetary scale?","Coruscant",["Hoth","Dagobah","Mustafar"]),
  q("sw060","Planets","Medium","Which world is home to the Gungans?","Naboo",["Ryloth","Mon Cala","Lothal"]),
  q("sw061","Planets","Medium","Which world is famous for its cloning facilities?","Kamino",["Geonosis","Mandalore","Corellia"]),
  q("sw062","Planets","Medium","Which world was the site of the Jedi Temple and Galactic Senate?","Coruscant",["Alderaan","Naboo","Jedha"]),
  q("sw063","Planets","Hard","Which world is known as the Shadow World?","Umbara",["Dathomir","Malachor","Korriban"]),
  q("sw064","Planets","Hard","Which world is the Twi'lek homeworld?","Ryloth",["Pantora","Rodia","Saleucami"]),
  q("sw065","Planets","Hard","Which world is the homeworld of the Zabrak species and the Nightbrothers?","Dathomir",["Iridonia","Mandalore","Onderon"]),
  q("sw066","Planets","Extreme","Which planet was represented in the Senate by Mee Deechi?","Umbara",["Ryloth","Rodia","Malastare"]),

  q("sw067","Vehicles","Easy","What is Han Solo's famous ship?","Millennium Falcon",["Ghost","Razor Crest","Outrider"]),
  q("sw068","Vehicles","Easy","Which starfighter is strongly associated with the Rebel Alliance?","X-wing",["TIE Fighter","Vulture droid","N-1 Starfighter"]),
  q("sw069","Vehicles","Medium","Which Separatist vehicle is a repulsorlift tank used by battle droids?","AAT",["AT-TE","AT-RT","TX-130"]),
  q("sw070","Vehicles","Medium","Which light CIS vehicle is ridden by a single battle droid?","STAP",["MTT","Hailfire droid","AAT"]),
  q("sw071","Vehicles","Medium","Which vehicle transported large numbers of battle droids on Naboo?","MTT",["AT-TE","LAAT","Juggernaut"]),
  q("sw072","Vehicles","Hard","Which Republic starfighter has three S-foils and a crew of clone pilots?","ARC-170",["V-19 Torrent","Eta-2 Actis","Z-95 Headhunter"]),
  q("sw073","Vehicles","Hard","Which Republic fighter was used by Jedi and is also called the Jedi interceptor?","Eta-2 Actis",["ARC-170","V-wing","V-19 Torrent"]),
  q("sw074","Vehicles","Extreme","Which vehicle is listed among Umbaran technology?","Umbaran Hover Tank",["AAT","AT-TE","HAVw A6 Juggernaut"]),

  q("sw075","Original Trilogy","Easy","Who destroyed the first Death Star?","Luke Skywalker",["Han Solo","Leia Organa","Lando Calrissian"]),
  q("sw076","Original Trilogy","Easy","Who is Luke Skywalker's father?","Darth Vader",["Obi-Wan Kenobi","Emperor Palpatine","Owen Lars"]),
  q("sw077","Original Trilogy","Medium","Which moon is home to the Ewoks?","Endor",["Yavin 4","Jedha","Kef Bir"]),
  q("sw078","Original Trilogy","Medium","Who commanded the Death Star in A New Hope?","Grand Moff Tarkin",["Admiral Piett","Director Krennic","Grand Admiral Thrawn"]),
  q("sw079","Original Trilogy","Hard","Who led the attack on the second Death Star's reactor?","Lando Calrissian",["Wedge Antilles","Luke Skywalker","Admiral Ackbar"]),

  q("sw080","Prequels","Easy","Who fought Obi-Wan Kenobi on Mustafar?","Anakin Skywalker",["Count Dooku","General Grievous","Darth Maul"]),
  q("sw081","Prequels","Easy","Who was Queen of Naboo in The Phantom Menace?","Padme Amidala",["Leia Organa","Satine Kryze","Mon Mothma"]),
  q("sw082","Prequels","Medium","Who killed Qui-Gon Jinn?","Darth Maul",["Count Dooku","Darth Sidious","General Grievous"]),
  q("sw083","Prequels","Medium","Who killed Count Dooku?","Anakin Skywalker",["Obi-Wan Kenobi","Yoda","Mace Windu"]),
  q("sw084","Prequels","Hard","Which Jedi killed Jango Fett on Geonosis?","Mace Windu",["Obi-Wan Kenobi","Anakin Skywalker","Kit Fisto"]),

  q("sw085","Rebels and Empire","Easy","Who is Princess Leia's twin brother?","Luke Skywalker",["Han Solo","Ben Solo","Anakin Skywalker"]),
  q("sw086","Rebels and Empire","Medium","What was the codename of the Rebel base on Hoth?","Echo Base",["Phoenix Base","Yavin Base","Delta Base"]),
  q("sw087","Rebels and Empire","Medium","Who commanded the Ghost crew?","Hera Syndulla",["Sabine Wren","Ezra Bridger","Kanan Jarrus"]),
  q("sw088","Rebels and Empire","Hard","Which Imperial Grand Admiral pursued the Ghost crew?","Thrawn",["Tarkin","Piett","Krennic"]),

  q("sw089","Mandalorians","Easy","What metal is strongly associated with Mandalorian armour?","Beskar",["Durasteel","Cortosis","Phrik"]),
  q("sw090","Mandalorians","Medium","Who wielded the Darksaber before losing it to Moff Gideon?","Bo-Katan Kryze",["Ahsoka Tano","Sabine Wren","Din Djarin"]),
  q("sw091","Mandalorians","Hard","Who created the Darksaber?","Tarre Vizsla",["Pre Vizsla","Paz Vizsla","Tor Vizsla"]),

  q("sw092","Droids","Easy","Which astromech accompanies Anakin and later Luke?","R2-D2",["C-3PO","BB-8","Chopper"]),
  q("sw093","Droids","Easy","Which protocol droid is fluent in over six million forms of communication?","C-3PO",["R2-D2","K-2SO","IG-11"]),
  q("sw094","Droids","Medium","What is Chopper's model designation?","C1-10P",["R2-D2","BB-8","K2-B4"]),
  q("sw095","Droids","Hard","Which droid type served as General Grievous' elite guards?","IG-100 MagnaGuard",["IG-88 assassin droid","KX security droid","T-series tactical droid"]),

  q("sw096","Weapons","Easy","What weapon is traditionally used by Wookiees?","Bowcaster",["Cycler rifle","Electrostaff","Vibroblade"]),
  q("sw097","Weapons","Medium","What crystal powers a traditional lightsaber?","Kyber crystal",["Coaxium","Beskar","Spice"]),
  q("sw098","Weapons","Hard","Which weapon is commonly carried by MagnaGuards?","Electrostaff",["Bowcaster","DC-15A","EE-3"]),

  q("sw099","Mixed","Easy","Which faction used clone troopers during the Clone Wars?","Galactic Republic",["Galactic Empire","First Order","Rebel Alliance"]),
  q("sw100","Mixed","Medium","Which faction used B1 and B2 battle droids as mass infantry?","Confederacy of Independent Systems",["Galactic Republic","Rebel Alliance","Resistance"])
];

const FACT_SETS = {
  "Clone Units": [
    ["501st Legion","Captain Rex"],["212th Attack Battalion","Commander Cody"],["104th Battalion","Commander Wolffe"],
    ["327th Star Corps","Commander Bly"],["Galactic Marines","Commander Bacara"]
  ],
  "Homeworlds": [
    ["Wookiees","Kashyyyk"],["Gungans","Naboo"],["Twi'leks","Ryloth"],["Geonosians","Geonosis"],
    ["Kaminoans","Kamino"],["Umbarans","Umbara"],["Mon Calamari","Mon Cala"],["Mandalorians","Mandalore"]
  ],
  "Characters": [
    ["Ahsoka Tano","Anakin Skywalker"],["Anakin Skywalker","Obi-Wan Kenobi"],["Obi-Wan Kenobi","Qui-Gon Jinn"],
    ["Count Dooku","Yoda"],["Luke Skywalker","Obi-Wan Kenobi"],["Ezra Bridger","Kanan Jarrus"]
  ],
  "Vehicles": [
    ["STAP","Confederacy of Independent Systems"],["AAT","Confederacy of Independent Systems"],
    ["AT-TE","Galactic Republic"],["ARC-170","Galactic Republic"],["Republic Attack Gunship","Galactic Republic"],
    ["TIE Fighter","Galactic Empire"],["X-wing","Rebel Alliance"]
  ]
};

function seededWrong(pool, correct, offset) {
  const choices = pool.filter(x => x !== correct);
  const out = [];
  for (let i = 0; i < choices.length && out.length < 3; i++) {
    const v = choices[(i + offset) % choices.length];
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

function generatedQuestions() {
  const out = [];
  let n = 101;
  const difficulties = ["Easy","Medium","Hard","Extreme"];

  const forwardTemplates = {
    "Homeworlds": [
      a=>`What is the homeworld of ${a}?`, a=>`${a} originate from which world?`,
      a=>`Which planet is most closely associated with ${a} as their homeworld?`, a=>`Choose the home planet of ${a}.`,
      a=>`Where do ${a} come from?`, a=>`Which world would you identify as the native home of ${a}?`,
      a=>`In Star Wars, ${a} are native to which planet?`, a=>`Which planet belongs with ${a}?`,
      a=>`Match ${a} to their homeworld.`, a=>`Which world is the correct homeworld for ${a}?`
    ],
    "Clone Units": [
      a=>`Who commanded ${a}?`, a=>`Which clone commander is associated with ${a}?`,
      a=>`Match ${a} with its commander.`, a=>`Who is the commander most closely linked to ${a}?`,
      a=>`${a} is associated with which clone officer?`, a=>`Which officer belongs with ${a}?`,
      a=>`Choose the commander connected to ${a}.`, a=>`Which clone leader served with ${a}?`,
      a=>`Who is the best match for ${a}?`, a=>`Identify the commander tied to ${a}.`
    ],
    "Characters": [
      a=>`Who trained ${a}?`, a=>`Who served as ${a}'s Jedi teacher?`,
      a=>`Which character mentored ${a}?`, a=>`Match ${a} with their teacher.`,
      a=>`${a} received training from whom?`, a=>`Who is most closely associated with training ${a}?`,
      a=>`Which mentor belongs with ${a}?`, a=>`Choose the teacher connected to ${a}.`,
      a=>`Who instructed ${a} in this pairing?`, a=>`Identify ${a}'s mentor from these choices.`
    ],
    "Vehicles": [
      a=>`Which faction is ${a} most associated with?`, a=>`${a} was primarily used by which faction?`,
      a=>`Match ${a} to its faction.`, a=>`Who fielded ${a}?`,
      a=>`Which side commonly operated ${a}?`, a=>`Choose the faction connected to ${a}.`,
      a=>`Which military used ${a}?`, a=>`${a} belongs most closely with which force?`,
      a=>`Who is the best faction match for ${a}?`, a=>`Identify the faction associated with ${a}.`
    ]
  };
  const reverseTemplates = {
    "Homeworlds": [
      b=>`Which people are native to ${b}?`, b=>`${b} is the homeworld of which group?`,
      b=>`Who comes from ${b}?`, b=>`Match ${b} with its native people.`,
      b=>`Which species or people are most associated with ${b}?`, b=>`Choose the group whose homeworld is ${b}.`,
      b=>`Which group belongs with the planet ${b}?`, b=>`Who would call ${b} their homeworld?`,
      b=>`Identify the native group connected to ${b}.`, b=>`Which answer correctly matches ${b} as a homeworld?`
    ],
    "Clone Units": [
      b=>`Which clone unit was associated with ${b}?`, b=>`${b} commanded which clone formation?`,
      b=>`Match ${b} to the correct clone unit.`, b=>`Which unit belongs with commander ${b}?`,
      b=>`${b} is most closely linked to which formation?`, b=>`Choose the clone unit connected to ${b}.`,
      b=>`Which formation did ${b} lead?`, b=>`What unit is the best match for ${b}?`,
      b=>`Identify the clone force associated with ${b}.`, b=>`Which unit should be paired with ${b}?`
    ],
    "Characters": [
      b=>`Who was trained by ${b}?`, b=>`${b} served as mentor to which character?`,
      b=>`Match ${b} with the student in this pairing.`, b=>`Which character received training from ${b}?`,
      b=>`Who is the student most closely connected to ${b} here?`, b=>`Choose the character mentored by ${b}.`,
      b=>`Which learner belongs with ${b}?`, b=>`Who did ${b} instruct in this pairing?`,
      b=>`Identify the student connected to ${b}.`, b=>`Which answer correctly pairs a student with ${b}?`
    ],
    "Vehicles": [
      b=>`Which vehicle is associated with ${b}?`, b=>`${b} commonly fielded which vehicle?`,
      b=>`Match ${b} to a vehicle it used.`, b=>`Which vehicle belongs with ${b}?`,
      b=>`Choose the vehicle connected to ${b}.`, b=>`Which machine is most closely associated with ${b}?`,
      b=>`What vehicle is the best match for ${b}?`, b=>`Identify a vehicle used by ${b}.`,
      b=>`Which vehicle should be paired with ${b}?`, b=>`Which answer is a vehicle associated with ${b}?`
    ]
  };

  // Build a large static bank, but tag variants with the same factKey. The quiz
  // selector treats those variants as one fact for recent-history purposes, so a
  // player does not get the same fact reworded again a few questions later.
  for (const [setName, rows] of Object.entries(FACT_SETS)) {
    const left = rows.map(r => r[0]);
    const right = rows.map(r => r[1]);
    for (let round = 0; round < 40; round++) {
      for (let i = 0; i < rows.length; i++) {
        const [a,b] = rows[i];
        const reverse = round % 2 === 1;
        const templates = reverse ? reverseTemplates[setName] : forwardTemplates[setName];
        const templateIndex = Math.floor(round / 2) % templates.length;
        const prompt = templates[templateIndex](reverse ? b : a);
        const correct = reverse ? a : b;
        const pool = reverse ? left : right;
        const wrong = seededWrong(pool, correct, round + i);
        if (wrong.length < 3) continue;
        out.push(q(
          `sw${String(n++).padStart(4,"0")}`,
          setName,
          difficulties[(round + i) % difficulties.length],
          prompt,
          correct,
          wrong,
          { variant: round, factKey: `${setName}:${a}:${b}` }
        ));
      }
    }
  }
  return out;
}
const generated = generatedQuestions();
const combined = [...DIRECT, ...generated];

export const STAR_WARS_QUESTIONS = combined.slice(0, 1000).map((item, index) => ({
  ...item,
  id: `sw${String(index + 1).padStart(3,"0")}`,
  sourceType: item.factKey ? "generated-variant" : "curated"
}));

export const TARC_QUESTIONS = [
  q("tarc001","TARC General","Easy","Which three broad sides are represented in TARC's current game?","Republic, CIS and Civilians",["Republic, Empire and Rebels","CIS, Empire and First Order","Republic, Rebels and First Order"]),
  q("tarc002","TARC Locations","Easy","Which of these is a major current TARC map area?","Wastelands",["Death Star","Cloud City","Exegol"]),
  q("tarc003","TARC Locations","Easy","Which major area contains the prison?","Border",["Wastelands","CIS Base","City Bank"]),
  q("tarc004","TARC Locations","Medium","Which location can be found in the Wastelands?","CIS Base",["Jedi Archives","Death Star Hangar","Echo Base"]),
  q("tarc005","TARC Divisions","Easy","Which of these is a Republic division in TARC?","Coruscant Guard",["Death Watch","Droid Army","Magna Guards"]),
  q("tarc006","TARC Divisions","Easy","Which of these is CIS aligned in TARC?","Droid Army",["501st Legion","Senate Guard","Republic Intelligence"]),
  q("tarc007","TARC Divisions","Medium","Which division has Healing Zone and Teamwork abilities?","212th Attack Battalion",["501st Legion","Republic Intelligence","Red Guard"]),
  q("tarc008","TARC Divisions","Medium","Which division has RI Cloak and RI Scan?","Republic Intelligence",["Republic Commandos","Coruscant Guard","Senate Guard"]),
  q("tarc009","TARC Divisions","Medium","Which division has Surge and Recon?","501st Legion",["212th Attack Battalion","Red Guard","Republic Intelligence"]),
  q("tarc010","TARC Divisions","Hard","Which division has RC Utility and RC Launcher?","Republic Commandos",["Advanced Recon Commandos","Coruscant Guard","Galactic Marines"]),
  q("tarc011","TARC Divisions","Hard","Which team has Beskar Armor configured as an ability?","Death Watch",["Droid Army","501st Legion","Senate Guard"]),
  q("tarc012","TARC Divisions","Hard","Which character class has Contract and Tactics abilities?","Cad Bane",["Jango Fett","General Grievous","Count Dooku"]),
  q("tarc013","TARC Events","Easy","Which event asks players to find the Chancellor's missing keys?","Chancellor's Keys",["CIS Invasion","VIP Protection","Bomb Threat"]),
  q("tarc014","TARC Events","Easy","Which event involves defusing a bomb?","Bomb Threat",["VIP Protection","Chancellor's Keys","CIS Invasion"]),
  q("tarc015","TARC Events","Medium","Which event can send hostile CIS NPCs into different map areas?","CIS Invasion",["VIP Protection","Chancellor's Keys","Bomb Threat"]),
  q("tarc016","TARC Events","Medium","How many keys are needed during Chancellor's Keys?","2",["1","3","5"]),
  q("tarc017","TARC Events","Hard","Which three areas can be selected for a CIS Invasion?","Border, City and Wastelands",["Border, Prison and Senate","City, Bank and Apartments","Wastelands, Jedi Temple and Senate"]),
  q("tarc018","TARC NPCs","Easy","Which hostile droid can appear during a CIS Invasion?","B1 Battle Droid",["Stormtrooper","Rebel Trooper","First Order Trooper"]),
  q("tarc019","TARC NPCs","Medium","Which stronger hostile droid can appear alongside B1s?","B2 Super Battle Droid",["BB-8","C-3PO","Medical Droid"]),
  q("tarc020","TARC Vehicles","Easy","Which two choices are offered by the vehicle terminal?","Speeder and Hovercraft",["AT-TE and LAAT","AAT and STAP","X-wing and ARC-170"]),
  q("tarc021","TARC Progression","Easy","What is the first Republic XP rank?","Cadet",["Trooper","Sergeant","Warrant Officer"]),
  q("tarc022","TARC Progression","Medium","Which Republic XP rank comes after Cadet?","Trooper",["Elite Recruit","Sergeant","Warrant Officer"]),
  q("tarc023","TARC Progression","Medium","Which Droid Army progression rank comes after Battle Droid?","Agent Droid",["Command Droid","Super Battle Droid","Tactical Colonel"]),
  q("tarc024","TARC Progression","Hard","Which Droid Army progression rank follows Agent Droid?","Droideka",["B2 Super Droid","BX Commando","Battle Droid"]),
  q("tarc025","TARC Progression","Hard","Which Droid Army progression rank is after Droideka?","Magna Guard",["Agent Droid","Battle Droid","Command Droid"]),
  q("tarc026","TARC Systems","Easy","Does TARC have daily and weekly quests?","Yes",["No","Daily only","Weekly only"]),
  q("tarc027","TARC Systems","Medium","Which activity can put a player onto the bounty board?","Getting kills",["Opening settings","Changing team once","Using a vehicle"]),
  q("tarc028","TARC Systems","Medium","How long is the current daily reward cycle?","31 days",["7 days","14 days","60 days"]),
  q("tarc029","TARC Systems","Hard","What can players create as a separate gameplay system from Republic/CIS teams?","Player factions",["Jedi councils","Private servers","Custom planets"]),
  q("tarc030","TARC Seasonal","Easy","What seasonal currency is used by the Halloween event?","Candy",["Beskar","Tokens","Kyber"]),
  q("tarc031","TARC Seasonal","Medium","How much Candy does a normal Halloween pickup give?","5",["1","10","25"]),
  q("tarc032","TARC Locations","Medium","Which city location exists in the current map?","Bank",["Mos Eisley Cantina","Jabba's Palace","Echo Base"]),
  q("tarc033","TARC Locations","Medium","Which underground route exists in the Wastelands area?","Sewers",["Death Star trench","Crystal caves","Hyperlane"]),
  q("tarc034","TARC Divisions","Medium","Which division has CG Heal and CG Scan?","Coruscant Guard",["Red Guard","Senate Guard","Galactic Marines"]),
  q("tarc035","TARC Divisions","Medium","Which group has Locator, Guard and Detain abilities?","Red Guard",["501st Legion","ARC","212th"]),
  q("tarc036","TARC Divisions","Medium","Which group has Locator, Force Protection and Detain?","Senate Guard",["Coruscant Guard","Republic Intelligence","41st Elite Corps"]),
  q("tarc037","TARC Divisions","Hard","Which 41st abilities are available in the current configuration?","Shield and Recon",["Surge and Recon","Healing Zone and Teamwork","Locator and Detain"]),
  q("tarc038","TARC Divisions","Hard","Which ARC abilities are configured?","ARC Boost, ARC Overwatch and Alert",["Shield, Recon and Heal","Cloak, Scan and Detain","Surge, Teamwork and Guard"]),
  q("tarc039","TARC Divisions","Hard","Which special Republic Commando tool is tied to RC Utility?","Vibro Sword",["Riot Shield","Red Guard Pike","Bowcaster"]),
  q("tarc040","TARC General","Easy","Which faction is the 501st Legion aligned with in TARC?","Republic",["CIS","Civilian","Neutral"]),
  q("tarc041","TARC General","Easy","Which faction is Death Watch aligned with in TARC?","CIS",["Republic","Civilian","Neutral"]),
  q("tarc042","TARC General","Easy","Which faction is Republic Intelligence aligned with?","Republic",["CIS","Civilian","Neutral"]),
  q("tarc043","TARC General","Medium","Which of these is a current TARC playable class/team?","Heavy Class",["Imperial Officer","Rebel Commando","First Order Pilot"]),
  q("tarc044","TARC General","Medium","Which of these is a current CIS-side team?","BX Commandos",["327th Star Corps","Republic Navy","Temple Guard"]),
  q("tarc045","TARC General","Hard","Which of these is a current CIS-side special character team?","Jango Fett",["Boba Fett","Darth Vader","Grand Moff Tarkin"])
];


// Extra curated Star Wars pool for longer grind sessions and broader category coverage.
const EXTRA_STAR_WARS_QUESTIONS = [
  q("swx001","Characters","Easy","Who is Luke Skywalker's sister?","Leia Organa",["Padmé Amidala","Rey","Ahsoka Tano"]),
  q("swx002","Characters","Easy","Who piloted the Millennium Falcon with Chewbacca?","Han Solo",["Lando Calrissian","Luke Skywalker","Cassian Andor"]),
  q("swx003","Characters","Medium","Who was Darth Vader before he became a Sith Lord?","Anakin Skywalker",["Ben Solo","Galen Marek","Quinlan Vos"]),
  q("swx004","Characters","Hard","Which Jedi Master was a member of the same species as Yoda?","Yaddle",["Shaak Ti","Adi Gallia","Depa Billaba"]),
  q("swx005","Clone Wars","Easy","Who was the Supreme Chancellor during most of the Clone Wars?","Palpatine",["Bail Organa","Mas Amedda","Mon Mothma"]),
  q("swx006","Clone Wars","Medium","Which clone commander served under Plo Koon?","Wolffe",["Cody","Bly","Gree"]),
  q("swx007","Clone Wars","Hard","Which planet was the site of a campaign involving waxer, boil and the Twi'leks?","Ryloth",["Umbara","Saleucami","Mygeeto"]),
  q("swx008","Clone Wars","Extreme","Which clone commander served Ki-Adi-Mundi and the Galactic Marines?","Bacara",["Neyo","Gree","Appo"]),
  q("swx009","Republic","Easy","What colour were many Phase I clone troopers before rank markings were added?","White",["Black","Green","Red"]),
  q("swx010","Republic","Medium","Which gunship transported clone troops into battle?","LAAT",["AAT","MTT","TIE Bomber"]),
  q("swx011","Republic","Hard","Which clone marshal commander led the 327th Star Corps?","Bly",["Cody","Neyo","Fox"]),
  q("swx012","Republic","Extreme","Which Republic cruiser class became a major precursor to Imperial Star Destroyers?","Venator-class",["Lucrehulk-class","Providence-class","Recusant-class"]),
  q("swx013","CIS","Easy","What type of soldier made up most Separatist ground forces?","Battle droids",["Clone troopers","Stormtroopers","Rebel soldiers"]),
  q("swx014","CIS","Medium","Which tank was commonly used by the Trade Federation and CIS?","AAT",["AT-TE","AT-RT","Juggernaut"]),
  q("swx015","CIS","Hard","Who was the leader of the Techno Union during the Clone Wars?","Wat Tambor",["Nute Gunray","Poggle the Lesser","San Hill"]),
  q("swx016","CIS","Extreme","Which Separatist capital ship class was associated with General Grievous' Invisible Hand?","Providence-class",["Venator-class","Arquitens-class","Acclamator-class"]),
  q("swx017","Jedi and Sith","Easy","What weapon is most associated with Jedi and Sith?","Lightsaber",["Vibroblade","Electrostaff","Bowcaster"]),
  q("swx018","Jedi and Sith","Medium","Which lightsaber form is associated with Count Dooku?","Makashi",["Soresu","Ataru","Shien"]),
  q("swx019","Jedi and Sith","Hard","Which form is also known as the Way of the Mynock?","Shien / Djem So",["Makashi","Ataru","Niman"]),
  q("swx020","Jedi and Sith","Extreme","Which lightsaber form is commonly called the Way of the Rancor?","Juyo",["Soresu","Shii-Cho","Makashi"]),
  q("swx021","Planets","Easy","What desert planet was Anakin Skywalker raised on?","Tatooine",["Jakku","Geonosis","Jedha"]),
  q("swx022","Planets","Medium","What planet was home to the Wookiees?","Kashyyyk",["Endor","Felucia","Dathomir"]),
  q("swx023","Planets","Hard","Which planet was the homeworld of the Twi'leks?","Ryloth",["Rodia","Pantora","Bothawui"]),
  q("swx024","Planets","Extreme","Which world was home to the Banking Clan and the Battle of Scipio?","Scipio",["Muunilinst","Cato Neimoidia","Mygeeto"]),
  q("swx025","Vehicles","Easy","Which Imperial walker has four large legs?","AT-AT",["AT-ST","AT-RT","AT-TE"]),
  q("swx026","Vehicles","Medium","Which small Republic walker was often used for reconnaissance?","AT-RT",["AT-AT","AAT","MTT"]),
  q("swx027","Vehicles","Hard","Which massive wheeled Republic vehicle was also called a Juggernaut?","HAVw A6 Juggernaut",["AT-TE","TX-130","LAAT"]),
  q("swx028","Weapons","Easy","What weapon is Chewbacca famous for using?","Bowcaster",["DC-15A","E-11","DL-44"]),
  q("swx029","Weapons","Medium","Which blaster pistol was widely associated with clone officers?","DC-17",["E-11","DLT-19","A280"]),
  q("swx030","Weapons","Hard","Which long blaster rifle was used by clone sharpshooters?","DC-15x",["DC-17","E-5","WESTAR-35"]),
  q("swx031","Droids","Easy","What phrase are B1 battle droids famous for saying?","Roger roger",["For the Republic","This is the way","I have spoken"]),
  q("swx032","Droids","Medium","Which droid model rolls into a ball and deploys a shield?","Droideka",["B1","B2","IG-100"]),
  q("swx033","Droids","Hard","What droid guards were commonly used by General Grievous?","IG-100 MagnaGuards",["BX commandos","B2 super battle droids","T-series tactical droids"]),
  q("swx034","Mandalorians","Easy","What planet is associated with Mandalorian culture?","Mandalore",["Naboo","Corellia","Kamino"]),
  q("swx035","Mandalorians","Medium","Who led Death Watch for much of the Clone Wars?","Pre Vizsla",["Bo-Katan Kryze","Satine Kryze","Gar Saxon"]),
  q("swx036","Mandalorians","Hard","What ancient weapon became a symbol of Mandalorian leadership?","Darksaber",["Darkstaff","Beskar Spear","Electrostaff"]),
  q("swx037","Prequels","Easy","Who won the Boonta Eve podrace in The Phantom Menace?","Anakin Skywalker",["Sebulba","Watto","Qui-Gon Jinn"]),
  q("swx038","Prequels","Medium","Who killed Qui-Gon Jinn?","Darth Maul",["Count Dooku","Darth Sidious","General Grievous"]),
  q("swx039","Prequels","Hard","Which Jedi killed Jango Fett on Geonosis?","Mace Windu",["Obi-Wan Kenobi","Anakin Skywalker","Kit Fisto"]),
  q("swx040","Original Trilogy","Easy","Which battle station destroyed Alderaan?","Death Star",["Starkiller Base","Executor","Malevolence"]),
  q("swx041","Original Trilogy","Medium","Who froze Han Solo in carbonite?","The Empire on Cloud City",["Jabba the Hutt on Tatooine","The Rebels on Hoth","The Empire on Endor"]),
  q("swx042","Original Trilogy","Hard","Which Rebel admiral famously warned that the Endor battle was a trap?","Admiral Ackbar",["Admiral Raddus","General Dodonna","Mon Mothma"]),
  q("swx043","Rebels and Empire","Easy","What fighter is iconic to the Galactic Empire?","TIE Fighter",["X-wing","ARC-170","N-1 Starfighter"]),
  q("swx044","Rebels and Empire","Medium","Which Rebel ship type destroyed the first Death Star?","X-wing",["A-wing","B-wing","Y-wing"]),
  q("swx045","Rebels and Empire","Hard","Who was Grand Admiral of the Imperial Seventh Fleet?","Thrawn",["Tarkin","Piett","Krennic"])
];

export const ALL_QUESTIONS = [...STAR_WARS_QUESTIONS, ...EXTRA_STAR_WARS_QUESTIONS, ...TARC_QUESTIONS];

export function getQuestionPool({ scope = "mixed", difficulty = "Random", category = null } = {}) {
  let pool = ALL_QUESTIONS;
  if (scope === "starwars") pool = [...STAR_WARS_QUESTIONS, ...EXTRA_STAR_WARS_QUESTIONS];
  if (scope === "tarc") pool = TARC_QUESTIONS;
  if (category && category !== "__all__") pool = pool.filter(item => item.category === category);
  if (difficulty && difficulty !== "Random") {
    pool = pool.filter(item => item.difficulty === difficulty);
  }
  return pool;
}


export function getQuestionCategories(scope = "mixed") {
  const pool = scope === "starwars" ? [...STAR_WARS_QUESTIONS, ...EXTRA_STAR_WARS_QUESTIONS] : scope === "tarc" ? TARC_QUESTIONS : ALL_QUESTIONS;
  return [...new Set(pool.map(item => item.category))].sort();
}
