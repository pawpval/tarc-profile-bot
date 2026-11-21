import { ChannelType, PermissionFlagsBits } from "discord.js";
import { BSA_CHANNEL_EMOJIS, TOP_LEVEL, formatTargetName, validateBsaFormatMap } from "./channelFormatMap.js";

// Read-only planner. Every target is scoped to an original name AND an exact
// parent-category ID. This avoids confusing e.g. three different "bot-cmds".
const TYPE_BY_NAME = Object.freeze({
  text: ChannelType.GuildText,
  forum: ChannelType.GuildForum,
  voice: ChannelType.GuildVoice,
  stage: ChannelType.GuildStageVoice
});
const entries = collection => Array.isArray(collection) ? collection.filter(Boolean)
  : collection?.values ? [...collection.values()].filter(Boolean) : [];
const same = (a,b) => (a ?? null) === (b ?? null);
export const isFormatChannelType = type => Object.values(TYPE_BY_NAME).includes(type);

export function mayRenameBsaChannel(channel, botMember) {
  if (!isFormatChannelType(channel.type) || channel.manageable === false) return false;
  try {
    const permissions = botMember?.permissionsIn?.(channel) ?? channel.permissionsFor?.(botMember);
    return permissions?.has?.(PermissionFlagsBits.ManageChannels) === true;
  } catch {
    return false;
  }
}

export function planBsaFormat(template, rawChannels, botMember) {
  const mapValidation = validateBsaFormatMap(template);
  if (!mapValidation.ok) return {
    validation: mapValidation, changes: [], unchanged: [],
    missing: [], conflicts: [], unmatched: [], summary: {total: 100,rename:0,unchanged:0,missing:0,conflicts:0,unmatched:0}
  };
  const channels = entries(rawChannels);
  const consumed = new Set();
  const changes=[], unchanged=[], missing=[], conflicts=[];
  const categoryByName = new Map();
  for (const ch of channels) {
    if (ch.type!==ChannelType.GuildCategory) continue;
    if (!categoryByName.has(ch.name)) categoryByName.set(ch.name,[]);
    categoryByName.get(ch.name).push(ch);
  }
  function inspect(ch, section, parentId) {
    const desired = formatTargetName(section, ch.name);
    const key = section + "/" + ch.name;
    const candidates = channels.filter(x =>
      x.type!==ChannelType.GuildCategory && same(x.parentId,parentId) &&
      (x.name===ch.name || x.name===desired));
    if (!candidates.length) {
      missing.push({section,original:ch.name,target:desired,type:ch.type,reason:"No original or correctly formatted name under the expected parent"});
      return;
    }
    for (const candidate of candidates) consumed.add(candidate.id);
    if(candidates.length!==1) {
      conflicts.push({section,original:ch.name,target:desired,ids:candidates.map(c=>c.id),
        reason:"Multiple old/formatted matches in the same parent; refusing to guess"});
      return;
    }
    const candidate=candidates[0];
    if(candidate.type!==TYPE_BY_NAME[ch.type]){
      conflicts.push({section,original:ch.name,target:desired,id:candidate.id,
        reason:"Channel type mismatch: expected "+ch.type+", actual "+candidate.type});
      return;
    }
    if(candidate.name===desired){
      unchanged.push({section,original:ch.name,name:desired,id:candidate.id,parentId,type:candidate.type});
      return;
    }
    if(!mayRenameBsaChannel(candidate,botMember)){
      conflicts.push({section,original:ch.name,target:desired,id:candidate.id,
        reason:"Bot lacks Manage Channels on this channel, or channel is not manageable"});
      return;
    }
    changes.push({section,original:ch.name,before:candidate.name,after:desired,
      id:candidate.id,parentId,type:candidate.type});
  }
  // Top-level channels must have parentId=null, never any category.
  for(const ch of template.top_level_channels) inspect(ch,TOP_LEVEL,null);
  for(const category of template.categories){
    const matches = categoryByName.get(category.name) || [];
    if(matches.length!==1){
      for(const ch of category.channels) {
        const info={section:category.name,original:ch.name,target:formatTargetName(category.name,ch.name),
          type:ch.type,reason:matches.length?"Duplicate matching parent categories":"Missing parent category"};
        if(matches.length) conflicts.push(info); else missing.push(info);
      }
      continue;
    }
    for(const ch of category.channels) inspect(ch,category.name,matches[0].id);
  }
  const allExpectedCategoryIds = new Map(channels.filter(x=>x.type===ChannelType.GuildCategory).map(x=>[x.id,x.name]));
  const unmatched=channels.filter(x=>x.type!==ChannelType.GuildCategory && !consumed.has(x.id))
    .map(x=>({id:x.id,name:x.name,type:x.type,parentId:x.parentId??null,
      section:allExpectedCategoryIds.get(x.parentId) || (x.parentId ? "UNKNOWN CATEGORY" : TOP_LEVEL),
      reason:"Not present in the exact BSA mapping under this parent"}))
    .sort((a,b)=>(a.section.localeCompare(b.section)||a.name.localeCompare(b.name)||String(a.id).localeCompare(String(b.id))));
  return {validation:mapValidation,changes,unchanged,missing,conflicts,unmatched,
    summary:{total:mapValidation.mapped,rename:changes.length,unchanged:unchanged.length,
      missing:missing.length,conflicts:conflicts.length,unmatched:unmatched.length}};
}

export async function applyBsaFormatChanges(guild, changes, botMember, {
  onProgress = async () => {}, maxDurationMs=13*60*1000, now=Date.now
}={}) {
  const startedAt=now();
  const report={renamed:[],alreadyCorrect:[],skipped:[],failed:[],timedOut:false};
  for(const [index,item] of changes.entries()){
    if(now()-startedAt>maxDurationMs) {
      report.timedOut=true;
      for (const left of changes.slice(index)) report.skipped.push({id:left.id,reason:"Timed out; rerun /bsa-format"});
      break;
    }
    try {
      // Re-fetch by ID at the moment of action, to guard against reparenting,
      // unexpected renaming or channel deletion after preview.
      const channel=await guild.channels.fetch(item.id).catch(()=>null);
      if(!channel || (channel.guildId && channel.guildId!==guild.id) ||
        !same(channel.parentId,item.parentId) || channel.type!==item.type) {
        report.skipped.push({id:item.id,reason:"Channel missing, moved or changed type"});
        continue;
      }
      if(channel.name===item.after){
        report.alreadyCorrect.push({id:item.id,name:item.after});
        continue;
      }
      if(channel.name!==item.before || !mayRenameBsaChannel(channel,botMember)){
        report.skipped.push({id:item.id,reason:"Name changed or Manage Channels unavailable"});
        continue;
      }
      await channel.setName(item.after,"Owner-confirmed BSA channel emoji formatting");
      report.renamed.push({id:item.id,before:item.before,after:item.after});
    } catch (e) {
      // Safe error code only; no raw API response/token contents.
      report.failed.push({id:item.id,code:String(e?.code||"unknown")});
    }
    if((index+1)%8===0) await onProgress({done:index+1,total:changes.length,...report});
  }
  return report;
}
