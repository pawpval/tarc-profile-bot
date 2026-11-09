import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const temp = await mkdtemp(join(tmpdir(),"galactic-test-"));
process.env.TARC_DATA_DIR = temp;
process.env.RAILWAY_PUBLIC_DOMAIN = "test.example.com";
after(async()=>{await rm(temp,{recursive:true,force:true});});
// This old save must not be touched or imported by the V2 game.
await writeFile(join(temp,"tarc-game-state.json"),JSON.stringify({players:{"123":{credits:999999,level:99}}}));

const catalog = await import("./galacticCatalog.js");
const state = await import("./galacticState.js");
const ui = await import("./galacticUI.js");
const command = await import("./galacticCommands.js");

test("large catalog has distinct IDs, matching images and six rarities",()=>{
  assert.ok(catalog.CARD_CATALOG.length >= 350);
  assert.equal(new Set(catalog.CARD_CATALOG.map(c=>c.id)).size,catalog.CARD_CATALOG.length);
  for (const card of catalog.CARD_CATALOG) {
    assert.ok(catalog.FACTIONS[card.faction]);
    assert.ok(catalog.RARITIES[card.rarity]);
    assert.ok(card.imageKey);
    assert.ok(ui.cardImage(card).startsWith("https://"));
  }
  for (const crate of Object.keys(catalog.CRATES)) {
    for(let i=0;i<500;i++) assert.ok(catalog.drawCard(crate).id);
  }
});

test("new-game faction grants real five-card starter roster without importing old progress",async()=>{
  const before=(await state.snapshot("123")).profile;
  assert.equal(before.credits,1600);
  assert.equal(before.cards.length,0);
  const joined=await state.chooseFaction("123","republic");
  assert.equal(joined.ok,true);
  assert.equal(joined.profile.cards.length,5);
  assert.equal(joined.profile.combat.length,3);
  assert.equal(joined.profile.production.length,2);
  assert.ok(state.hourlyIncome(joined.profile)>0);
  assert.equal((await state.chooseFaction("123","cis")).ok,false);
});

test("roll, crates, collection cards and assignments cost Credits atomically",async()=>{
  const before=(await state.snapshot("123")).profile;
  const single=await state.roll("123");
  assert.equal(single.ok,true);
  assert.equal(single.found.length,1);
  assert.equal(single.spent,300);
  assert.equal(single.credits,before.credits-300);
  const found=single.found[0];
  const production=await state.assignCard("123",found.uid,"production");
  assert.equal(production.ok,false); // Default starting production slots are full.
  assert.equal((await state.assignCard("123",found.uid,"combat")).ok,false);
  assert.equal((await state.assignCard("123",found.uid,"reserve")).ok,true);
  await state.transact(({player})=>{player("123").credits=20000;player("123").scrap=200;});
  const pack=await state.roll("123","republic");
  assert.equal(pack.ok,true);
  assert.equal(pack.found.length,3);
  assert.equal(pack.spent,1250);
  assert.equal((await state.upgradeCard("123",found.uid)).ok,true);
  assert.equal((await state.upgradeBase("123")).ok,true);
  assert.equal((await state.upgradeBase("123")).ok,true);
  assert.equal((await state.assignCard("123",found.uid,"combat")).ok,true);
  const current=(await state.snapshot("123")).profile;
  assert.ok(current.combat.includes(found.uid));
});

test("income, salvage, dailies and missions work with cooldowns",async()=>{
  await state.transact(({player})=>{player("123").incomeAt=Date.now()-2*3600000;});
  assert.ok((await state.claimIncome("123")).credits>0);
  assert.equal((await state.claimIncome("123")).ok,false);
  assert.equal((await state.salvage("123")).ok,true);
  assert.equal((await state.salvage("123")).ok,false);
  assert.equal((await state.daily("123")).ok,true);
  assert.equal((await state.daily("123")).ok,false);
  assert.equal((await state.runMission("123","border")).ok,true);
  assert.equal((await state.runMission("123","border")).ok,false);
});

test("duels require consent; raids have novice protection, per-player cooldown and no stolen assets",async()=>{
  assert.equal((await state.chooseFaction("456","cis")).ok,true);
  assert.equal((await state.raid("123","456")).ok,false);
  const original=(await state.snapshot("456")).profile;
  await state.transact(({player})=>{player("456").createdAt=Date.now()-2*86400000;});
  const challenged=await state.proposeDuel("123","456");
  assert.equal(challenged.ok,true);
  assert.equal((await state.answerDuel(challenged.id,"123",true)).ok,false);
  assert.equal((await state.answerDuel(challenged.id,"456",true)).ok,true);
  const attacked=await state.raid("123","456");
  assert.equal(attacked.ok,true);
  assert.equal((await state.raid("123","456")).ok,false);
  const after=(await state.snapshot("456")).profile;
  assert.equal(after.cards.length,original.cards.length);
  assert.ok(after.credits>=original.credits);
});

test("trading requires explicit recipient approval and reserve cards",async()=>{
  const defender=(await state.snapshot("456")).profile;
  await state.assignCard("456",defender.combat[0],"reserve");
  const a=(await state.snapshot("123")).profile;
  const b=(await state.snapshot("456")).profile;
  const offer=a.cards.find(c=>!a.combat.includes(c.uid)&&!a.production.includes(c.uid));
  const wanted=b.cards.find(c=>!b.combat.includes(c.uid)&&!b.production.includes(c.uid));
  assert.equal((await state.proposeTrade("123","456",offer.uid,wanted.uid)).ok,true);
  const trade=await state.proposeTrade("123","456",offer.uid,wanted.uid);
  assert.equal(trade.ok,false); // offer spam cooldown
  const active=await state.transact(({s})=>Object.values(s.trades)[0]);
  assert.equal((await state.answerTrade(active.id,"123",true)).ok,false);
  assert.equal((await state.answerTrade(active.id,"456",true)).ok,true);
  assert.ok((await state.snapshot("456")).profile.cards.some(c=>c.uid===offer.uid));
});

test("guilds, drops, quests and weekly prizes are persisted",async()=>{
  await state.transact(({player})=>{player("123").credits=50000;});
  const guild=await state.createGuild("123","Outpost One");
  assert.equal(guild.ok,true);
  assert.equal((await state.joinGuild("456",guild.guild.code)).ok,true);
  assert.equal((await state.donateGuild("456",100)).ok,true);
  assert.equal((await state.claimQuest("123","daily","nonexistent")).ok,false);
  const q=(await state.snapshot("123")).profile;
  assert.equal(state.activeQuests(q,"daily").length,3);
  await state.configureDropChannel("123456789","admin");
  await state.transact(({s})=>{s.config.nextDropAt=0;});
  const drop=await state.startAutomaticDrop("123456789");
  assert.ok(drop?.cardId);
  assert.equal((await state.enterDrop(drop.id,"123")).ok,true);
  assert.equal((await state.enterDrop(drop.id,"123")).ok,false);
  assert.equal((await state.enterDrop(drop.id,"456")).ok,true);
  await state.transact(({s})=>{s.config.activeDrop.expiresAt=0;});
  const ended=await state.finishDrop();
  assert.equal(ended.winners.length,2);
  const forced=await state.startAutomaticDrop("123456789",{force:true,actor:"admin"});
  assert.ok(forced?.cardId,"Ownership should bypass the waiting timer for one immediate drop");
  assert.equal(await state.startAutomaticDrop("123456789",{force:true,actor:"admin"}),null,"Cannot overwrite an active drop");
  await state.transact(({s})=>{s.config.activeDrop.expiresAt=0;});
  await state.finishDrop();
  await state.transact(({player})=>{player("123").weekScore=1700;player("456").weekScore=500;});
  const next=Date.now()+8*86400000;
  const result=await state.transact(({s})=>({winners:s.lastWeekWinners,week:s.week}),next);
  assert.equal(result.winners[0].userId,"123");
  assert.equal(result.winners[0].position,1);
  assert.equal((await state.snapshot("123")).profile.weekScore,0);
  assert.ok((await state.snapshot("123")).profile.rewards.length>=1);
  assert.equal(await state.markWeeklyAnnouncement(result.winners[0].week),true);
  assert.equal((await state.scheduledGameState()).config.announcedWeek,result.winners[0].week);
});

test("slash command trees validate; public game commands route separately from legacy quizzes",()=>{
  const commands=command.getGalacticCommands();
  assert.equal(new Set(commands.map(c=>c.name)).size,commands.length);
  assert.ok(commands.find(c=>c.name==="gameadmin").options.length>=4);
  for(const c of commands) assert.ok(c.name.length<=32);
});

function fakeCommand(name,user="789",values={}) {
  const sent=[];
  return {
    user:{id:user,bot:false},commandName:name,client:{user:{id:"bot"}},guildId:"1",
    isChatInputCommand:()=>true,isButton:()=>false,isStringSelectMenu:()=>false,
    options:{getUser:k=>values[k]??null,getString:k=>values[k]??null,getInteger:k=>values[k]??null,getBoolean:k=>values[k]??null,getSubcommand:()=>values.subcommand},
    reply:async payload=>{sent.push(payload);return payload},
    get sent(){return sent}
  };
}
function fakeButton(user,customId,values=[]) {
  const sent=[];
  return {
    user:{id:user},customId,values,
    isChatInputCommand:()=>false,isButton:()=>values.length===0,isStringSelectMenu:()=>values.length>0,
    update:async payload=>{sent.push(payload);return payload},
    reply:async payload=>{sent.push(payload);return payload},
    get sent(){return sent}
  };
}

test("Discord onboarding UI, roll action and ownership protections work end to end",async()=>{
  const opening=fakeCommand("game");
  assert.equal(await command.handleGalacticInteraction(opening),true);
  assert.equal(opening.sent[0].embeds[0].data.title,"GALACTIC COMMAND");
  assert.equal(opening.sent[0].components[0].components[0].data.custom_id,"ga:789:faction");
  const join=fakeButton("789","ga:789:faction",["republic"]);
  assert.equal(await command.handleGalacticInteraction(join),true);
  assert.equal((await state.snapshot("789")).profile.cards.length,5);
  assert.ok(join.sent[0].components.length<=5);
  const rollCommand=fakeCommand("roll");
  assert.equal(await command.handleGalacticInteraction(rollCommand),true);
  assert.equal(rollCommand.sent[0].embeds[0].data.title,"NEW CARD ACQUIRED");
  assert.ok(rollCommand.sent[0].embeds[0].data.image.url.startsWith("https://"));
  const cardId=(await state.snapshot("789")).profile.cards.at(-1).uid;
  const outsider=fakeButton("987",`ga:789:upgrade:${cardId}`);
  await command.handleGalacticInteraction(outsider);
  assert.match(outsider.sent[0].content,/someone else's game panel/i);
  const owns=fakeCommand("cards","789",{id:cardId});
  await command.handleGalacticInteraction(owns);
  assert.match(owns.sent[0].embeds[0].data.title,/CARD DETAILS/);
});

test("boss fights, daily shop and ranked duels are available",async()=>{
  const boss=await state.bossSnapshot();
  assert.equal(boss.maxHp,30000);
  const hit=await state.attackBoss("789");
  assert.equal(hit.ok,true);
  assert.ok(hit.damage>=25);
  assert.equal((await state.attackBoss("789")).ok,false);
  const offer=state.dailyDeal();
  assert.ok(offer.price<offer.crate.price);
  await state.transact(({player})=>{player("789").credits=50000;});
  assert.equal((await state.buyDailyDeal("789")).ok,true);
  assert.equal((await state.buyDailyDeal("789")).ok,false);
  const challenged=await state.proposeDuel("789","456",true);
  assert.equal(challenged.ok,true);
  // The challenged user consents; rating only changes after the duel.
  const ratingBefore=(await state.snapshot("789")).profile.rankedRating;
  await state.transact(({player})=>{player("456").lastDuelAt=0;});
  const outcome=await state.answerDuel(challenged.id,"456",true);
  assert.equal(outcome.ok,true);
  const ratingAfter=(await state.snapshot("789")).profile.rankedRating;
  assert.notEqual(ratingBefore,ratingAfter);
});

test("V2 state survives a module reload while preserving the old V1 file",async()=>{
  const again=await import("./galacticState.js?reloaded");
  const player=(await again.snapshot("789")).profile;
  assert.equal(player.faction,"republic");
  assert.ok(player.cards.length>6);
  const legacy=JSON.parse(await (await import("node:fs/promises")).readFile(join(temp,"tarc-game-state.json"),"utf8"));
  assert.equal(legacy.players["123"].credits,999999);
});
