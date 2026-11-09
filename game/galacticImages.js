// Curated Star Wars photographs and official game/series stills. These are
// externally hosted images, not generated art. Non-canon TARC company cards use
// an image of the corresponding real Star Wars division or unit type.
// Keep the direct image URLs here so artwork can be updated without changing
// card IDs or anyone's collection.

const gallery = id => `https://starwarsgallery.netlify.app/assets/people/${id}.jpg`;

const IMAGES = Object.freeze({
  clone: "https://lumiere-a.akamaihd.net/v1/images/1-clone-armor-bio-1_copy_54d62ee1.jpeg?region=0%2C0%2C863%2C486",
  // Group/unit photos are deliberately distinct from their named commanders.
  legion501: "https://lumiere-a.akamaihd.net/v1/images/501st-stormtroopers-main_525e6786.jpeg?region=0%2C0%2C1252%2C704&width=768",
  battalion212: "https://lumiere-a.akamaihd.net/v1/images/open-uri20150608-27674-1sikt4d_aef465fa.jpeg?region=0%2C0%2C1280%2C720",
  corps41: "https://i.pinimg.com/originals/fa/a4/05/faa40583b02983d0ebb00f98b87007df.jpg",
  corps327: "https://i.imgur.com/XNbAWK8.jpeg",
  corps91: "https://vignette4.wikia.nocookie.net/starwars/images/3/3d/BARCspeeder_DB.png/revision/latest?cb=20140907234057",
  battalion104: "https://images.beastsofwar.com/2021/06/83338611-48014867-5f1ffb2dd4506Wolfpack.png-999-999.png",
  corps187: "https://media.moddb.com/images/mods/1/43/42611/cxz.png",
  corps552: "https://vignette3.wikia.nocookie.net/theclonewiki/images/a/a4/DoomUnit-Improved.jpg/revision/latest?cb=20141031221447",
  fleet5: "https://media.moddb.com/images/mods/1/42/41197/20181210150503_1.jpg",
  marines: "https://media.moddb.com/images/downloads/1/271/270097/GalacticMarines.jpg",
  shock: "https://imgix.ranker.com/user_node_img/50127/1002527746/original/1002527746-photo-u3?auto=format&dpr=2&fit=crop&fm=pjpg&q=60&w=500",
  intelligence: "https://lumiere-a.akamaihd.net/v1/images/1-clone-armor-bio-1_copy_54d62ee1.jpeg?region=0%2C0%2C863%2C486",
  kix: "https://lumiere-a.akamaihd.net/v1/images/kix_fac440b1.jpeg?region=75%2C0%2C1429%2C804",
  tup: "https://lumiere-a.akamaihd.net/v1/images/tup_1de373c2.jpeg?region=41%2C0%2C1618%2C809",
  jesse: "https://lumiere-a.akamaihd.net/v1/images/jesse_677c22e2.jpeg?region=0%2C40%2C1463%2C732",
  hardcase: "https://www.jedipedia.net/w/images/5/5d/Hardcase-Enc.jpg",
  waxer: "https://img4.wikia.nocookie.net/__cb20121004230504/starwars/images/a/a5/Waxer_Numa.png",
  boil: "https://lumiere-a.akamaihd.net/v1/images/open-uri20150608-27674-1sikt4d_aef465fa.jpeg?region=0%2C0%2C1280%2C720",
  fives: "https://lumiere-a.akamaihd.net/v1/images/open-uri20150608-27674-1rcmkgo_14e28c21.jpeg?region=0%2C0%2C1280%2C720",
  echo: "https://i.pinimg.com/originals/4b/13/09/4b13090fc301ab364c6076702a281cb4.jpg",
  thorn: "https://lumiere-a.akamaihd.net/v1/images/image_9edb7ee6.jpeg?region=640%2C0%2C1280%2C959",
  rex: "https://lumiere-a.akamaihd.net/v1/images/captain-rex-main_ba65924c.jpeg?region=0%2C43%2C1353%2C761",
  cody: "https://img.lum.dolimg.com/v1/images/databank_clonecommandercody_01_169_f3aa1a91.jpeg?region=0%2C49%2C1560%2C780",
  gree: "https://lumiere-a.akamaihd.net/v1/images/databank_clonecommandergree_01_169_ccbc3da4.jpeg?region=0%2C0%2C1560%2C878",
  fox: "https://lumiere-a.akamaihd.net/v1/images/databank_clonecommanderfox_01_169_703bfe09.jpeg?region=505%2C0%2C876%2C878",
  bly: "https://lumiere-a.akamaihd.net/v1/images/databank_clonecommanderbly_01_169_7452adc7.jpeg?region=0%2C0%2C1560%2C878",
  wolffe: "https://img.lum.dolimg.com/v1/images/ACW_IA_77349_2a55f9c8.jpeg?region=60%2C147%2C1587%2C793",
  neyo: "https://lumiere-a.akamaihd.net/v1/images/databank_clonecommanderneyo_01_169_c4721166.jpeg?region=0%2C0%2C1560%2C878",
  bacara: "https://halloftoys.com/cdn/shop/files/6f3a3f72c4f94184b94488b61775a3e9xl.jpg?v=1745798698&width=1445",
  doom: "https://lumiere-a.akamaihd.net/v1/images/image_947960d1.jpeg?region=0%2C40%2C1200%2C676",
  arc: "https://lumiere-a.akamaihd.net/v1/images/5eb94de87c708e0001dbb570-image_d68992e0.jpeg?region=0%2C0%2C1536%2C864",
  commando: "https://www.nintendo.com/eu/media/images/06_screenshots/games_5/nintendo_switch_download_software_2/nswitchds_starwarsrepubliccommando/NSwitchDS_STARWARSRepublicCommando_01.jpg",
  navy: "https://lumiere-a.akamaihd.net/v1/images/image_692c891c.jpeg",
  senate: "https://lumiere-a.akamaihd.net/v1/images/captain_arygyus_8885ae02.jpeg?region=78%2C0%2C2162%2C1620",
  redGuard: "https://lumiere-a.akamaihd.net/v1/images/databank_emperorsroyalguard_01_169_4a88ce6c.jpeg?region=60%2C70%2C1435%2C808",
  jedi: "https://lumiere-a.akamaihd.net/v1/images/59baf71e315e1300012a9aaa-image_d030b37e.jpeg?region=0%2C0%2C1536%2C864",
  temple: "https://images.wallpapersden.com/image/download/jedi-temple-guard-hd-star-wars-battlefront-2_bmVoZmmUmZqaraWkpJRmZ21lrWZlZWU.jpg",
  b1: "https://lumiere-a.akamaihd.net/v1/images/image_75457486.jpeg",
  b2: "https://lumiere-a.akamaihd.net/v1/images/sbd-bio-2_65b809aa.jpeg?region=0%2C0%2C1280%2C720",
  bx: "https://www.manu-jdr.fr/images/star_wars/Droids/BX%20Commando%20Droid.jpg",
  droideka: "https://vignette.wikia.nocookie.net/starwars/images/7/70/Destroyer_Droid.jpg/revision/latest?cb=20091202142140",
  magnaguard: "https://lumiere-a.akamaihd.net/v1/images/databank_electrostaff_01_169_16d9e207.jpeg?region=0%2C0%2C1560%2C878",
  tactical: "https://lumiere-a.akamaihd.net/v1/images/5eb407e70d4d270001649ed8-image_7dd5423e.jpeg?region=0%2C125%2C1536%2C614",
  vulture: "https://vignette.wikia.nocookie.net/battlefront/images/c/c1/VultureDroid_Main.jpg/revision/latest/scale-to-width-down/2000?cb=20200424053442",
  deathWatch: "https://lumiere-a.akamaihd.net/v1/images/Death-Watch_624f6efa.jpeg?region=1%2C0%2C1228%2C614",
  mandalorian: "https://lumiere-a.akamaihd.net/v1/images/the-mandalorian-main_b842cedf.jpeg?region=0%2C0%2C1280%2C640",
  ahsoka: "https://lumiere-a.akamaihd.net/v1/images/5ea99a6e4e4371000161d27a-image_4255dd6b.jpeg?region=336%2C0%2C864%2C864",
  ventress: "https://images2.minutemediacdn.com/image/upload/c_fill%2Cw_1200%2Car_1%3A1%2Cf_auto%2Cq_auto%2Cg_auto/shape/cover/sport/43e047e24c8ea01a445f2ec8b9717245b6d15296aaf0f6f6ec9242e26414d827.jpg",
  watTambor: "https://lumiere-a.akamaihd.net/v1/images/1-wat-tambor-bio-1_copy_279d4f2b.jpeg?region=154%2C0%2C972%2C547",
  mina: "https://lumiere-a.akamaihd.net/v1/images/databank_minabonteri_01_169_14df3969.jpeg?region=0%2C27%2C1560%2C781",
  kalani: "https://lumiere-a.akamaihd.net/v1/images/general_kalani_4d7e9be0.jpeg?region=0%2C8%2C1591%2C796",
  trench: "https://lumiere-a.akamaihd.net/v1/images/admiral-trench-main_8da89427.jpeg?region=144%2C0%2C967%2C544",
  poggle: "https://lumiere-a.akamaihd.net/v1/images/databank_pogglethelesser_01_169_7095ae3c.jpeg?region=0%2C0%2C1560%2C878",
  lokDurd: "https://lumiere-a.akamaihd.net/v1/images/databank_lokdrud_01_169_7a169264.jpeg?region=0%2C0%2C1560%2C878",
  sanHill: "https://lumiere-a.akamaihd.net/v1/images/san-hill_852a226d.jpeg?region=298%2C0%2C1175%2C661",
  riff: "https://lumiere-a.akamaihd.net/v1/images/databank_rifftamson_01_169_6d4a821f.jpeg?region=268%2C0%2C1170%2C878",
  kuiil: "https://lumiere-a.akamaihd.net/v1/images/kuiil-main-2_45d75406.jpeg?region=0%2C0%2C1280%2C720",
  peli: "https://lumiere-a.akamaihd.net/v1/images/the-mandalorian-ch-18-stills-pelir5d4grogu_754e7844.jpeg",
  greef: "https://lumiere-a.akamaihd.net/v1/images/greef-karga-main_d3deb9fb.jpeg?region=0%2C0%2C1500%2C750",
  boKatan: "https://lumiere-a.akamaihd.net/v1/images/katee-sackhoff-bo-katan-tall_6c4aa004.jpeg",
  preVizsla: "https://lumiere-a.akamaihd.net/v1/images/databank_previzsla_01_169_3e74112a.jpeg?region=0%2C0%2C1560%2C780",
  cadBane: "https://lumiere-a.akamaihd.net/v1/images/who-is-cad-bane-feature_76d4f760.jpeg?region=0%2C0%2C1600%2C900",
  armorer: "https://imgix.bustle.com/uploads/image/2020/4/13/67d28b97-8b45-4538-b82a-54564cdf9176-the-mandalorian-the-armorer-emily-swallow-1576510182.jpg",
  thrawn: "https://lumiere-a.akamaihd.net/v1/images/grand-admiral-thrawn-main_d5ea2b8c.jpeg?region=245%2C0%2C1429%2C804",
  purge: "https://images.hdqwalls.com/wallpapers/star-wars-jedi-fallen-order-2019-game-4k-0y.jpg",
  death: "https://lumiere-a.akamaihd.net/v1/images/death-troopers_f2f9b53f.jpeg?region=0%2C0%2C1560%2C780",
  imperialShock: "https://static.thcdn.com/images/large/original/productimg/960/960/11176407-1564330624356960.jpg",
  jango: "https://img.lum.dolimg.com/v1/images/databank_jangofett_01_169_884cefab.jpeg?region=0%2C49%2C1560%2C780"
});

// Characters with their own source photographs take priority over division art.
const NAMED = Object.freeze({
  "Captain Rex": "rex", "Commander Cody": "cody", "Commander Gree": "gree",
  "Commander Fox": "fox", "Commander Thorn": "thorn", "Commander Bacara": "bacara",
  "Commander Doom": "doom", "Commander Bly": "bly", "Commander Wolffe": "wolffe",
  "ARC Fives": "fives", "ARC Echo": "echo", "ARC Jesse": "jesse",
  "Clone Trooper Tup": "tup", "Clone Trooper Hardcase": "hardcase",
  "Clone Trooper Kix": "kix", "Clone Trooper Waxer": "waxer",
  "Clone Trooper Boil": "boil", "Clone Trooper Jesse": "jesse",
  "Delta Boss": "commando", "Delta Fixer": "commando", "Delta Scorch": "commando",
  "Delta Sev": "commando", "Omega Atin": "commando", "Omega Niner": "commando",
  "Ahsoka Tano": "ahsoka", "Asajj Ventress": "ventress",
  "Wat Tambor": "watTambor", "Mina Bonteri": "mina", "General Kalani": "kalani",
  "Admiral Trench": "trench", "Poggle the Lesser": "poggle", "Lok Durd": "lokDurd",
  "San Hill": "sanHill", "Riff Tamson": "riff",
  "Kuiil": "kuiil", "Peli Motto": "peli", "Greef Karga": "greef",
  "Bo-Katan Kryze": "boKatan",
  "Pre Vizsla": "preVizsla", "Cad Bane": "cadBane",
  "Din Djarin": "mandalorian", "The Armorer": "armorer",
  "Grand Admiral Thrawn": "thrawn", "Purge Trooper": "purge",
  "Death Trooper": "death", "Imperial Shock Trooper": "imperialShock",
  "Jango Fett": "jango"
});

const UNITS = [
  [/\b501st\b/, "legion501"], [/\b212th\b/, "battalion212"], [/\b41st\b/, "corps41"],
  [/\b327th\b/, "corps327"], [/\b91st\b/, "corps91"], [/\b104th\b/, "battalion104"],
  [/\b187th\b/, "corps187"], [/\b552nd\b/, "corps552"], [/Galactic Marines/, "marines"],
  [/5th Fleet Security/, "fleet5"],
  [/Coruscant Guard/, "shock"], [/Senate Guard/, "senate"], [/Red Guard/, "redGuard"],
  [/Republic Intelligence/, "intelligence"],
  [/Republic Commandos/, "commando"], [/Advanced Recon Commandos/, "arc"],
  [/Republic Navy|Starfighter/, "navy"],
  [/Jedi.*Temple Guard/, "temple"], [/Jedi /, "jedi"],
  [/B2 /, "b2"], [/BX Commando/, "bx"],
  [/Droideka/, "droideka"], [/MagnaGuard/, "magnaguard"],
  [/Tactical Droid/, "tactical"], [/Droid Starfighter|Droid Bomber|Droid Tri-fighter/, "vulture"],
  [/B1 |OOM-series/, "b1"], [/Death Watch/, "deathWatch"],
  [/Mandalorian/, "mandalorian"]
];

export function realStarWarsImage(card) {
  if (!card) return IMAGES.clone;
  if (NAMED[card.name]) return IMAGES[NAMED[card.name]];
  // SWAPI IDs resolve to actual character stills, never to our own generated artwork.
  if (Number.isInteger(card.portrait) && card.portrait > 0) return gallery(card.portrait);
  for (const [pattern, key] of UNITS) if (pattern.test(card.name)) return IMAGES[key];
  if (IMAGES[card.imageKey]) return IMAGES[card.imageKey];
  if (card.role === "Jedi") return IMAGES.jedi;
  if (card.faction === "cis") return IMAGES.b1;
  if (card.faction === "independent") return IMAGES.deathWatch;
  return IMAGES.clone;
}
