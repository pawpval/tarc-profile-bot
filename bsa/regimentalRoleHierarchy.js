// Reorder only known regimental roles. Discord positions are not a fixed,
// contiguous 1..N block: bot/integration/lock roles also occupy positions and
// newly created roles can shift the bot's numerical position. The manager only
// needs to sit above each EXISTING target role, not above the number N.
const take = x => Array.isArray(x) ? x.filter(Boolean) :
  x?.values ? [...x.values()].filter(Boolean) : [];

const codeOf = e => String(e?.code ?? e?.status ?? "unknown");

export function inspectRankOrder(guildRoles, botMember, highestToLowest) {
  const roles = take(guildRoles);
  const issues = [];
  const botHighestId = botMember?.roles?.highest?.id;
  const botRole = roles.find(r => r.id === botHighestId);
  const botPosition = Number(botRole?.position ?? botMember?.roles?.highest?.position ?? NaN);
  if (!botHighestId || !Number.isInteger(botPosition) || botPosition < 1) {
    issues.push("Bot's highest role could not be verified from Discord's live role list.");
  }

  const targets = [];
  const seen = new Set();
  for (const name of highestToLowest) {
    const matches = roles.filter(r => r.name === name);
    if (matches.length !== 1) {
      issues.push("Rank cannot be uniquely resolved: " + name);
      continue;
    }
    const r = matches[0];
    if (seen.has(r.id)) issues.push("Duplicate rank role ID: " + r.id);
    seen.add(r.id);
    if (r.managed || r.id === botHighestId) {
      issues.push("Cannot reposition a managed or bot role: " + name);
    }
    if (!Number.isInteger(r.position) || r.position < 1) {
      issues.push("Invalid current Discord rank position for " + name);
    } else if (Number.isInteger(botPosition) && r.position >= botPosition) {
      issues.push("Bot's highest role is not above " + name +
        ". Move the bot role above this rank in Server Settings → Roles.");
    }
    targets.push({id:r.id,name,position:r.position});
  }
  const slotPositions = targets.map(r => r.position).sort((a,b)=>b-a);
  if (new Set(slotPositions).size !== targets.length)
    issues.push("Discord returned duplicate rank positions. Refresh the server role list before changing hierarchy.");
  const ordered = issues.length === 0 && targets.every((r,i) =>
    i===0 || targets[i-1].position > r.position);
  // Permute positions occupied by these rank roles. Do not use fixed indices
  // like 1..N or botPosition-1; neither respects existing managed roles.
  const assignments = targets.map((r,i)=>({role:r.id,position:slotPositions[i]}));
  return {ok:issues.length===0,issues,ordered,botPosition,botRoleId:botHighestId,
    actual:targets,assignments,highestRankSlot:slotPositions[0]??null};
}

export async function reconcileRankOrder(guild, highestToLowest, {
  onProgress = async () => {}
}={}) {
  const snapshot = async () => {
    const [roles,bot] = await Promise.all([guild.roles.fetch(),guild.members.fetchMe()]);
    return inspectRankOrder(roles,bot,highestToLowest);
  };
  const first = await snapshot();
  const result = {verified:false,applied:false,method:null,botPosition:first.botPosition,
    actual:first.actual,errors:[...first.issues],warnings:[]};
  if (!first.ok) return result;
  if (first.ordered) {
    result.verified=true;
    result.method="already-ordered";
    return result;
  }

  try {
    await guild.roles.setPositions(first.assignments);
    result.applied=true;
    result.method="batch";
  } catch (e) {
    const errorCode=codeOf(e);
    if (errorCode !== "50013") {
      result.errors.push("Bulk Discord role reorder failed (code " + errorCode + ").");
      return result;
    }
    // Some guilds reject a multi-role PATCH even when all target roles are
    // beneath the bot's top role. Try tightly scoped single-role moves, without
    // touching bot, integration, unrelated or other-regiment roles.
    result.warnings.push("Bulk role reorder rejected with 50013; attempting rank-by-rank fallback.");
    result.method="per-role-fallback";
    for (const name of [...highestToLowest].reverse()) {
      const now=await snapshot();
      if(!now.ok){
        result.errors.push(...now.issues);
        return result;
      }
      const target=now.actual.find(r=>r.name===name);
      if(target.position===now.highestRankSlot)continue;
      await onProgress("Repairing role order: "+name);
      try {
        await guild.roles.setPositions([{role:target.id,position:now.highestRankSlot}]);
        result.applied=true;
      } catch (singleErr) {
        result.errors.push("Discord refused to move rank "+name+" (code "+
          codeOf(singleErr)+"). Check its position relative to the bot.");
        return result;
      }
    }
  }

  const final = await snapshot();
  result.actual=final.actual;
  result.botPosition=final.botPosition;
  if(!final.ok){
    result.errors.push(...final.issues);
    return result;
  }
  if(!final.ordered){
    result.errors.push("Discord did not apply the requested highest-to-lowest rank order.");
    return result;
  }
  result.verified=true;
  return result;
}
