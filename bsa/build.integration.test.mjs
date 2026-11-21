import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {validateBsaTemplate} from "./builderCore.js";
import {buildBsaGuild,auditBsaGuild,inspectBsaPlan} from "./builderEngine.js";
import {planBsaFormat,applyBsaFormatChanges} from "./channelFormatCore.js";

const raw=JSON.parse(await readFile(new URL("./BSA_Server_Template_V4.json",import.meta.url),"utf8"));
function correctedTemplate() {
  return structuredClone(raw);
}
function makeGuild() {
  let counter=1n;
  const id=()=>(300000000000000000n+counter++).toString();
  const roles=new Map(),channels=new Map();
  let roleWrites=0,channelWrites=0;
  const guild={id:"777777777777777777",features:["COMMUNITY"],roles:{cache:roles},channels:{}};
  const toHex=color=>"#"+Number(color||0).toString(16).padStart(6,"0").toUpperCase();
  roles.set(guild.id,{id:guild.id,name:"@everyone",position:0,color:0,permissions:{has:()=>false}});
  guild.members={fetchMe:async()=>({
    permissions:{has:()=>true},
    permissionsIn:()=>({has:()=>true}),
    roles:{highest:{position:1000}}
  })};
  guild.roles.fetch=async()=>roles;
  guild.roles.create=async opts=>{
    roleWrites++;
    assert.equal(opts.permissions,0n);
    const role={id:id(),name:opts.name,color:parseInt(opts.color.slice(1),16),
      position:1,managed:false,
      permissions:{has:()=>false}};
    roles.set(role.id,role);return role;
  };
  guild.roles.setPositions=async positions=>{
    for(const p of positions)roles.get(String(p.role)).position=p.position;
  };
  function overwrites(spec) {
    return new Map((spec||[]).map(row=>[String(row.id),{
      id:String(row.id),allow:{bitfield:row.allow.reduce((n,v)=>n|BigInt(v),0n)},
      deny:{bitfield:row.deny.reduce((n,v)=>n|BigInt(v),0n)}
    }]));
  }
  guild.channels.fetch=async channelId=>channelId ? (channels.get(String(channelId))??null) : channels;
  guild.channels.create=async opts=>{
    channelWrites++;
    const chan={id:id(),name:opts.name,type:opts.type,
      parentId:opts.parent||null,
      rawPosition:opts.position??0,position:opts.position??0,
      permissionOverwrites:{cache:overwrites(opts.permissionOverwrites)},
      setName:async function(name){this.name=name;return this;}
    };
    channels.set(chan.id,chan);return chan;
  };
  return {guild,counts:()=>({roleWrites,channelWrites}),roles,channels};
}
test("simulated confirmed BSA build creates complete layout and can rerun without duplicates",async()=>{
  const t=correctedTemplate();
  assert.equal(validateBsaTemplate(t).ok,true);
  const state=makeGuild();
  const first=await buildBsaGuild(state.guild,t);
  assert.equal(first.createdRoles.length,t.roles.length);
  assert.equal(first.createdCategories.length,t.categories.length);
  assert.equal(first.createdChannels.length,100);
  assert.deepEqual(first.errors,[]);
  const originalCounts=state.counts();
  assert.equal(originalCounts.roleWrites,t.roles.length);
  assert.equal(originalCounts.channelWrites,116);
  const audit=await auditBsaGuild(state.guild,t);
  assert.deepEqual(audit.issues,[]);
  // Format the existing guild exactly as the owner requested, then confirm
  // the BSA builder still recognises all renamed channels (no duplicates).
  const member=await state.guild.members.fetchMe();
  const renamePlan=planBsaFormat(t,state.channels,member);
  assert.equal(renamePlan.changes.length,100);
  assert.equal(renamePlan.conflicts.length,0);
  const formatResult=await applyBsaFormatChanges(state.guild,renamePlan.changes,member);
  assert.equal(formatResult.renamed.length,100);
  assert.equal(formatResult.failed.length,0);
  const auditAfter=await auditBsaGuild(state.guild,t);
  assert.deepEqual(auditAfter.issues,[]);
  const roles=await state.guild.roles.fetch();
  const channels=await state.guild.channels.fetch();
  const replan=inspectBsaPlan(state.guild,t,[...roles.values()],[...channels.values()]);
  assert.equal(replan.createChannels.length,0);
  assert.deepEqual(replan.conflicts,[]);
  const second=await buildBsaGuild(state.guild,t);
  assert.equal(second.createdRoles.length,0);
  assert.equal(second.createdCategories.length,0);
  assert.equal(second.createdChannels.length,0);
  assert.deepEqual(state.counts(),originalCounts);
});
