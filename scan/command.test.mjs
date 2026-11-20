import {test} from 'node:test';
import assert from 'node:assert/strict';
import {serverScanConfiguration,getServerScanCommand,handleServerScanInteraction} from './serverScanCommand.js';

const guildID='123456789012345678', ownerID='999999999999999999', otherID='888888888888888888';
const roles=new Map([['111',{id:'111',name:'Role',position:1,permissions:{bitfield:1n,toArray:()=>['CreateInstantInvite']},hoist:false,mentionable:false,managed:false,color:0,hexColor:'#000000'}]]);
const channels=new Map([['222',{id:'222',name:'public',type:0,position:1,rawPosition:1,parentId:null,permissionsLocked:null,permissionOverwrites:{cache:new Map()},permissionsFor:()=>({has:()=>true})}]]);
let reads=0;
const guild={id:guildID,name:'TARC',ownerId:ownerID,
 fetch:async()=>{reads++;return guild;},
 roles:{fetch:async()=>{reads++;return roles;}},
 channels:{fetch:async()=>{reads++;return channels;}},
 members:{fetchMe:async()=>{reads++;return {id:'self',permissions:{has:()=>true}}}}
};
function interaction(userId,guildId=guildID){
 const calls=[];let deferred=false;
 return {commandName:'server-scan',guildId,user:{id:userId},guild,attachmentSizeLimit:5*1024*1024,
  isChatInputCommand:()=>true,
  get deferred(){return deferred;},get replied(){return false;},
  deferReply:async payload=>{calls.push(['defer',payload]);deferred=true;},
  reply:async payload=>{calls.push(['reply',payload]);},
  editReply:async payload=>{calls.push(['edit',payload]);},
  followUp:async payload=>{calls.push(['followup',payload]);}, calls};
}
test('command is guild-only and defaults to disabled for non-admins',()=>{
 const cmd=getServerScanCommand();
 assert.equal(cmd.name,'server-scan');
 assert.equal(cmd.default_member_permissions,'0');
 assert.equal(serverScanConfiguration({GUILD_ID:guildID}).guildId,guildID);
});
test('wrong user and wrong guild get only private denials without channel scans',async()=>{
 for(const i of [interaction(otherID),interaction(ownerID,otherID)]){
  const before=reads;
  assert.equal(await handleServerScanInteraction(i, {guildId:guildID,ownerId:ownerID}),true);
  assert.ok(i.calls.every(x=>!x[1].files));
  if(i.guildId===guildID){
    assert.equal(i.calls[0][0],'defer');
    assert.equal(i.calls[0][1].flags,64);
    assert.equal(i.calls[1][0],'edit');
    assert.equal(reads,before+1); // Only guild owner identity fetched.
  }else{
    assert.equal(i.calls.length,1);
    assert.equal(i.calls[0][0],'reply');
    assert.equal(i.calls[0][1].flags,64);
    assert.equal(reads,before);
  }
 }
});
test('actual owner receives private JSON files with roles and channels',async()=>{
 const i=interaction(ownerID);
 assert.equal(await handleServerScanInteraction(i,{guildId:guildID,ownerId:''}),true);
 assert.equal(i.calls[0][0],'defer');assert.equal(i.calls[0][1].flags,64);
 assert.equal(i.calls[1][0],'edit');assert.equal(i.calls[1][1].files.length,1);
 const snapshot=JSON.parse(i.calls[1][1].files[0].attachment.toString());
 assert.equal(snapshot.guild.id,guildID);
 assert.equal(snapshot.roles[0].name,'Role');
 assert.equal(snapshot.channels[0].name,'public');
 assert.equal(snapshot.coverage.messagesFetched,false);
});
