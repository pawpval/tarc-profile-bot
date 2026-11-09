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
    assert.ok(!ui.cardImage(card).includes("/game-art/"),"Card art must not use generated illustrations");
  }
  for (const crate of Object.keys(catalog.CRATES)) {
    for(let i=0;i<500;i++) assert.ok(catalog.drawCard(crate).id);
  }
});

test("cards use recognizable real Star Wars unit images instead of generic robot drawings",()=>{
  const byName=name=>catalog.CARD_CATALOG.find(c=>c.name===name);
  const picture=name=>ui.cardImage(byName(name));
  assert.match(picture("B1 Droid Army Unit"),/lumiere-a\.akamaihd\.net/);
  assert.notEqual(picture("B1 Droid Army Unit"),picture("BX Commando Droids Unit"));
  assert.notEqual(picture("Droideka Corps Unit"),picture("MagnaGuard Corps Unit"));
  assert.notEqual(picture("501st Legion Trooper"),picture("212th Attack Battalion Trooper"));
  assert.notEqual(picture("Coruscant Guard Trooper"),picture("Senate Guard Trooper"));
});

test("home screen puts the roll loop first and removes unnecessary stats and duplicate quest menu",async()=>{
  const {profile}=await state.snapshot("123");
  const screen=ui.homeScreen(profile,Date.now(),"","Pawpval");
  assert.equal(screen.embeds[0].data.title,"Pawpval's Galactic Command");
  const content=screen.embeds[0].data.description;
  for(const item of ["Credits:","Cards:","Auto-income:","Squad:","Level"])
    assert.ok(content.includes(item));
  for(const unwanted of ["Ranked duels","Command Points","Events:","Income ready:"])
    assert.ok(!content.includes(unwanted));
  assert.equal(screen.components[0].components[0].data.label,"Roll Card");
  assert.deepEqual(screen.components[0].components.map(b=>b.data.label),
    ["Roll Card","My Cards","Missions","Shop"]);
  assert.match(content,/Level [^\n]+\n\n\*\*Credits:/);
  assert.match(content,/\*\*Credits:[^\n]+\n\n\*\*Cards:/);
  assert.match(content,/\*\*Squad:[^\n]+\n\n\*\*Auto-income:/);
  assert.match(screen.embeds[0].data.footer.text,/Roll cards/);
  assert.ok(!screen.components.flatMap(row=>row.components).some(c=>c.data.label==="Claim Income"));
  assert.ok(!screen.components[1].components[0].toJSON().options.some(o=>o.value==="quests"));
  assert.deepEqual(screen.components[1].components[0].toJSON().options.map(o=>o.value),["leaderboard","trade","help"]);

  const shop=ui.shopScreen(profile);
  const prices=shop.components[0].components[0].toJSON().options.map(o=>Number(o.label.match(/[\d,]+(?= Credits)/)[0].replace(/,/g,"")));
  assert.deepEqual(prices,[...prices].sort((a,b)=>a-b));
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
  assert.equal(production.ok,true); // Can use up to five workers without base upgrades.
  assert.equal((await state.assignCard("123",found.uid,"combat")).ok,true);
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
  const before=(await state.snapshot("123")).profile.credits;
  await state.transact(({player})=>{player("123").incomeAt=Date.now()-2*3600000;});
  const paid=(await state.snapshot("123")).profile;
  assert.ok(paid.credits>before,"Production income should arrive automatically on visit");
  assert.equal((await state.claimIncome("123")).automatic,true);
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
  assert.equal(drop.mode,"first-come");
  assert.ok(drop.maxClaims===1||drop.maxClaims===2);
  assert.ok((await state.scheduledGameState()).config.nextDropAt>Date.now()+20*3600000);
  const beforeCards=(await state.snapshot("123")).profile.cards.length;
  assert.equal((await state.enterDrop(drop.id,"123")).ok,true);
  assert.equal((await state.snapshot("123")).profile.cards.length,beforeCards+1,"Claim grants card immediately");
  assert.equal((await state.enterDrop(drop.id,"123")).ok,false);
  assert.equal((await state.enterDrop(drop.id,"456")).ok,drop.maxClaims===2);
  await state.transact(({s})=>{s.config.activeDrop.expiresAt=0;});
  const ended=await state.finishDrop();
  assert.equal(ended.winners.length,drop.maxClaims);
  assert.equal((await state.snapshot("123")).profile.cards.length,beforeCards+1,"Finishing drop must not duplicate prizes");
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
  const global=command.getGlobalGalacticCommands(),guild=command.getGuildGalacticCommands();
  assert.deepEqual(guild.map(c=>c.name),["gameadmin"]);
  assert.ok(global.length>=8);
  assert.ok(!global.some(c=>guild.some(g=>g.name===c.name)),"Global and guild game commands must not overlap");
  assert.ok(global.every(c=>c.integration_types.includes(1)));
  assert.ok(!global.some(c=>c.name==="boss"),"Retired boss must not appear as its own slash command");
  for(const c of commands) assert.ok(c.name.length<=32);
});

function fakeCommand(name,user="789",values={}) {
  const sent=[]; let deferred=false;
  return {
    user:{id:user,bot:false},commandName:name,client:{user:{id:"bot"}},guildId:"1",
    isChatInputCommand:()=>true,isButton:()=>false,isStringSelectMenu:()=>false,
    get deferred(){return deferred;},get replied(){return false;},
    deferReply:async()=>{deferred=true;},
    options:{getUser:k=>values[k]??null,getString:k=>values[k]??null,getInteger:k=>values[k]??null,getBoolean:k=>values[k]??null,getSubcommand:()=>values.subcommand},
    reply:async payload=>{sent.push(payload);return payload},
    editReply:async payload=>{sent.push(payload);return payload},
    get sent(){return sent}
  };
}
function fakeButton(user,customId,values=[]) {
  const sent=[]; let deferred=false;
  return {
    user:{id:user},customId,values,
    get deferred(){return deferred;},get replied(){return false;},
    isChatInputCommand:()=>false,isButton:()=>values.length===0,isStringSelectMenu:()=>values.length>0,
    deferUpdate:async()=>{deferred=true;},
    update:async payload=>{sent.push(payload);return payload},
    editReply:async payload=>{sent.push(payload);return payload},
    followUp:async payload=>{sent.push(payload);return payload},
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
  assert.equal(rollCommand.sent[0].embeds[0].data.title,"NEW CARD!");
  assert.ok(rollCommand.sent[0].embeds[0].data.image.url.startsWith("https://"));
  const cardId=(await state.snapshot("789")).profile.cards.at(-1).uid;
  const outsider=fakeButton("987",`ga:789:upgrade:${cardId}`);
  await command.handleGalacticInteraction(outsider);
  assert.match(outsider.sent[0].content,/someone else's game panel/i);
  const owns=fakeCommand("cards","789",{id:cardId});
  await command.handleGalacticInteraction(owns);
  assert.match(owns.sent[0].embeds[0].data.title,/MY CARD/);
});

test("every core menu validates and displays a clear way home",async()=>{
  const p=(await state.snapshot("789")).profile;
  const views=[
    ui.homeScreen(p),ui.baseScreen(p),ui.upgradesScreen(p),ui.collectionScreen(p),
    ui.inspectScreen(p,p.cards[0].uid),ui.cardOptionsScreen(p,p.cards[0].uid),
    ui.recycleConfirmScreen(p,p.cards[0].uid),ui.shopScreen(p),
    ui.cratePreviewScreen(p,"standard"),ui.cratePreviewScreen(p,null,true),
    ui.missionsScreen(p),ui.questsScreen(p),ui.bossScreen(p,await state.bossSnapshot()),
    ui.leaderboardScreen(await state.leaders(),undefined,p.id),ui.helpScreen(p),ui.tradeScreen(p),ui.tradeOfferScreen(p,"456"),ui.tradeWantedScreen(p,"456",p.cards[0].uid,(await state.snapshot("456")).profile)
  ];
  for(const view of views) {
    assert.ok(view.embeds.length,"Menu needs a readable embed");
    for(const embed of view.embeds) {
      assert.ok((embed.data.description||"").length<=4096,"Embed must respect Discord's description limit");
      assert.doesNotThrow(()=>embed.toJSON());
    }
    const components=view.components.flatMap(r=>r.components);
    assert.ok(components.some(c=>c.data.custom_id===`ga:${p.id}:home`) || view===views[0],"Every sub-screen needs Home");
    for(const component of view.components) assert.doesNotThrow(()=>component.toJSON());
    assert.ok(view.components.length<=5,"Discord supports at most five action rows");
  }
});

test("buttons acknowledge first and route through collection, card management, base and shop",async()=>{
  const id="789";
  const actions=[
    ["cards"], ["base"], ["upgrades"], ["shop"], ["previewcrate",["standard"]],
    ["quests"], ["missions"], ["help"], ["home"]
  ];
  for(const [action,selection] of actions){
    const i=fakeButton(id,`ga:${id}:${action}`,selection||[]);
    assert.equal(await command.handleGalacticInteraction(i),true);
    assert.equal(i.deferred,true,`Action ${action} must immediately defer interaction`);
    assert.ok(i.sent[0]?.embeds?.length,`Action ${action} must show a game screen`);
  }
  const uid=(await state.snapshot(id)).profile.cards[0].uid;
  for(const [action,selection] of [
    [`inspect:${uid}`], [`cardoptions:${uid}`], [`discard:${uid}`],
    [`assign:${uid}`,["reserve"]], [`inspect:${uid}`]
  ]) {
    const i=fakeButton(id,`ga:${id}:${action}`,selection||[]);
    await command.handleGalacticInteraction(i);
    assert.equal(i.deferred,true);
    assert.ok(i.sent[0]?.embeds?.length,`Card action ${action} must not throw`);
  }
  const stale=fakeButton(id,`ga:${id}:old-deleted-button`);
  await command.handleGalacticInteraction(stale);
  assert.match(stale.sent[0].embeds[0].data.title,/Galactic Command/);
});

test("trade menu selects recipient and both stored cards before posting an accept/decline request",async()=>{
  const id="789",target="456",sent=[];
  const own=(await state.snapshot(id)).profile,other=(await state.snapshot(target)).profile;
  const offer=own.cards.find(c=>!own.combat.includes(c.uid)&&!own.production.includes(c.uid));
  const wanted=other.cards.find(c=>!other.combat.includes(c.uid)&&!other.production.includes(c.uid));
  assert.ok(offer && wanted,"Test needs a stored card from each player");
  const starting=fakeButton(id,`ga:${id}:trade`);
  await command.handleGalacticInteraction(starting);
  assert.match(starting.sent[0].embeds[0].data.title,/TRADE CARDS/);
  const chooseUser=fakeButton(id,`ga:${id}:tradetarget`,[target]);
  chooseUser.isStringSelectMenu=()=>false;
  chooseUser.isUserSelectMenu=()=>true;
  await command.handleGalacticInteraction(chooseUser);
  assert.match(chooseUser.sent[0].embeds[0].data.title,/YOUR CARD/);
  const chooseOffer=fakeButton(id,`ga:${id}:tradeoffer:${target}`,[offer.uid]);
  await command.handleGalacticInteraction(chooseOffer);
  assert.match(chooseOffer.sent[0].embeds[0].data.title,/THEIR CARD/);
  const chooseWanted=fakeButton(id,`ga:${id}:tradewant:${target}:${offer.uid}`,[wanted.uid]);
  chooseWanted.channel={send:async p=>{sent.push(p);}};
  await command.handleGalacticInteraction(chooseWanted);
  assert.match(chooseWanted.sent[0].embeds[0].data.title,/TRADE CARDS/);
  assert.equal(sent.length,1);
  assert.deepEqual(sent[0].components[0].components.map(c=>c.data.label),["Accept Trade","Decline"]);
  const idFromButton=sent[0].components[0].components[0].data.custom_id.split(":")[2];
  assert.equal((await state.answerTrade(idFromButton,target,false)).declined,true);
});

test("a published daily card can only be claimed once per eligible user",async()=>{
  await state.configureDropChannel("123456789","admin");
  const drop=await state.startAutomaticDrop("123456789",{force:true});
  const profile=(await state.snapshot("789")).profile;
  const claim=await state.enterDrop(drop.id,"789");
  assert.equal(claim.ok,true);
  assert.equal(claim.claimed,true);
  assert.equal((await state.snapshot("789")).profile.cards.length,profile.cards.length+1);
  assert.equal((await state.enterDrop(drop.id,"789")).ok,false);
  if (drop.maxClaims===2) {
    assert.equal((await state.enterDrop(drop.id,"456")).ok,true);
    assert.equal((await state.enterDrop(drop.id,"123")).ok,false);
  } else assert.equal((await state.enterDrop(drop.id,"456")).ok,false);
  await state.transact(({s})=>{s.config.activeDrop.expiresAt=0;});
  await state.finishDrop();
});

test("recycling requires storage, confirmation and never affects another card",async()=>{
  const id="789",profile=(await state.snapshot(id)).profile;
  const first=profile.cards.find(c=>c.uid===profile.combat[0]);
  assert.equal((await state.recycleCard(id,first.uid)).ok,false,"Deployed cards are protected");
  assert.equal((await state.assignCard(id,first.uid,"reserve")).ok,true);
  const before=(await state.snapshot(id)).profile;
  const recycled=await state.recycleCard(id,first.uid);
  assert.equal(recycled.ok,true);
  const after=(await state.snapshot(id)).profile;
  assert.equal(after.cards.length,before.cards.length-1);
  assert.ok(after.scrap>before.scrap);
  assert.ok(!after.cards.some(c=>c.uid===first.uid));
  assert.equal((await state.recycleCard(id,first.uid)).ok,false,"Card cannot be recycled twice");
});

test("shop selection previews prices without charging and confirm opens the crate",async()=>{
  const id="789",before=(await state.snapshot(id)).profile;
  const preview=fakeButton(id,`ga:${id}:previewcrate`,["standard"]);
  await command.handleGalacticInteraction(preview);
  assert.match(preview.sent[0].embeds[0].data.title,/OPEN CRATE/);
  assert.match(preview.sent[0].embeds[0].data.description,/900 Credits/);
  assert.equal((await state.snapshot(id)).profile.credits,before.credits);
  const confirm=fakeButton(id,`ga:${id}:opencrate:standard`);
  await command.handleGalacticInteraction(confirm);
  assert.match(confirm.sent[0].embeds[0].data.title,/NEW CARDS/);
  const after=(await state.snapshot(id)).profile;
  assert.equal(after.cards.length,before.cards.length+3);
  assert.equal(after.credits,before.credits-900);
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
