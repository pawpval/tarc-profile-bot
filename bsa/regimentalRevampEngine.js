import {ChannelType,PermissionFlagsBits as P,OverwriteType} from "discord.js";
import {expectedAccess,toOverwriteArray,testAccessMatrix,REVISED_BASE_FLAGS,channelBaseName} from "./regimentalRevampAccess.js";
import {validateRevised} from "./regimentalRevampTemplates.js";

const TYPE={text:ChannelType.GuildText,forum:ChannelType.GuildForum,
  voice:ChannelType.GuildVoice,stage:ChannelType.GuildStageVoice};
export const revampLock=code=>"BSA Builder | "+code;
const entries=c=>Array.isArray(c)?c.filter(Boolean):(c?.values?[...c.values()].filter(Boolean):[]);
const same=(a,b)=>String(a??"")===String(b??"");
const byName=(rows,name)=>rows.filter(x=>x.name===name);
const bits=flags=>flags.reduce((v,f)=>v|P[f],0n);
const btxt=value=>String(value?.bitfield??value??0);
const hex=value=>"#"+Number(value??0).toString(16).padStart(6,"0").toUpperCase();
const catType=ChannelType.GuildCategory;
const isManaged=r=>r.managed||r.tags?.botId||r.tags?.integrationId;
export function safeRoleAttributes(role){
  return {name:role.name,color:String(role.color).toUpperCase(),
    permissions:bits(role.permissions).toString(),hoist:Boolean(role.hoist),
    mentionable:Boolean(role.mentionable)};
}
const effective=(role,name)=>{
  const wanted=safeRoleAttributes(role);
  return {name,id:role.id??null,color:wanted.color,permissions:wanted.permissions,
    hoist:wanted.hoist,mentionable:wanted.mentionable};
};
const actualRole=r=>({
  color:r.hexColor?.toUpperCase?.()||hex(r.color),
  permissions:btxt(r.permissions),hoist:Boolean(r.hoist),mentionable:Boolean(r.mentionable)
});
function overwriteRows(channel){
  const cache=channel?.permissionOverwrites?.cache;
  return entries(cache).map(o=>({
    id:String(o.id),type:o.type??OverwriteType.Role,
    allow:BigInt(o.allow?.bitfield??o.allow??0),deny:BigInt(o.deny?.bitfield??o.deny??0)
  }));
}
const normalizedRows=rows=>rows.map(x=>({
  id:String(x.id),type:x.type??OverwriteType.Role,
  allow:String(x.allow?.bitfield??x.allow??0),deny:String(x.deny?.bitfield??x.deny??0)
})).sort((a,b)=>a.id.localeCompare(b.id)||a.type-b.type);
const normalizedEqual=(a,b)=>JSON.stringify(normalizedRows(a))===JSON.stringify(normalizedRows(b));
function policyOverwrites(t,category,ch,guildId,roleIdByName,existing){
  const defined=toOverwriteArray(t,category,ch,guildId,roleIdByName).map(x=>({
    id:String(x.id),type:x.type,allow:bits(x.allow),deny:bits(x.deny)
  }));
  const ids=new Set(defined.map(x=>x.id));
  // Preserve unrelated user and integration/third-party role overwrites
  // instead of wiping them. They are listed for owner review; a private
  // channel's audit cannot certify their independent scope.
  const foreign=overwriteRows(existing).filter(x=>!ids.has(x.id));
  return {rows:[...defined,...foreign],preserved:foreign.map(x=>x.id)};
}
const normalizedChannelName=name=>channelBaseName(name).replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const roleIdKey=name=>"NEW_ROLE:"+name;
function toRoleIds(roles,t){
  const m=new Map(roles.map(r=>[r.name,r.id]));
  for(const role of t.role_definitions)
    if(!m.has(role.name))m.set(role.name,roleIdKey(role.name));
  return m;
}
const unknownRole=r=>r.name!=="@everyone"&&!isManaged(r)&&!/^BSA Builder \| [A-Z]+$/.test(r.name);
const defaultCategory=c=>c.type===catType&&["text channels","voice channels"].includes(c.name.toLowerCase());
const defaultChannel=(c,byId)=>(
  [ChannelType.GuildText,ChannelType.GuildVoice].includes(c.type)
  && c.name.toLowerCase()==="general"
  &&(!c.parentId||defaultCategory(byId.get(c.parentId)||{}))
);
function evaluatePlan(guild,t,roleCollection,channelCollection,bot){
  const meta=validateRevised(t);
  const roles=entries(roleCollection),channels=entries(channelCollection),issues=[],warnings=[];
  const locks=roles.filter(r=>/^BSA Builder \| [A-Z]+$/.test(r.name));
  const matching=locks.filter(r=>r.name===revampLock(t.server_code));
  if(locks.length>1||locks.some(r=>r.name!==revampLock(t.server_code)))
    issues.push("Another BSA preset lock exists in this guild; refusing to mix regiments.");
  if(matching.length>1)issues.push("Duplicate BSA preset lock roles.");
  if(matching.some(r=>isManaged(r)||r.permissions?.has?.(P.Administrator)))
    issues.push("Preset lock role is managed or has Administrator.");
  const claimed=matching.length===1;
  const wantNames=new Set(t.role_definitions.map(r=>r.name));
  const foreignRoles=roles.filter(r=>unknownRole(r)&&!wantNames.has(r.name));
  if(!claimed&&foreignRoles.length)
    issues.push("Unclaimed guild contains "+foreignRoles.length+" unknown unmanaged roles. Only preconfigured matching regimental servers or fresh guilds are allowed.");
  const highest=bot?.roles?.highest?.position||0;
  if(!bot?.permissions?.has?.(P.ManageRoles))issues.push("Bot lacks Manage Roles.");
  if(!bot?.permissions?.has?.(P.ManageChannels))issues.push("Bot lacks Manage Channels.");
  const createRoles=[],editRoles=[],reusedRoles=[];
  for(const wanted of t.role_definitions){
    const matches=byName(roles,wanted.name);
    if(matches.length>1){issues.push("Ambiguous duplicate role: "+wanted.name);continue;}
    if(!matches.length){createRoles.push(effective(wanted,wanted.name));continue;}
    const r=matches[0],a=actualRole(r),e=safeRoleAttributes(wanted);
    if(isManaged(r)||r.id===guild.id||r.permissions?.has?.(P.Administrator)){
      issues.push("Refusing to repurpose managed, @everyone or Administrator role: "+wanted.name);continue;
    }
    if(highest&&r.position>=highest)issues.push("Bot role must be ABOVE role "+wanted.name+" to edit it.");
    const delta=Object.keys(a).filter(k=>String(a[k])!==String(e[k]));
    if(delta.length)editRoles.push({id:r.id,name:r.name,before:a,after:e,fields:delta});
    else reusedRoles.push({id:r.id,name:r.name});
  }
  const ids=toRoleIds(roles,t);
  const plannedCategories=[],plannedChannels=[],used=new Set(),warningsForPolicy=[];
  const templateBaseCounts=new Map();
  for(const cat of t.categories_top_to_bottom)
    for(const ch of cat.channels){
      const key=normalizedChannelName(ch.name);
      templateBaseCounts.set(key,(templateBaseCounts.get(key)||0)+1);
    }
  const allCategories=channels.filter(ch=>ch.type===catType);
  const typeExpected=ch=>TYPE[ch.type];
  const plannedCatNames=new Set();
  for(const [categoryIndex,cat] of t.categories_top_to_bottom.entries()){
    if(plannedCatNames.has(cat.name))issues.push("Duplicate proposed category "+cat.name);
    plannedCatNames.add(cat.name);
    const matches=byName(allCategories,cat.name);
    if(matches.length>1){issues.push("Multiple matching category names: "+cat.name);continue;}
    const found=matches[0]||null;
    if(found)used.add(found.id);
    const expected=policyOverwrites(t,cat,null,guild.id,ids,found);
    const catDelta=!found||!normalizedEqual(overwriteRows(found),expected.rows);
    const catPlan={id:found?.id||null,name:cat.name,position:categoryIndex,
      action:found?(catDelta?"update":"reuse"):"create",
      before:found?{name:found.name,overwrites:normalizedRows(overwriteRows(found))}:null,
      after:{name:cat.name,overwrites:normalizedRows(expected.rows)},
      preservedOverwrites:expected.preserved};
    plannedCategories.push(catPlan);
    if(expected.preserved.length)
      warningsForPolicy.push(cat.name+" preserves "+expected.preserved.length+" unrelated overwrite(s)");
    for(const [channelIndex,ch] of cat.channels.entries()){
      const desiredKey=normalizedChannelName(ch.name);
      const sameCat=channels.filter(c=>c.type!==catType&&
        (found?same(c.parentId,found.id):false)&&
        normalizedChannelName(c.name)===desiredKey);
      let candidates=sameCat,location="same category";
      if(!candidates.length && templateBaseCounts.get(desiredKey)===1){
        candidates=channels.filter(c=>c.type!==catType&&!used.has(c.id)&&
          normalizedChannelName(c.name)===desiredKey);
        location="globally unique legacy name";
      }
      if(candidates.length>1){
        issues.push("Ambiguous channel match ("+candidates.length+"): "+cat.name+"/"+ch.name);
        continue;
      }
      const old=candidates[0]||null;
      if(old){
        if(used.has(old.id)){issues.push("Channel matched more than once: "+old.id);continue;}
        used.add(old.id);
        if(old.type!==typeExpected(ch)){
          issues.push("Matched channel type conflict: "+cat.name+"/"+ch.name);continue;
        }
      }
      const target=policyOverwrites(t,cat,ch,guild.id,ids,old);
      const delta={
        name:old?old.name!==ch.name:true,
        parent:old?!same(old.parentId,found?.id||null):true,
        permissions:old?!normalizedEqual(overwriteRows(old),target.rows):true
      };
      const action=!old?"create":Object.values(delta).some(Boolean)?"update":"reuse";
      plannedChannels.push({
        id:old?.id||null,oldName:old?.name||null,name:ch.name,type:ch.type,
        section:cat.name,parentId:found?.id||null,
        targetParentName:cat.name,position:channelIndex,match:old?location:"new",
        action,delta,
        before:old?{name:old.name,parentId:old.parentId??null,
          overwrites:normalizedRows(overwriteRows(old))}:null,
        after:{name:ch.name,parentName:cat.name,overwrites:normalizedRows(target.rows)},
        preservedOverwrites:target.preserved
      });
      if(target.preserved.length)
        warningsForPolicy.push(cat.name+"/"+ch.name+" preserves "+target.preserved.length+" unrelated overwrite(s)");
    }
  }
  const byId=new Map(channels.map(c=>[c.id,c]));
  const orphans=channels.filter(c=>!used.has(c.id)&&
    !defaultCategory(c)&&!defaultChannel(c,byId)).map(c=>({
      id:c.id,name:c.name,parentId:c.parentId??null,type:c.type,
      note:"Will NOT be deleted, moved or renamed"
    }));
  if(orphans.length)warnings.push("Preserving "+orphans.length+" unmatched channels/categories; see orphans in preview.");
  if(foreignRoles.length)warnings.push("Preserving "+foreignRoles.length+" outside roles; membership and other roles are never removed.");
  if(warningsForPolicy.length)
    warnings.push(warningsForPolicy.length+" category/channel policy overwrites contain third-party user/role grants, preserved without guessing; inspect report.");
  if(t.categories_top_to_bottom.some(cat=>cat.channels.some(ch=>["forum","stage"].includes(ch.type)))&&
    !guild.features?.includes("COMMUNITY"))issues.push("Enable Discord Community for Forum/Stage channels.");
  // Discord role hierarchy is explicit and top-to-bottom. The highest
  // numbered target position is always Field Marshal. Never try to place a
  // managed bot/application role below proposed ranks.
  const hierarchy=t.roles_top_to_bottom.map((name,index)=>({
    name,roleId:ids.get(name),targetPosition:t.roles_top_to_bottom.length-index,
    currentPosition:roles.find(r=>r.name===name)?.position??null
  }));
  const currentOrder=hierarchy.filter(x=>x.currentPosition!=null);
  const needsHierarchy=currentOrder.some((r,i)=>
    i>0&&r.currentPosition>=currentOrder[i-1].currentPosition)||
    currentOrder.length!==hierarchy.length;
  if(currentOrder.some(x=>x.currentPosition>=highest)&&highest)
    issues.push("Move TARC Assistant above all regimental roles before revamping the hierarchy.");
  const accessTests=testAccessMatrix(t);
  for(const issue of accessTests.issues)issues.push("Access test: "+issue);
  warnings.push(...accessTests.warnings);
  if(t.server_code==="OCA")
    warnings.push("Phase 4 and 5 have no dedicated rank roles in the revised ZIP; Academy Student/Graduation and Officer Cadet respectively are allowed alongside instructors/command.");
  if(t.server_code==="RIC")
    warnings.push("Revised RIC template has no separate IAD/COD/PAD roles; department rooms stay limited to mapped command until dedicated roles are supplied.");
  if(roles.length+createRoles.length>240)issues.push("Discord role limit may be exceeded.");
  if(channels.length+plannedCategories.filter(x=>x.action==="create").length+
    plannedChannels.filter(x=>x.action==="create").length>485)
    issues.push("Discord channel limit may be exceeded.");
  return {
    ok:issues.length===0,code:t.server_code,templateStatus:t.status,
    guildId:guild.id,guildName:guild.name,claimed,marker:revampLock(t.server_code),
    counts:{roles:meta.roleCount,categories:meta.categoryCount,channels:meta.channelCount},
    issues:[...new Set(issues)],warnings:[...new Set(warnings)],
    roleCreates:createRoles,roleEdits:editRoles,roleUnchanged:reusedRoles,
    categories:plannedCategories,channels:plannedChannels,
    hierarchy,needsHierarchy,orphans,unknownRoles:foreignRoles.map(r=>({id:r.id,name:r.name})),
    accessTests,summary:{
      createRoles:createRoles.length,editRoles:editRoles.length,
      createCategories:plannedCategories.filter(x=>x.action==="create").length,
      updateCategories:plannedCategories.filter(x=>x.action==="update").length,
      createChannels:plannedChannels.filter(x=>x.action==="create").length,
      updateChannels:plannedChannels.filter(x=>x.action==="update").length,
      moveChannels:plannedChannels.filter(x=>x.id&&x.delta.parent).length,
      renameChannels:plannedChannels.filter(x=>x.id&&x.delta.name).length,
      permissionEdits:plannedChannels.filter(x=>x.id&&x.delta.permissions).length+
        plannedCategories.filter(x=>x.id&&x.action==="update").length,
      preservedOrphans:orphans.length
    }
  };
}
export function inspectRevisedGuild(guild,t,roles,channels,bot){
  return evaluatePlan(guild,t,roles,channels,bot);
}
export async function previewRevisedGuild(guild,t){
  const [roles,channels,bot]=await Promise.all([
    guild.roles.fetch(),guild.channels.fetch(),guild.members.fetchMe()]);
  return inspectRevisedGuild(guild,t,roles,channels,bot);
}

export async function revampRegimentalGuild(guild,t,onProgress=async()=>{},options={}){
  const started=Date.now(),maxMs=options.maxDurationMs??12*60*1000;
  const expired=()=>Date.now()-started>maxMs;
  const first=await previewRevisedGuild(guild,t);
  if(!first.ok)throw Error("Preflight rejected revamp: "+first.issues.join(" | "));
  const report={code:t.server_code,guildId:guild.id,rolesCreated:[],rolesUpdated:[],
    categoriesCreated:[],categoriesUpdated:[],channelsCreated:[],channelsUpdated:[],
    channelsMoved:[],rolesReordered:false,skipped:[],errors:[],orphanObjects:first.orphans,
    noDeletions:true,memberRoleAssignmentsPreserved:true};
  const reason="Owner-confirmed in-place revised BSA "+t.server_code+" revamp";
  const deadline=()=>{if(expired()){
    report.errors.push("Safe time limit reached. Rerun /bsa-generate in this same server to resume.");
    return true;
  }return false;};
  const safe=async(label,fn)=>{
    try {return await fn();}catch(e){
      report.errors.push(label+": Discord error "+String(e?.code||"unknown"));
      return null;
    }
  };
  if(deadline())return report;
  // Roles first: editing the same role preserves Discord ID and assignments.
  const roleList=entries(await guild.roles.fetch());
  if(!roleList.some(r=>r.name===revampLock(t.server_code))){
    const lock=await safe("Builder lock",()=>guild.roles.create({
      name:revampLock(t.server_code),permissions:0n,hoist:false,mentionable:false,
      color:"#99A0A8",reason}));
    if(!lock)return report;
    roleList.push(lock);report.rolesCreated.push(lock.name);
  }
  for(const def of t.role_definitions){
    if(deadline())return report;
    const existing=roleList.find(r=>r.name===def.name);
    const props={color:def.color,permissions:bits(def.permissions),hoist:def.hoist,
      mentionable:def.mentionable,reason};
    if(existing){
      const want=safeRoleAttributes(def),old=actualRole(existing);
      if(Object.keys(old).some(k=>String(old[k])!==String(want[k]))){
        const edited=await safe("Update role "+def.name,()=>existing.edit(props));
        if(edited){report.rolesUpdated.push(def.name);
          Object.assign(existing,edited);}
      }
    }else{
      const created=await safe("Create role "+def.name,()=>guild.roles.create({name:def.name,...props}));
      if(created){roleList.push(created);report.rolesCreated.push(def.name);}
    }
  }
  // Rebuild names-> IDs after creation; never grant to guessed placeholders.
  const rolesNow=entries(await guild.roles.fetch());
  const roleIds=new Map(rolesNow.map(r=>[r.name,r.id]));
  if(t.role_definitions.some(r=>!roleIds.has(r.name))){
    report.errors.push("At least one required role could not be resolved; channel permissions were NOT applied.");
    return report;
  }
  if(deadline())return report;
  const member=await guild.members.fetchMe();
  const hierarchy=t.roles_top_to_bottom.map((name,i)=>({
    role:roleIds.get(name),position:t.roles_top_to_bottom.length-i
  }));
  if(member.roles?.highest?.position<=hierarchy.length){
    report.errors.push("Bot role is too low to guarantee correct hierarchy. Move it ABOVE the new roles and rerun.");
  }else{
    const set=await safe("Reorder role hierarchy",()=>guild.roles.setPositions(hierarchy));
    if(set!==null)report.rolesReordered=true;
  }
  await onProgress("Role colours, permissions and high-to-low hierarchy processed.");
  const current=entries(await guild.channels.fetch());
  const createdOrFoundCats=new Map();
  for(const [i,cat] of t.categories_top_to_bottom.entries()){
    if(deadline())return report;
    let parent=current.find(c=>c.type===catType&&c.name===cat.name);
    let rows;
    try{rows=policyOverwrites(t,cat,null,guild.id,roleIds,parent).rows;}
    catch(e){report.errors.push("Category policy "+cat.name+": "+e.message);continue;}
    if(parent){
      if(!normalizedEqual(overwriteRows(parent),rows)){
        const edited=await safe("Update category "+cat.name,()=>parent.edit({
          permissionOverwrites:rows.map(x=>({
            id:x.id,type:x.type,allow:x.allow,deny:x.deny
          })),reason}));
        if(edited)report.categoriesUpdated.push(cat.name);
      }
    }else{
      parent=await safe("Create category "+cat.name,()=>guild.channels.create({
        name:cat.name,type:catType,position:i,
        permissionOverwrites:rows.map(x=>({
          id:x.id,type:x.type,allow:x.allow,deny:x.deny
        })),reason}));
      if(!parent)continue;
      current.push(parent);report.categoriesCreated.push(cat.name);
    }
    createdOrFoundCats.set(cat.name,parent);
  }
  // Match by ID taken from the pre-confirmation plan. Never guess between
  // multiple same-name channels. Newly created category IDs are resolved now.
  const handled=new Set();
  for(const [i,cat] of t.categories_top_to_bottom.entries()){
    const parent=createdOrFoundCats.get(cat.name);
    if(!parent)continue;
    for(const [j,ch] of cat.channels.entries()){
      if(deadline())return report;
      const key=cat.name+"/"+ch.name;
      // Fetch fresh for each channel to avoid retry collisions.
      const now=entries(await guild.channels.fetch());
      const exact=now.filter(c=>c.type!==catType&&same(c.parentId,parent.id)&&
        normalizedChannelName(c.name)===normalizedChannelName(ch.name));
      const sourcePreview=first.channels.find(x=>x.section===cat.name&&x.name===ch.name);
      let found=sourcePreview?.id?now.find(c=>c.id===sourcePreview.id):exact[0];
      if(!found&&exact.length>1){
        report.errors.push("Ambiguous channel at apply: "+key);continue;
      }
      if(found&&handled.has(found.id)){
        report.errors.push("Channel already reconciled to another target: "+key);continue;
      }
      if(found&&found.type!==TYPE[ch.type]){
        report.errors.push("Type mismatch at apply: "+key);continue;
      }
      const currentRows=policyOverwrites(t,cat,ch,guild.id,roleIds,found).rows;
      const opts={name:ch.name,parent:parent.id,position:j,
        permissionOverwrites:currentRows.map(x=>({
          id:x.id,type:x.type,allow:x.allow,deny:x.deny
        })),reason};
      if(!found){
        found=await safe("Create channel "+key,()=>guild.channels.create({type:TYPE[ch.type],...opts}));
        if(found)report.channelsCreated.push(key);
      }else{
        const changes=found.name!==ch.name||!same(found.parentId,parent.id)||
          !normalizedEqual(overwriteRows(found),currentRows);
        if(changes){
          const priorParent=found.parentId;
          const changed=await safe("Update channel "+key,()=>found.edit(opts));
          if(changed){
            report.channelsUpdated.push(key);
            if(!same(priorParent,parent.id))report.channelsMoved.push(key);
          }
        }
      }
      if(found)handled.add(found.id);
    }
    await onProgress("Revamp categories "+(i+1)+"/"+t.categories_top_to_bottom.length+
      ", channels created "+report.channelsCreated.length+", updated "+report.channelsUpdated.length);
  }
  return report;
}
export async function auditRevisedGuild(guild,t){
  const p=await previewRevisedGuild(guild,t);
  const roleNames=t.role_definitions.map(r=>r.name);
  const issues=[...p.issues],warnings=[...p.warnings];
  if(!p.claimed)issues.push("Missing BSA builder lock");
  if(p.roleCreates.length)issues.push(p.roleCreates.length+" roles missing");
  if(p.roleEdits.length)issues.push(p.roleEdits.length+" roles need colours/permissions updates");
  if(p.categories.some(x=>x.action!=="reuse"))issues.push("Categories require reconciliation");
  if(p.channels.some(x=>x.action!=="reuse"))issues.push("Channels require reconciliation");
  if(p.needsHierarchy)issues.push("Rank hierarchy is not highest-to-lowest");
  return {code:t.server_code,guildId:guild.id,status:issues.length?"needs_changes":"reconciled",
    issues:[...new Set(issues)],warnings,summary:p.summary,accessTests:p.accessTests,
    roles:roleNames.length,channels:p.counts.channels,orphans:p.orphans,
    note:"Audit validates source-derived policy and simulated role visibility; use actual Discord test accounts to verify integration-specific permissions."};
}
