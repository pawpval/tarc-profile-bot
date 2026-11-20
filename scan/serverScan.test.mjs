import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServerSnapshot, isAuthorizedScan, redactText, splitSnapshot } from './serverScanCore.js';

const bits = value => ({ bitfield: BigInt(value), toArray: () => ['ViewChannel'] });
const ow = (id, type, allow, deny) => ({ id, type, allow:bits(allow), deny:bits(deny) });
const perms = array => ({ values: () => array.values() });
const parent = {
  id:'123456789012345678', name:'STAFF', type:4, typeName:'GuildCategory', rawPosition:1, position:1,
  permissionOverwrites:{cache:perms([ow('111111111111111111',0,1024,2048)])},
  permissionsFor:()=>({has:()=>true})
};
const child = {
  id:'234567890123456789', name:'staff-chat', type:0, typeName:'GuildText', rawPosition:2, position:2,
  parentId: parent.id, permissionsLocked:true, topic:'Read docs. secret=sampletoken123 https://discord.gg/abcd',
  nsfw:false, rateLimitPerUser:5,
  permissionOverwrites:{cache:perms([ow('111111111111111111',0,1024,2048),ow('222222222222222222',1,0,8192)])},
  permissionsFor:()=>({has:()=>false})
};
const separate = {...child,id:'345678901234567890',name:'independent',permissionsLocked:false,
  permissionOverwrites:{cache:perms([ow('111111111111111111',0,0,8)])},
  permissionsFor:()=>({has:()=>true})};
const forum = {...child,id:'456789012345678901',name:'forum',type:15,typeName:'GuildForum',permissionsLocked:false,
  availableTags:[{id:'567890123456789012',name:'Recruitment',moderated:false,emojiId:null,emojiName:'🎓'}],
  defaultReactionEmoji:{emojiId:null,emojiName:'✅'},defaultSortOrder:1,defaultForumLayout:2,
  defaultAutoArchiveDuration:1440,defaultThreadRateLimitPerUser:7};
const voice = {...child,id:'567890123456789012',name:'voice',type:2,typeName:'GuildVoice',
  bitrate:96000,userLimit:15,rtcRegion:null,videoQualityMode:2};
const guild = {id:'123456789012345678',name:'TARC',ownerId:'999999999999999999',description:'Join https://discord.gg/secret',
  features:['COMMUNITY'],systemChannelFlags:bits(1),verificationLevel:2};
const role = {id:'111111111111111111',name:'Leadership',position:3,rawPosition:3,color:123,hexColor:'#00007b',
  permissions:bits('9007199254740995'),hoist:true,mentionable:false,managed:false};

function make(){return buildServerSnapshot({guild,roles:perms([role]),channels:perms([parent,child,separate,forum,voice]),botMember:{id:'bot'}});}
test('strict TARC guild and explicit user IDs, no role bypass',()=>{
 const config={guildId:'123456789012345678',ownerId:'999999999999999999'};
 assert.equal(isAuthorizedScan({guildId:config.guildId,userId:config.ownerId},config),true);
 assert.equal(isAuthorizedScan({guildId:config.guildId,userId:'888888888888888888'},config),false);
 assert.equal(isAuthorizedScan({guildId:'777777777777777777',userId:config.ownerId},config),false);
 assert.equal(isAuthorizedScan({guildId:config.guildId,userId:config.ownerId},{...config,ownerId:''}),false);
});
test('captures role bits, member overwrites and category synchronization',()=>{
 const s=make();
 assert.equal(s.roles[0].permissions.bitfield,'9007199254740995');
 assert.equal(s.categories[0].permissionOverwrites[0].allow.bitfield,'1024');
 const ch=s.channels.find(c=>c.id===child.id);
 assert.equal(ch.categoryPermissions.synchronization,'synced');
 assert.equal(ch.permissionOverwrites[1].targetType,'member');
 assert.equal(ch.permissionOverwrites[1].deny.bitfield,'8192');
 assert.equal(s.channels.find(c=>c.id===separate.id).categoryPermissions.synchronization,'independent');
 assert.equal(ch.botCanView,false);
 assert.ok(s.omissions.some(x=>x.channelId===ch.id));
 assert.equal(s.coverage.messagesFetched,false);
 assert.equal(s.coverage.memberListsFetched,false);
});
test('forum and voice settings are captured and secrets removed',()=>{
 const s=make();
 const f=s.channels.find(c=>c.id===forum.id),v=s.channels.find(c=>c.id===voice.id);
 assert.equal(f.forum.availableTags[0].name,'Recruitment');
 assert.equal(f.forum.defaultThreadRateLimitPerUser,7);
 assert.equal(v.voice.bitrate,96000);
 assert.equal(v.voice.userLimit,15);
 assert.doesNotMatch(s.guild.description,/discord\.gg/);
 assert.doesNotMatch(s.channels.find(c=>c.id===child.id).topic,/sampletoken123/);
 assert.match(redactText('https://discord.com/api/webhooks/123/abc'),/REDACTED_WEBHOOK/);
});
test('large snapshot splits into parseable, bounded, complete JSON parts',()=>{
 const s=make();s.channels=Array.from({length:45},(_,i)=>({...s.channels[i%s.channels.length],id:String(i+100),name:'x'.repeat(70)}));
 const buffers=splitSnapshot(s,6000);
 assert.ok(buffers.length>1);
 const decoded=buffers.map(b=>JSON.parse(b.toString()));
 assert.deepEqual(decoded.map(d=>d.part.index),decoded.map((_,i)=>i+1));
 assert.equal(decoded.reduce((n,p)=>n+p.channels.length,0),s.channels.length);
 assert.ok(buffers.every(b=>b.length<=6000));
});
