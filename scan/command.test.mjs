import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getServerScanCommand, handleServerScanInteraction, serverScanConfiguration } from './serverScanCommand.js';

const mainId = '123456789012345678';
const ownerId = '999999999999999999';
const divisionId = '777777777777777777';
const outsiderId = '888888888888888888';
const unrelatedOwnerId = '666666666666666666';
let scans = 0;

function mockGuild(id, owner, label) {
  const role = { id:'111111111111111111', name:'Role', position:1, permissions:{ bitfield:1n, toArray:()=>[] },
    hoist:false, mentionable:false, managed:false, color:0, hexColor:'#000000' };
  const channel = { id:'222222222222222222', name:'channel', type:0, position:1,
    rawPosition:1, parentId:null, permissionsLocked:null,
    permissionOverwrites:{cache:new Map()}, permissionsFor:()=>({has:()=>true}) };
  const guild = { id, name:label, ownerId:owner,
    fetch:async()=>guild,
    roles:{fetch:async()=>{scans++;return new Map([[role.id,role]]);}},
    channels:{fetch:async()=>{scans++;return new Map([[channel.id,channel]]);}},
    members:{fetchMe:async()=>{scans++;return {id:'bot',permissions:{has:()=>true}};}} };
  return guild;
}
const main = mockGuild(mainId, ownerId, 'TARC');
const division = mockGuild(divisionId, outsiderId, 'Division');
const owned = mockGuild('555555555555555555', ownerId, 'Owned');
const unrelated = mockGuild('444444444444444444', unrelatedOwnerId, 'Unrelated');
const all = new Map([main,division,owned,unrelated].map(g=>[g.id,g]));

function interaction(userId, target = main, hasAdmin = false) {
  const calls=[];let deferred=false;
  return {
    commandName:'server-scan',guildId:target?.id ?? null,
    guild:target,user:{id:userId},
    memberPermissions:{has:()=>hasAdmin},
    client:{guilds:{fetch:async id=>all.get(String(id))}},
    attachmentSizeLimit:5*1024*1024,
    isChatInputCommand:()=>true,
    get deferred(){return deferred;},get replied(){return false;},
    deferReply:async payload=>{calls.push(['defer',payload]);deferred=true;},
    reply:async payload=>{calls.push(['reply',payload]);},
    editReply:async payload=>{calls.push(['edit',payload]);},
    followUp:async payload=>{calls.push(['followup',payload]);},
    calls
  };
}
const defaults = { mainGuildId:mainId, ownerId:'' };
const exported = i => i.calls.find(([type,p])=>type==='edit'&&p.files?.length)?.[1];

test('scanner is one global guild-install command, not a DM command',()=>{
  const cmd=getServerScanCommand();
  assert.equal(cmd.name,'server-scan');
  assert.equal(cmd.default_member_permissions,'0');
  assert.deepEqual(cmd.integration_types,[0]);
  assert.deepEqual(cmd.contexts,[0]);
  assert.equal(serverScanConfiguration({GUILD_IDS:mainId+','+divisionId}).mainGuildId,mainId);
});

test('a trusted user can scan the main guild or other guilds they own',async()=>{
  for (const guild of [main,owned]) {
    const i=interaction(ownerId,guild);
    assert.equal(await handleServerScanInteraction(i,defaults),true);
    assert.equal(i.calls[0][0],'defer');
    assert.equal(i.calls[0][1].flags,64);
    const payload=exported(i);
    assert.ok(payload?.files?.length);
    const parsed=JSON.parse(payload.files[0].attachment.toString());
    assert.equal(parsed.guild.id,guild.id);
    assert.equal(parsed.coverage.messagesFetched,false);
  }
});

test('a trusted TARC owner with Administrator permission can scan a division guild',async()=>{
  const i=interaction(ownerId,division,true);
  await handleServerScanInteraction(i,defaults);
  assert.ok(exported(i)?.files.length);
  assert.match(exported(i).files[0].name,/^discord-server-scan-/);
});

test('third-party server owners and unprivileged trusted users cannot export channel metadata',async()=>{
  for(const i of [
    interaction(unrelatedOwnerId,unrelated,true),
    interaction(outsiderId,division,true),
    interaction(ownerId,division,false)
  ]){
    const before=scans;
    await handleServerScanInteraction(i,defaults);
    assert.equal(exported(i),undefined);
    assert.equal(scans,before,'No role/channel reads on denied scans');
    assert.match(i.calls.at(-1)[1].content,/Only the authorized TARC owner/);
  }
});

test('explicit owner pin controls identity and cannot be bypassed by target guild ownership',async()=>{
  const bad=interaction(ownerId,owned);
  await handleServerScanInteraction(bad,{mainGuildId:mainId,ownerId:outsiderId});
  assert.equal(exported(bad),undefined);
  const ok=interaction(outsiderId,division);
  await handleServerScanInteraction(ok,{mainGuildId:mainId,ownerId:outsiderId});
  assert.ok(exported(ok)?.files?.length);
});

test('DMs and missing trusted-owner configuration fail closed',async()=>{
  const dm=interaction(ownerId,null);
  await handleServerScanInteraction(dm,defaults);
  assert.equal(dm.calls[0][0],'reply');
  assert.equal(dm.calls[0][1].flags,64);
  const i=interaction(ownerId,owned);
  await handleServerScanInteraction(i,{mainGuildId:'',ownerId:''});
  assert.equal(exported(i),undefined);
});
