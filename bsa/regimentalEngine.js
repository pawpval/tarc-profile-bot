import {ChannelType,PermissionFlagsBits as P,OverwriteType} from "discord.js";
import {REGIMENT_CODES,validateRegimentalPreset} from "./regimentalTemplates.js";

export const REGIMENT_TYPES=Object.freeze({
  text:ChannelType.GuildText, forum:ChannelType.GuildForum,
  voice:ChannelType.GuildVoice, stage:ChannelType.GuildStageVoice
});
export const markerName=code=>"BSA Builder | "+code;
const markerPattern=/^BSA Builder \| ([A-Z]+)$/;
const take=x=>Array.isArray(x)?x.filter(Boolean):x?.values?[...x.values()].filter(Boolean):[];
const identical=(a,b)=>String(a??"")===String(b??"");
const names=list=>new Map(list.reduce((m,x)=>{
  if(!m.has(x.name))m.set(x.name,[]);
  m.get(x.name).push(x);return m;
},new Map()));
const only=(items)=>items.length===1?items[0]:null;

// Existing fresh Discord scaffolding may be left untouched. No deletions.
// Reuse/recovery of an interrupted build is allowed ONLY if the dedicated
// template-lock role exists, matching the requested preset exactly.
const DEFAULT_CATEGORIES=new Set(["text channels","voice channels"]);
function isDefaultCategory(x) {
  return x.type===ChannelType.GuildCategory && DEFAULT_CATEGORIES.has(x.name.toLowerCase());
}
function isDefaultChannel(x,byId) {
  if(x.type!==ChannelType.GuildText && x.type!==ChannelType.GuildVoice) return false;
  if(!["general","General"].includes(x.name)) return false;
  const parent=x.parentId?byId.get(x.parentId):null;
  if(!parent) return x.parentId==null;
  return isDefaultCategory(parent);
}

export function roleListFor(template){return template.roles_lowest_to_highest;}
export function expectedRegimentalChannels(template){
  return template.categories_top_to_bottom.flatMap(cat=>
    cat.channels.map(ch=>({category:cat.name,access:cat.access,...ch})));
}

// Safest deterministic fallback for proposal-only permission descriptions:
// public: everyone can VIEW, not post; restricted/mixed: everyone DENIED.
// Never interpret words such as "staff", "agents" or "higher" as grants.
export function conservativeOverwrites(guildId,access,type="category"){
  const publicReadOnly=access==="public";
  const writers=[P.SendMessages,P.CreatePublicThreads,P.SendMessagesInThreads];
  if(type==="voice"||type==="stage")writers.push(P.Connect,P.Speak);
  const perms={
    id:guildId,type:OverwriteType.Role,
    allow:publicReadOnly?[P.ViewChannel]:[],
    deny:publicReadOnly?writers:[P.ViewChannel,...writers,P.Connect,P.Speak]
  };
  return [perms];
}

export function inspectRegimentalGuild(guild,template,existingRoles,existingChannels,bot){
  const val=validateRegimentalPreset(template);
  const issues=[...val.errors],warnings=[...val.warnings];
  const roles=take(existingRoles),channels=take(existingChannels);
  const markerRoles=roles.filter(r=>markerPattern.test(r.name));
  const correctMarker=markerRoles.filter(r=>r.name===markerName(template.server_code));
  if(markerRoles.length>1 || (markerRoles.length===1&&!correctMarker.length))
    issues.push("This server is already claimed by a different BSA generator preset. Do not mix templates.");
  if(correctMarker.length>1)issues.push("Duplicate builder lock roles; resolve manually.");
  const existingMarker=only(correctMarker);
  if(existingMarker && existingMarker.permissions?.has?.(P.Administrator))
    issues.push("The existing template lock role has Administrator permission.");
  const firstRun=!existingMarker;
  const expectedNames=new Set(template.roles_lowest_to_highest);
  const foreignRoles=roles.filter(r=>r.id!==guild.id&&!r.managed &&
    !expectedNames.has(r.name)&&!markerPattern.test(r.name));
  if(foreignRoles.length)issues.push("Target has "+foreignRoles.length+" unmanaged role(s) outside the selected proposal. Use a freshly created server; no existing roles will be overwritten.");
  if(firstRun && roles.some(r=>r.id!==guild.id&&!r.managed))
    issues.push("No trusted template lock found, but target already has custom roles. Refusing to assume it is fresh.");
  const existingRoleNames=names(roles);
  const missingRoles=[],reusedRoles=[];
  for(const name of template.roles_lowest_to_highest){
    const found=existingRoleNames.get(name)||[];
    if(found.length>1)issues.push("Ambiguous existing role: "+name);
    else if(found.length){
      if(found[0].managed || found[0].permissions?.has?.(P.Administrator))
        issues.push("Existing "+name+" is integration-managed or Administrator. Refusing to reuse.");
      reusedRoles.push(name);
    }
    else missingRoles.push(name);
  }
  const byId=new Map(channels.map(ch=>[ch.id,ch]));
  const categoriesByName=names(channels.filter(ch=>ch.type===ChannelType.GuildCategory));
  const missingCategories=[],reusedCategories=[],missingChannels=[],reusedChannels=[];
  const matchedIds=new Set();
  const expectedCats=new Set(template.categories_top_to_bottom.map(c=>c.name));
  for(const cat of template.categories_top_to_bottom){
    const found=categoriesByName.get(cat.name)||[];
    if(found.length>1){issues.push("Duplicate existing category "+cat.name);continue;}
    const parent=only(found);
    if(parent){reusedCategories.push(cat.name);matchedIds.add(parent.id);}
    else missingCategories.push(cat.name);
    for(const ch of cat.channels){
      const key=cat.name+"/"+ch.name;
      const foundCh=channels.filter(c=>c.type!==ChannelType.GuildCategory &&
        c.name===ch.name && (parent ? identical(c.parentId,parent.id) : false));
      if(foundCh.length>1){issues.push("Duplicate existing channels: "+key);continue;}
      if(foundCh.length){
        if(foundCh[0].type!==REGIMENT_TYPES[ch.type])
          issues.push("Existing channel type mismatch: "+key);
        reusedChannels.push(key);matchedIds.add(foundCh[0].id);
      }else missingChannels.push(key);
    }
  }
  const foreignChannels=channels.filter(ch=>!matchedIds.has(ch.id) &&
    !isDefaultCategory(ch) && !isDefaultChannel(ch,byId));
  if(foreignChannels.length)issues.push("Target has "+foreignChannels.length+
    " unmatched channel/category object(s). Refusing to guess or overwrite; inspect the private JSON preview.");
  if(!bot?.permissions?.has?.(P.ManageRoles))
    issues.push("Bot needs Manage Roles in this target server.");
  if(!bot?.permissions?.has?.(P.ManageChannels))
    issues.push("Bot needs Manage Channels in this target server.");
  if(val.forums+val.stage>0&&!guild.features?.includes("COMMUNITY"))
    issues.push("Enable Community on the new Discord server before creating Forum/Stage channels.");
  for(const wanted of template.roles_lowest_to_highest){
    const found=only(existingRoleNames.get(wanted)||[]);
    if(found && bot?.roles?.highest && found.position>=bot.roles.highest.position)
      issues.push("Bot role must be above existing role "+wanted+".");
  }
  if(channels.length+val.channels+val.categories>490)
    warnings.push("This guild may approach the Discord 500-channel cap.");
  if(firstRun && channels.every(ch=>isDefaultCategory(ch)||isDefaultChannel(ch,byId)))
    warnings.push("Existing Discord default starter channels/categories are preserved and NOT deleted.");
  warnings.push("The builder will add one zero-permission template lock role '"+markerName(template.server_code)+"' to prevent cross-preset mixing and permit safe retries.");
  const size={newRoles:missingRoles.length,newCategories:missingCategories.length,newChannels:missingChannels.length};
  return {ok:issues.length===0,validation:val,issues:[...new Set(issues)],warnings:[...new Set(warnings)],
    claimed:Boolean(existingMarker),marker:markerName(template.server_code),
    missingRoles,reusedRoles,missingCategories,reusedCategories,missingChannels,reusedChannels,
    extraObjects:foreignChannels.map(ch=>({name:ch.name,id:ch.id,type:ch.type,parentId:ch.parentId??null})),size,
    counts:{roles:val.roles,categories:val.categories,channels:val.channels}};
}

export async function preflightRegimentalGuild(guild,template){
  const [roles,channels,bot]=await Promise.all([
    guild.roles.fetch(),guild.channels.fetch(),guild.members.fetchMe()
  ]);
  return inspectRegimentalGuild(guild,template,roles,channels,bot);
}

export async function buildRegimentalGuild(guild,template,onProgress=async()=>{},options={}){
  // Discord interaction tokens expire. Stop gracefully and support a safe
  // subsequent /bsa-generate resume rather than running an unbounded build.
  const startedAt=Date.now();
  const maxDurationMs=options.maxDurationMs??(12*60*1000);
  const expired=()=>Date.now()-startedAt>maxDurationMs;
  const preflight=await preflightRegimentalGuild(guild,template);
  if(!preflight.ok)throw new Error("Regimental preflight stopped all writes: "+preflight.issues.join(" | "));
  const report={code:template.server_code,guildId:guild.id,createdRoles:[],
    createdCategories:[],createdChannels:[],reused:[],warnings:preflight.warnings,
    errors:[],noDeletion:true,permissions:"proposal-safe restricted defaults only"};
  const reason="Owner-confirmed temporary BSA "+template.server_code+" structural proposal generator";
  function stopForDeadline(){
    if(!expired())return false;
    report.errors.push("Stopped safely at the build time limit. Rerun /bsa-generate with the SAME preset to resume without duplicating objects.");
    return true;
  }
  if(stopForDeadline())return report;
  const existingRoles=take(await guild.roles.fetch());
  const marker=existingRoles.find(r=>r.name===markerName(template.server_code));
  if(!marker){
    const created=await guild.roles.create({name:markerName(template.server_code),
      color:"#99A0A8",permissions:0n,hoist:false,mentionable:false,reason});
    existingRoles.push(created);
    report.createdRoles.push(created.name);
  }
  for(const name of template.roles_lowest_to_highest){
    if(stopForDeadline())return report;
    if(existingRoles.some(r=>r.name===name)){report.reused.push("role/"+name);continue;}
    const created=await guild.roles.create({name,permissions:0n,hoist:false,mentionable:false,reason});
    existingRoles.push(created);
    report.createdRoles.push(name);
    if(report.createdRoles.length%10===0)await onProgress("Roles "+report.createdRoles.length+" created.");
  }
  // The pack orders roles lowest to highest. Preserve that relative priority
  // without interpreting specialty/appointment roles as actual promotions.
  const roleByName=new Map(existingRoles.map(r=>[r.name,r]));
  try{
    const me=await guild.members.fetchMe();
    const n=template.roles_lowest_to_highest.length;
    if(me.roles.highest.position<=n){
      report.warnings.push("Move the bot role above generated roles and adjust hierarchy manually. No extra permissions were granted.");
    } else {
      await guild.roles.setPositions(template.roles_lowest_to_highest.map((name,i)=>({
        role:roleByName.get(name).id,position:i+1
      })));
    }
  }catch(e){report.errors.push("Role positioning unsuccessful; adjust manually (code "+String(e?.code||"unknown")+").");}

  const current=take(await guild.channels.fetch());
  const categories=template.categories_top_to_bottom;
  for(const [categoryIndex,cat] of categories.entries()){
    if(stopForDeadline())return report;
    let parent=current.find(ch=>ch.type===ChannelType.GuildCategory&&ch.name===cat.name);
    if(!parent){
      try{
        parent=await guild.channels.create({name:cat.name,type:ChannelType.GuildCategory,
          position:categoryIndex,permissionOverwrites:conservativeOverwrites(guild.id,cat.access),reason});
        report.createdCategories.push(cat.name);
        current.push(parent);
      }catch(e){
        report.errors.push("Category creation failed: "+cat.name+" (code "+String(e?.code||"unknown")+")");
        continue;
      }
    }else report.reused.push("category/"+cat.name);
    for(const [channelIndex,ch] of cat.channels.entries()){
      if(stopForDeadline())return report;
      const label=cat.name+"/"+ch.name;
      const found=current.filter(c=>c.name===ch.name&&c.parentId===parent.id);
      if(found.length===1&&found[0].type===REGIMENT_TYPES[ch.type]){
        report.reused.push("channel/"+label);continue;
      }
      if(found.length) {report.errors.push("Ambiguous or wrong-type channel, skipped: "+label);continue;}
      try{
        const created=await guild.channels.create({name:ch.name,type:REGIMENT_TYPES[ch.type],
          parent:parent.id,position:channelIndex,
          permissionOverwrites:conservativeOverwrites(guild.id,cat.access,ch.type),reason});
        current.push(created);report.createdChannels.push(label);
      }catch(e){
        report.errors.push("Channel creation failed: "+label+" (code "+String(e?.code||"unknown")+")");
      }
    }
    await onProgress("Categories "+(categoryIndex+1)+"/"+categories.length+
      "; created channels "+report.createdChannels.length+"/"+preflight.counts.channels);
  }
  return report;
}

export async function auditRegimentalGuild(guild,template){
  const report=await preflightRegimentalGuild(guild,template);
  const issues=[...report.issues];
  if(!report.claimed)issues.push("Missing template lock role: "+report.marker);
  for(const name of report.missingRoles)issues.push("Missing role: "+name);
  for(const name of report.missingCategories)issues.push("Missing category: "+name);
  for(const key of report.missingChannels)issues.push("Missing channel: "+key);
  const live=take(await guild.channels.fetch());
  const categories=new Map(live.filter(x=>x.type===ChannelType.GuildCategory).map(c=>[c.name,c]));
  const roleData=take(await guild.roles.fetch());
  for(const r of template.roles_lowest_to_highest){
    const found=roleData.find(x=>x.name===r);
    if(found?.permissions?.has?.(P.Administrator))issues.push("Unapproved Administrator role: "+r);
  }
  for(const cat of template.categories_top_to_bottom){
    const parent=categories.get(cat.name);if(!parent)continue;
    for(const ch of cat.channels){
      const found=live.find(x=>x.parentId===parent.id&&x.name===ch.name);
      if(found&&found.type!==REGIMENT_TYPES[ch.type])issues.push("Type mismatch: "+cat.name+"/"+ch.name);
    }
  }
  return {status:issues.length?"review_needed":"structure_present",code:template.server_code,
    guildId:guild.id,issues:[...new Set(issues)],warnings:report.warnings,counts:report.counts,
    found:{roles:report.reusedRoles.length,categories:report.reusedCategories.length,
      channels:report.reusedChannels.length},proposalStatus:template.status,
    note:"This is a STRUCTURAL audit only. The source proposals do not define final role colours or explicit access permissions. Audit cannot certify those pending policies."};
}
