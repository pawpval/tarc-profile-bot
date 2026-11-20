import { ChannelType, PermissionFlagsBits, OverwriteType } from "discord.js";
import { categoryAccess, validateBsaTemplate } from "./builderCore.js";

const P = PermissionFlagsBits;
export const BSA_CHANNEL_TYPES = Object.freeze({
  text: ChannelType.GuildText,
  voice: ChannelType.GuildVoice,
  stage: ChannelType.GuildStageVoice,
  forum: ChannelType.GuildForum
});
const asArray = cache => cache?.values ? [...cache.values()].filter(Boolean) : [];
const indexByName = objects => {
  const map = new Map();
  for (const obj of objects) {
    if (!map.has(obj.name)) map.set(obj.name, []);
    map.get(obj.name).push(obj);
  }
  return map;
};
const findUnique = (values, name) => (values.get(name)?.length === 1 ? values.get(name)[0] : null);
const hex = number => "#" + Number(number || 0).toString(16).padStart(6,"0").toUpperCase();

export function roleMapFor(guild, roles) {
  const found = indexByName(asArray(roles));
  const ids = new Map();
  for (const role of guild.roles.cache.values()) if (role.id === guild.id) ids.set("@everyone", role);
  for (const r of asArray(roles)) if (r.id === guild.id) ids.set("@everyone",r);
  for (const wanted of guild.__bsaTemplateRoles || []) {
    const match = findUnique(found,wanted.name);
    if (match) ids.set(wanted.name,match);
  }
  return ids;
}
export function mapTemplateRoles(guild, template, roles = guild.roles.cache) {
  const found = indexByName(asArray(roles));
  const ids = new Map([["@everyone",{id:guild.id,name:"@everyone"}]]);
  for (const r of template.roles || []) {
    const match = findUnique(found,r.name);
    if (match) ids.set(r.name,match);
  }
  return ids;
}

export function createOverwrites(guildId, view, post, kind, roleMap) {
  const all = new Map();
  const v = new Set(view), postSet = new Set(post);
  const everyone = {id:guildId,type:OverwriteType.Role,allow:[],deny:[]};
  all.set("@everyone",everyone);
  const publicView = v.has("@everyone");
  (publicView ? everyone.allow : everyone.deny).push(P.ViewChannel);
  const writers = kind==="text" ? [P.SendMessages] :
    kind==="forum" ? [P.SendMessages,P.CreatePublicThreads,P.SendMessagesInThreads] :
    kind==="voice" ? [P.Connect,P.Speak] :
    kind==="stage" ? [P.Connect] : [];
  for (const bit of writers) {
    const publicPost = kind==="voice" || kind==="stage" ? publicView : postSet.has("@everyone");
    (publicPost ? everyone.allow : everyone.deny).push(bit);
  }
  for (const name of new Set([...v,...postSet])) {
    if (name === "@everyone") continue;
    const role = roleMap.get(name);
    if (!role?.id) throw new Error("Missing referenced role: " + name);
    const ow = {id:role.id,type:OverwriteType.Role,allow:[],deny:[]};
    if (v.has(name)) ow.allow.push(P.ViewChannel);
    const canWrite = kind==="voice" || kind==="stage" ? v.has(name) : postSet.has(name);
    if (canWrite) ow.allow.push(...writers);
    all.set(name,ow);
  }
  return [...all.values()];
}
export function channelOverwrites(guild, ch, roleMap) {
  return createOverwrites(guild.id, ch.access.view, ch.access.post, ch.type, roleMap);
}
export function categoryOverwrites(guild, category, roleMap) {
  return createOverwrites(guild.id, categoryAccess(category), [], "category", roleMap);
}

export async function bsaPreflight(guild, template, checked) {
  const failures = [...checked.errors], warnings = [...checked.warnings];
  const me = await guild.members.fetchMe().catch(()=>null);
  if (!me) failures.push("Bot membership could not be fetched. Cannot verify management permissions.");
  const have = name => me?.permissions?.has(P[name]) === true;
  for (const name of ["ManageRoles","ManageChannels"]) {
    if (!have(name)) failures.push("The bot needs " + name + " in the BSA guild.");
  }
  if (checked.counts.forum + checked.counts.stage > 0 && !guild.features?.includes("COMMUNITY"))
    failures.push("Enable Discord Community in the new BSA server first. Forum and Stage channels require Community features.");
  const existingRoles = asArray(await guild.roles.fetch());
  const duplicates = indexByName(existingRoles);
  for (const role of template.roles || []) {
    const existing = duplicates.get(role.name) || [];
    if (existing.length > 1) failures.push("More than one existing role named " + role.name + "; cannot reuse safely.");
    for (const found of existing) {
      if (found.managed) failures.push("Role " + role.name + " is managed by an integration and cannot be reused.");
      if (found.permissions?.has?.(P.Administrator)) failures.push("Existing role " + role.name + " has Administrator permission; refusing to reuse it.");
      if (me && found.position >= me.roles.highest.position) failures.push("Bot role must be higher than existing role " + role.name + ".");
    }
  }
  const existingChannels = asArray(await guild.channels.fetch());
  const count = existingChannels.length;
  if (count + checked.counts.channels + checked.counts.categories > 490)
    warnings.push("Server may approach Discord's channel limit. Existing objects are reused where possible.");
  return {ok:failures.length===0,errors:[...new Set(failures)],warnings:[...new Set(warnings)],me,existingRoles,existingChannels};
}
const same = (a,b) => String(a) === String(b);
export function inspectBsaPlan(guild, template, existingRoles, existingChannels) {
  const roleNames = indexByName(existingRoles);
  const categories = indexByName(existingChannels.filter(x=>x.type===ChannelType.GuildCategory));
  const result = {createRoles:[],reuseRoles:[],createCategories:[],reuseCategories:[],createChannels:[],reuseChannels:[],renameChannels:[],conflicts:[],extras:[]};
  for (const r of template.roles) {
    const list = roleNames.get(r.name) || [];
    if (!list.length) result.createRoles.push(r.name);
    else if (list.length===1) result.reuseRoles.push(r.name);
    else result.conflicts.push("Ambiguous role: " + r.name);
  }
  for (const cat of template.categories) {
    const list=categories.get(cat.name)||[];
    if (!list.length) result.createCategories.push(cat.name);
    else if (list.length===1) result.reuseCategories.push(cat.name);
    else result.conflicts.push("Ambiguous category: " + cat.name);
  }
  function examine(ch, parentName=null) {
    const category = parentName ? findUnique(categories,parentName) : null;
    const matches=existingChannels.filter(x=>x.type!==ChannelType.GuildCategory &&
      x.name===ch.name && same(x.parentId??null,category?.id??null));
    const qualified = (parentName || "TOP LEVEL") + "/" + ch.name;
    if (matches.length>1) result.conflicts.push("Duplicate existing channels: " + qualified);
    else if (matches.length===1) {
      if (matches[0].type!==BSA_CHANNEL_TYPES[ch.type]) result.conflicts.push("Wrong channel type: " + qualified);
      else result.reuseChannels.push(qualified);
    } else if (parentName==="LOGGING SECTOR" && ch.name==="server-logs" && category) {
      const legacy=existingChannels.filter(x=>x.parentId===category.id && x.name==="dyno-logs");
      if (legacy.length===1 && legacy[0].type===ChannelType.GuildText) result.renameChannels.push(qualified);
      else if (legacy.length) result.conflicts.push("Legacy dyno-logs type/duplication conflict.");
      else result.createChannels.push(qualified);
    } else result.createChannels.push(qualified);
  }
  for (const ch of template.top_level_channels) examine(ch);
  for (const cat of template.categories) for (const ch of cat.channels) examine(ch,cat.name);
  return result;
}

export async function buildBsaGuild(guild, template, onProgress = async()=>{}) {
  const validation=validateBsaTemplate(template);
  if (!validation.ok) throw new Error("Template has validation blockers: " + validation.errors.join(" | "));
  const preflight=await bsaPreflight(guild,template,validation);
  if (!preflight.ok) throw new Error("Preflight blocked: " + preflight.errors.join(" | "));
  const plan=inspectBsaPlan(guild,template,preflight.existingRoles,preflight.existingChannels);
  if (plan.conflicts.length) throw new Error("Existing layout conflicts: " + plan.conflicts.join(" | "));
  const report={createdRoles:[],createdCategories:[],createdChannels:[],renamedChannels:[],reused:[],warnings:[...preflight.warnings],errors:[]};
  const safetyReason="BSA V4 approved template; owner confirmed temporary builder";
  let existingRoles=preflight.existingRoles;
  // Build low ranks first, then assign exact top-to-bottom role positions.
  for (const role of [...template.roles].reverse()) {
    if (existingRoles.some(x=>x.name===role.name)) { report.reused.push("role/"+role.name); continue; }
    const created=await guild.roles.create({name:role.name,color:role.color,hoist:false,mentionable:false,
      permissions:0n,reason:safetyReason});
    report.createdRoles.push(created.name);
    existingRoles.push(created);
    if (report.createdRoles.length%12===0) await onProgress("Created "+report.createdRoles.length+" roles...");
  }
  const roleMap=mapTemplateRoles(guild,template,existingRoles);
  const missing=template.roles.filter(r=>!roleMap.has(r.name));
  if (missing.length) throw new Error("Roles missing after creation: " + missing.map(x=>x.name).join(", "));
  // Try to move desired roles below the bot's highest role, without deleting
  // integration-created roles. Discord itself enforces manageability.
  const bot=await guild.members.fetchMe();
  const highest=bot.roles.highest.position;
  if (highest<=template.roles.length) report.warnings.push("Bot's role is too low to set complete hierarchy; verify ordering manually.");
  else {
    try {
      const positions=template.roles.map((r,i)=>({role:roleMap.get(r.name).id,position:template.roles.length-i}));
      await guild.roles.setPositions(positions);
    } catch (error) {report.errors.push("Role hierarchy adjustment failed: "+String(error.code||error.message).slice(0,120));}
  }
  await onProgress("Role phase finished. Building categories and channels...");
  const current=asArray(await guild.channels.fetch());
  async function createOne(ch, parentId=null, index=0, name=ch.name) {
    const sameName=current.filter(c=>c.parentId===(parentId||null) && c.name===name);
    if (sameName.length>1) {report.errors.push("Duplicate existing channel "+name+"; skipped.");return null;}
    if (sameName.length===1) {
      if (sameName[0].type!==BSA_CHANNEL_TYPES[ch.type]) report.errors.push("Wrong channel type "+name+"; existing channel untouched.");
      else report.reused.push("channel/"+name);
      return sameName[0];
    }
    const created=await guild.channels.create({name,type:BSA_CHANNEL_TYPES[ch.type],
      parent:parentId||undefined,position:index,
      permissionOverwrites:channelOverwrites(guild,ch,roleMap),reason:safetyReason});
    current.push(created);report.createdChannels.push((parentId||"TOP")+"/"+name);
    return created;
  }
  // Top-level channels have no parent; each is created with explicit overwrites.
  for (const [i,ch] of template.top_level_channels.entries()) {
    try {await createOne(ch,null,i);} catch(e){report.errors.push("TOP/"+ch.name+": "+String(e.code||e.message).slice(0,130));}
  }
  for (const [catIndex,cat] of template.categories.entries()) {
    let parent=current.find(c=>c.type===ChannelType.GuildCategory && c.name===cat.name);
    if (!parent) {
      try {
        parent=await guild.channels.create({name:cat.name,type:ChannelType.GuildCategory,position:catIndex,
          permissionOverwrites:categoryOverwrites(guild,cat,roleMap),reason:safetyReason});
        report.createdCategories.push(cat.name);current.push(parent);
      } catch(e){report.errors.push("Category "+cat.name+": "+String(e.code||e.message).slice(0,130));continue;}
    } else report.reused.push("category/"+cat.name);
    for (const [i,ch] of cat.channels.entries()) {
      const existing=current.filter(c=>c.parentId===parent.id && c.name===ch.name);
      if (!existing.length && cat.name==="LOGGING SECTOR" && ch.name==="server-logs") {
        const legacy=current.filter(c=>c.parentId===parent.id && c.name==="dyno-logs");
        if (legacy.length===1 && legacy[0].type===ChannelType.GuildText) {
          try {
            const changed=await legacy[0].setName("server-logs",safetyReason);
            const idx=current.indexOf(legacy[0]);if(idx!==-1)current[idx]=changed;
            report.renamedChannels.push("dyno-logs -> server-logs");
            continue;
          } catch(e){report.errors.push("Could not rename dyno-logs: "+String(e.code||e.message));continue;}
        }
      }
      try {await createOne(ch,parent.id,i);}
      catch(e){report.errors.push(cat.name+"/"+ch.name+": "+String(e.code||e.message).slice(0,130));}
    }
    await onProgress("Categories "+(catIndex+1)+"/"+template.categories.length+
      ", channels created "+report.createdChannels.length+"...");
  }
  // Never delete legacy pings or any other extra BSA object.
  return report;
}

export async function auditBsaGuild(guild, template) {
  const validation=validateBsaTemplate(template);
  const issues=[...validation.errors.map(x=>"TEMPLATE: "+x)];
  const warnings=[...validation.warnings];
  const roles=asArray(await guild.roles.fetch());
  const channels=asArray(await guild.channels.fetch());
  const byRole=indexByName(roles);
  const roleMap=mapTemplateRoles(guild,template,roles);
  let matched=0;
  for (const [i,wanted] of template.roles.entries()) {
    const found=byRole.get(wanted.name)||[];
    if (!found.length) issues.push("Missing role: "+wanted.name);
    else if (found.length>1) issues.push("Duplicate role: "+wanted.name);
    else {
      matched++;
      if (hex(found[0].color)!==wanted.color.toUpperCase()) issues.push("Role colour mismatch: "+wanted.name);
      if (found[0].permissions?.has?.(P.Administrator)) issues.push("Unexpected Administrator permission: "+wanted.name);
      const prev=i?byRole.get(template.roles[i-1].name)?.[0]:null;
      if (prev && prev.position<=found[0].position) issues.push("Role hierarchy order wrong: "+prev.name+" / "+wanted.name);
    }
  }
  function auditOne(name,kind,parentId,expected,category=false) {
    const candidates=channels.filter(c=>c.name===name&&c.parentId===(parentId||null));
    const id=(parentId||"TOP")+"/"+name;
    if (!candidates.length){issues.push("Missing "+(category?"category":"channel")+": "+id);return null;}
    if(candidates.length>1){issues.push("Duplicate "+id);return null;}
    const obj=candidates[0];
    const type=category?ChannelType.GuildCategory:BSA_CHANNEL_TYPES[kind];
    if(obj.type!==type) issues.push("Wrong channel type: "+id);
    if (expected) {
      const existing=new Map(asArray(obj.permissionOverwrites?.cache).map(x=>[String(x.id),x]));
      for (const e of expected) {
        const found=existing.get(String(e.id));
        if(!found){issues.push("Missing permission overwrite: "+id+" / "+e.id);continue;}
        const bits=items=>items.reduce((acc,x)=>acc|BigInt(x),0n);
        if (BigInt(found.allow?.bitfield??0) !== bits(e.allow) || BigInt(found.deny?.bitfield??0)!==bits(e.deny))
          issues.push("Permission mismatch: "+id+" / "+e.id);
        existing.delete(String(e.id));
      }
      for (const extra of existing.keys()) issues.push("Unexpected permission overwrite: "+id+" / "+extra);
    }
    return obj;
  }
  let currentChannels = 0;
  for(const ch of template.top_level_channels) {
    const can=ch.access.view.every(n=>roleMap.has(n))&&ch.access.post.every(n=>roleMap.has(n));
    const perms=can?channelOverwrites(guild,ch,roleMap):null;
    if(auditOne(ch.name,ch.type,null,perms)) currentChannels++;
  }
  const categoryObjects=[];
  for (const category of template.categories) {
    const known=categoryAccess(category).every(n=>roleMap.has(n));
    const perms=known?categoryOverwrites(guild,category,roleMap):null;
    const cat=auditOne(category.name,null,null,perms,true);
    if(cat) categoryObjects.push(cat);
    for(const ch of category.channels) {
      const mapped=ch.access.view.every(n=>roleMap.has(n))&&ch.access.post.every(n=>roleMap.has(n));
      const spec=mapped?channelOverwrites(guild,ch,roleMap):null;
      if(cat && auditOne(ch.name,ch.type,cat.id,spec)) currentChannels++;
    }
    if(cat && category.name==="OFFICER STAFF SECTOR" &&
      channels.some(c=>c.parentId===cat.id&&c.name==="pings")) warnings.push("Legacy Officer Staff/pings exists; delete it manually if unwanted.");
  }
  // Compare relative order among desired objects; do not flag unrelated extra channels as reorder issues.
  function order(list,folder) {
    let prior=null;
    for(const ch of list){
      const matches=channels.filter(c=>c.name===ch.name&&c.parentId===(folder?.id??null));
      if(matches.length===1){
        if(prior && (Number(prior.rawPosition??prior.position)>Number(matches[0].rawPosition??matches[0].position)))
          issues.push("Channel order mismatch: "+prior.name+" should precede "+ch.name);
        prior=matches[0];
      }
    }
  }
  order(template.top_level_channels,null);
  for(const cat of template.categories){
    const parent=categoryObjects.find(c=>c.name===cat.name);
    if(parent)order(cat.channels,parent);
  }
  order(template.categories.map(c=>({name:c.name})),null);
  return {status:issues.length?"mismatches_found":"matches_template",
    templateVersion:template.version,matchedRoles:matched,foundChannels:currentChannels,issues,warnings,
    expected:{roles:template.roles.length,categories:template.categories.length,
      channels:template.top_level_channels.length+template.categories.reduce((n,c)=>n+c.channels.length,0)}};
}
