import {readFile} from "node:fs/promises";
import {brotliDecompressSync} from "node:zlib";
import {createHash} from "node:crypto";

export const REVISED_CODES=Object.freeze(["RMP","ETS","RGG","RTR","UKSF","GR","RIC","OCA","RICA","RA"]);
const SHA="616dd2b74d5cf7833b342afb79d7819d2b9a5dd191a6f72ac61216d23cfcfe59";
const COMMON_PERMISSIONS=[
  "ViewChannel","ReadMessageHistory","SendMessages","EmbedLinks","AttachFiles",
  "UseApplicationCommands","Connect","Speak"
];
let cached;
export async function getRevisedPresets(){
  if(cached)return cached;
  const b64=(await readFile(new URL("./revised-regimental-core.b64",import.meta.url),"utf8")).trim();
  const content=brotliDecompressSync(Buffer.from(b64,"base64"));
  if(createHash("sha256").update(content).digest("hex")!==SHA)
    throw new Error("Revised template bundle checksum mismatch; no writes permitted.");
  const projection=JSON.parse(content.toString("utf8"));
  if(Object.keys(projection).length!==REVISED_CODES.length)throw Error("Revised pack incomplete");
  const result={};
  for(const code of REVISED_CODES){
    const p=projection[code];
    if(!p||!p.n||!(/^\d{17,20}$/).test(p.g))throw Error("Invalid "+code+" template");
    const roles=p.r.map(([name,color,perms,hoist,mentionable])=>({
      name,color,permissions:perms?COMMON_PERMISSIONS:[],hoist:Boolean(hoist),mentionable:Boolean(mentionable)
    }));
    const categories=p.c.map(([name,access,everyoneView,everyoneSend,referenceRoles,rawChannels])=>({
      name,access,
      reference_permission_roles:referenceRoles,
      permission_overwrites_template:{
        "@everyone":{ViewChannel:Boolean(everyoneView),SendMessages:Boolean(everyoneSend)},
        authorized_roles:{ViewChannel:true,ReadMessageHistory:true,SendMessages:true}
      },
      channels:rawChannels.map(([channelName,type,view,send,authorizedSend,sourceName])=>({
        name:channelName,type,source_channel_name:sourceName,
        permission_overwrites_template:{
          "@everyone":{ViewChannel:Boolean(view),SendMessages:Boolean(send)},
          authorized_roles:{ViewChannel:true,ReadMessageHistory:true,SendMessages:Boolean(authorizedSend)},
          staff_roles:{ViewChannel:true,SendMessages:true}
        }
      }))
    }));
    const t={
      schema:"bsa.regimental.proposal",schemaVersion:1,
      status:"REVISED_PROPOSAL_REQUIRES_PREVIEW",
      server_code:code,server_name:p.n,reference_source:{guild_id:p.g},
      roles_top_to_bottom:p.h,roles_lowest_to_highest:[...p.h].reverse(),
      role_definitions:roles,categories_top_to_bottom:categories,
      channel_naming_convention:"emoji│channel-name; emojis are literal Unicode and should be retained by builder"
    };
    validateRevised(t);
    result[code]=t;
  }
  cached=Object.freeze(result);
  return cached;
}
export function revisedHash(template){
  return createHash("sha256").update(JSON.stringify(template)).digest("hex");
}
export function validatedSourceIds(pack){
  return Object.values(pack).map(x=>x.reference_source.guild_id);
}
export function validateRevised(template){
  const fail=m=>{throw Error("Invalid revised BSA template "+(template?.server_code||"?")+": "+m);};
  if(template?.status!=="REVISED_PROPOSAL_REQUIRES_PREVIEW" ||
    !REVISED_CODES.includes(template.server_code))fail("status/code");
  const roles=template.role_definitions||[];
  if(roles.length<10||roles.length!==template.roles_top_to_bottom.length)fail("rank count");
  if(new Set(roles.map(r=>r.name)).size!==roles.length)fail("duplicate role names");
  if(template.roles_top_to_bottom.some((x,i)=>roles.find(r=>r.name===x)==null))fail("unknown rank");
  const hq=["Field Marshal","Chief of General Staff","Deputy Chief of General Staff",
    "Assistant Chief of General Staff","Army Sergeant Major"];
  if(JSON.stringify(template.roles_top_to_bottom.slice(0,5))!==JSON.stringify(hq))
    fail("HQ ranks must be first and ordered highest to lowest");
  for(const role of roles){
    if(!/^#[0-9a-f]{6}$/i.test(role.color)||!Array.isArray(role.permissions))fail("role colour/permissions");
    if(role.permissions.includes("Administrator"))fail("Administrator permission not authorized");
  }
  const cats=template.categories_top_to_bottom||[];
  if(!cats.length||new Set(cats.map(c=>c.name)).size!==cats.length)fail("duplicate/missing categories");
  let channelCount=0;
  for(const cat of cats){
    if(typeof cat.name!=="string"||cat.name.length>100)fail("category name");
    const names=new Set();
    for(const ch of cat.channels){
      channelCount++;
      if(!["text","forum","voice","stage"].includes(ch.type) ||
        typeof ch.name!=="string"||ch.name.length>100||names.has(ch.name))
        fail("channel name/type/duplicate in "+cat.name);
      names.add(ch.name);
      if(!/^.+│[^│]+$/u.test(ch.name))fail("channel lacking Unicode emoji prefix "+ch.name);
      if(!ch.permission_overwrites_template?.["@everyone"] ||
        !ch.permission_overwrites_template?.authorized_roles)fail("channel access policy missing");
    }
  }
  if(template.server_code==="OCA"){
    const phases=cats.map(c=>c.name);
    for(const phase of ["𝟏","𝐈𝐈","𝟑","𝟒","𝟓"]){
      if(!phases.some(c=>c.includes(phase)))fail("missing OCA phase "+phase);
    }
  }
  if(template.server_code==="RICA"){
    for(const phase of ["[PHASE I]","[PHASE II]","[PHASE III]"])
      if(!cats.some(c=>c.name===phase))fail("missing original Intelligence Academy phase");
  }
  if(template.server_code==="RA"){
    for(const x of ["Ticket Center","Moderation Reports","Appeal Tickets","Internal Affairs Tickets"])
      if(!cats.some(c=>c.name===x))fail("missing Reports & Appeals original-style section "+x);
  }
  return {roleCount:roles.length,categoryCount:cats.length,channelCount};
}
