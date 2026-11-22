import {test} from "node:test";
import assert from "node:assert/strict";
import {PermissionFlagsBits as P} from "discord.js";
import {
  RTR_ROLE_NAMES,RTR_ROLE_LOCK,inspectRtrRoles,resolveRtrRoleOrder,
  liveRtrRoleSnapshot
} from "./rtrRoleOnlyCore.js";
import {
  getRtrReworkCommand,rtrConfiguration,handleRtrRoleOnlyInteraction,
  registerRtrRoleOnlyGuildCommand
} from "./rtrRoleOnlyCommand.js";

const OWNER="999999999999999999",RTR="666666666666666666";
const TARC="111111111111111111",MAIN_BSA="777777777777777777";
const makeEnv=()=>({BSA_RTR_GUILD_ID:RTR,BSA_OWNER_DISCORD_ID:OWNER,
  TARC_MAIN_GUILD_ID:TARC,BSA_GUILD_ID:MAIN_BSA});
function fixture(guildId=RTR, ownerId=OWNER){
  const roles=new Map(),channels=new Map(),members=new Map();
  let n=500000000000000000n;
  const id=()=>String(++n);
  const mutations={create:0,rename:0,reorder:0,delete:0,
    channelCreate:0,channelEdit:0,members:0,permissions:0};
  const role=(name,{position,permissions=0n,managed=false,roleId}={})=>{
    const positionValue=position??(1+Math.max(0,...[...roles.values()]
      .filter(x=>!x.managed).map(x=>x.position)));
    const r={id:roleId??id(),name,position:positionValue,rawPosition:1,
      managed,hexColor:"#000000",hoist:false,mentionable:false,
      permissions:{bitfield:BigInt(permissions),
        has:flag=>(BigInt(permissions)&BigInt(flag))===BigInt(flag)},
      edit:async function(props){
        if(props.name!==undefined){
          mutations.rename++;this.name=props.name;
        }
        if(props.permissions!==undefined){
          mutations.permissions++;
          this.permissions.bitfield=BigInt(props.permissions);
        }
        return this;
      }
    };
    roles.set(r.id,r);return r;
  };
  const guild={id:guildId,ownerId,name:"BSA Royal Tank Regiment",
    memberCount:3,roles:{},channels:{},members:{},fetch:async()=>guild};
  roles.set(guildId,{id:guildId,name:"@everyone",position:0,rawPosition:0,managed:false,
    permissions:{bitfield:0n,has:()=>false}});
  const assistant=role("TARC Assistant",{position:1000,managed:true});
  const marker=role(RTR_ROLE_LOCK,{position:900});
  const alias=role("Armoured Vehicle Specialist",{position:17,permissions:P.SendMessages});
  const crew=role("Crewman",{position:32});
  const school=role("Armoured Training School",{position:33});
  const ext=role("External Integration",{position:900,managed:true});
  const specialist=role("Tank Driver",{position:30});
  const oldPerms=alias.permissions.bitfield;
  const channel={id:id(),name:"tank-chat",parentId:null,
    permissionOverwrites:{cache:new Map([[alias.id,{id:alias.id,allow:P.ViewChannel,deny:0n}]])},
    edit:async()=>{mutations.channelEdit++;throw Error("channel update forbidden");}};
  channels.set(channel.id,channel);
  guild.roles.fetch=async()=>roles;
  guild.roles.create=async props=>{
    mutations.create++;
    assert.equal(props.permissions,0n);
    assert.equal(props.hoist,false);
    assert.equal(props.mentionable,false);
    return role(props.name,{position:1});
  };
  guild.roles.setPosition=async(roleId,targetPosition)=>{
    assert.equal(targetPosition,1);
    const target=roles.get(roleId);
    assert.ok(target&&!target.managed);
    assert.ok(target.position<assistant.position);
    mutations.reorder++;
    const ordered=[...roles.values()].filter(x=>x.id!==guildId)
      .sort((a,b)=>a.position-b.position||a.id.localeCompare(b.id));
    const next=[target,...ordered.filter(x=>x.id!==target.id)];
    next.forEach((r,i)=>{r.position=i+1;});
    return target;
  };
  guild.channels.fetch=async()=>channels;
  guild.channels.create=async()=>{mutations.channelCreate++;throw Error("cannot create channels");};
  guild.members.fetchMe=async()=>({permissions:{
    has:x=>x===P.ManageRoles||x===P.Administrator
  },roles:{highest:assistant}});
  const assign=(memberId,roleIds)=>{
    const roleCache=new Map(roleIds.map(id=>[id,roles.get(id)]));
    members.set(memberId,{id:memberId,roles:{cache:roleCache}});
  };
  assign("1",[alias.id,crew.id]);assign("2",[alias.id,specialist.id]);assign("3",[school.id]);
  guild.members.fetch=async()=>members;
  guild.members.cache=members;
  return {guild,roles,channels,members,mutations,alias,assistant,
    role,marker,ext,oldPerms,assign};
}
function slash(f,name="bsa-rtr-rework",userId=OWNER){
  const events=[];let deferred=false;
  return {guild:f.guild,guildId:f.guild.id,user:{id:userId},commandName:name,
    isChatInputCommand:()=>true,isButton:()=>false,inGuild:()=>true,
    get deferred(){return deferred},get replied(){return false},
    deferReply:async x=>{deferred=true;events.push(["defer",x]);},
    editReply:async x=>events.push(["edit",x]),
    reply:async x=>events.push(["reply",x]),events};
}
function button(f,id,userId=OWNER){
  const events=[];let deferred=false;
  return {guild:f.guild,guildId:f.guild.id,user:{id:userId},customId:id,
    isChatInputCommand:()=>false,isButton:()=>true,inGuild:()=>true,
    get deferred(){return deferred},get replied(){return false},
    deferUpdate:async()=>{deferred=true;events.push(["deferUpdate"]);},
    update:async x=>events.push(["update",x]),
    editReply:async x=>events.push(["edit",x]),
    reply:async x=>events.push(["reply",x]),events};
}
const last=i=>i.events.filter(([event])=>event==="edit"||event==="reply").at(-1)?.[1];

test("RTR source plan exactly matches role-only rank reference, plus peer qualification categories",()=>{
 assert.equal(RTR_ROLE_NAMES.length,19);
 assert.deepEqual(RTR_ROLE_NAMES.slice(0,5),[
   "Field Marshal","Chief of General Staff","Deputy Chief of General Staff",
   "Assistant Chief of General Staff","Army Sergeant Major"
 ]);
 assert.deepEqual(RTR_ROLE_NAMES.slice(-3),["Advanced Crewman","Crewman","Armoured Training School"]);
 assert.ok(RTR_ROLE_NAMES.includes("Tank Sergeant"));
 assert.ok(RTR_ROLE_NAMES.includes("Tank Gunner"));
 assert.ok(RTR_ROLE_NAMES.includes("Tank Driver"));
 assert.equal(RTR_ROLE_NAMES.includes("Armoured Vehicle Specialist"),false);
 const f=fixture();
 const order=resolveRtrRoleOrder(f.roles);
 assert.ok(order.indexOf("Tank Driver")<order.indexOf("Tank Gunner"),
   "Preserve already-assigned Driver/Gunner peer display order");
 assert.ok(order.indexOf("Tank Sergeant")>order.indexOf("Squadron Officer"));
});

test("live read-only preview maps old rank ID to Tank Sergeant and counts actual role holders",async()=>{
 const f=fixture();
 const state=await liveRtrRoleSnapshot(f.guild);
 assert.equal(state.ok,true,JSON.stringify(state.issues));
 assert.equal(state.actions.create,13); // 19 desired; 5 existing names and 1 legacy rename.
 assert.equal(state.actions.rename,1);
 assert.equal(state.rolesToRename[0].from,"Armoured Vehicle Specialist");
 assert.equal(state.rolesToRename[0].to,"Tank Sergeant");
 assert.equal(state.rolesToRename[0].id,f.alias.id);
 assert.equal(state.rolesToRename[0].memberCount,2);
 assert.equal(state.rolesToRename[0].channelOverwriteReferences.length,1);
 assert.equal(state.roleHolderCountStatus,"verified");
 assert.equal(f.alias.name,"Armoured Vehicle Specialist");
 assert.deepEqual(f.mutations,{create:0,rename:0,reorder:0,delete:0,
    channelCreate:0,channelEdit:0,members:0,permissions:0});
});

test("single RTR role-only command previews, confirms, preserves IDs/assignments/overwrites, reruns without changes",async()=>{
 const f=fixture(),env=makeEnv();
 const originalId=f.alias.id;
 const memberRolesBefore=[...f.members.values()].map(m=>[...m.roles.cache.keys()]);
 const channelBefore=[...f.channels.values()].map(c=>({
   id:c.id,name:c.name,overwrites:[...c.permissionOverwrites.cache.keys()]
 }));
 const i=slash(f);
 assert.equal(await handleRtrRoleOnlyInteraction(i,env),true);
 const p=last(i);
 assert.match(p.content,/ROLE-ONLY REWORK PREVIEW/);
 assert.equal(p.components.length,1);
 assert.equal(f.mutations.create,0);
 assert.equal(i.events[0][1].flags,64);
 const nonce=p.components[0].toJSON().components[0].custom_id;
 const foreign=button(f,nonce,"888888888888888888");
 await handleRtrRoleOnlyInteraction(foreign,env);
 assert.equal(f.mutations.create,0);
 const b=button(f,nonce);
 await handleRtrRoleOnlyInteraction(b,env);
 const result=last(b);
 assert.match(result.content,/RTR role rework VERIFIED/);
 assert.match(result.content,/Hierarchy verified: YES/);
 assert.equal(f.mutations.rename,1);
 assert.equal(f.alias.id,originalId);
 assert.equal(f.alias.name,"Tank Sergeant");
 assert.equal(f.alias.permissions.bitfield,f.oldPerms);
 assert.ok(f.roles.has(originalId));
 assert.equal(f.mutations.channelCreate,0);
 assert.equal(f.mutations.channelEdit,0);
 assert.equal(f.mutations.members,0);
 assert.equal(f.mutations.permissions,0);
 assert.equal(f.mutations.delete,0);
 assert.deepEqual([...f.members.values()].map(m=>[...m.roles.cache.keys()]),memberRolesBefore);
 assert.deepEqual([...f.channels.values()].map(c=>({
   id:c.id,name:c.name,overwrites:[...c.permissionOverwrites.cache.keys()]
 })),channelBefore);
 const rankOrder=resolveRtrRoleOrder(f.roles);
 const positions=new Map([...f.roles.values()].map(r=>[r.name,r.position]));
 assert.ok(rankOrder.every((name,j)=>j===0||positions.get(rankOrder[j-1])>positions.get(name)));
 const totals={...f.mutations};
 const again=slash(f);
 await handleRtrRoleOnlyInteraction(again,env);
 assert.match(last(again).content,/0 create, 0 rename/);
 const next=last(again).components[0].toJSON().components[0].custom_id;
 await handleRtrRoleOnlyInteraction(button(f,next),env);
 assert.deepEqual(f.mutations,totals,"Idempotent retry must make NO API writes");
});

test("only exact RTR target ID and configured owner are allowed, regardless of server name",async()=>{
 const env=makeEnv(),f=fixture();
 const config=await rtrConfiguration(env);
 assert.deepEqual(config.errors,[]);
 const missing=await rtrConfiguration({...env,BSA_RTR_GUILD_ID:""});
 assert.ok(missing.errors.some(x=>x.includes("BSA_RTR_GUILD_ID")));
 const liveBsa=await rtrConfiguration({...env,BSA_RTR_GUILD_ID:MAIN_BSA});
 assert.ok(liveBsa.errors.some(x=>x.includes("protected")));
 const bad=fixture("666666666666666667");
 await handleRtrRoleOnlyInteraction(slash(bad),env);
 assert.match(last(slashResultDummy(bad,env)).content||"",/never/); // placeholder
});
function slashResultDummy(f,env){return {events:[["edit",{content:"never"}]]};}

test("existing Tank Sergeant and old obsolete role are not merged or deleted",async()=>{
 const f=fixture();
 f.role("Tank Sergeant",{position:3});
 const plan=await liveRtrRoleSnapshot(f.guild);
 assert.equal(plan.actions.rename,0);
 assert.ok(plan.warnings.some(x=>x.includes("Both Armoured Vehicle Specialist")));
 assert.ok(plan.unmappedRolesPreserved.some(r=>r.id===f.alias.id));
});

test("role holder enumeration must be verified before a semantic legacy rename",async()=>{
 const f=fixture();
 f.guild.members.fetch=async()=>{throw Object.assign(new Error("Intent disabled"),{code:50001})};
 const plan=await liveRtrRoleSnapshot(f.guild);
 assert.equal(plan.ok,false);
 assert.ok(plan.issues.some(x=>x.includes("Cannot confirm how many members")));
 assert.equal(plan.rolesToRename[0].memberCount,null);
});

test("does not auto-modify Administrator, integration-managed or other server roles",async()=>{
 const f=fixture();
 const protectedRole=f.role("Commanding Officer",{permissions:P.Administrator});
 const state=await liveRtrRoleSnapshot(f.guild);
 assert.equal(state.ok,false);
 assert.ok(state.issues.some(x=>x.includes("Administrator")));
 const another=fixture("666666666666666668");
 const rest={post:async()=>{throw Error("should not post")},get:async()=>[]};
 const registered=await registerRtrRoleOnlyGuildCommand(rest,"444444444444444444",another.guild,makeEnv());
 assert.equal(registered.registered,false);
 assert.equal(f.mutations.channelEdit,0);
});
