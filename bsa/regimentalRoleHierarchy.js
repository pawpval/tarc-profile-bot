// Discord may assign identical rawPosition values (often 1) to many roles
// created sequentially. Role.position is the computed DISPLAY order, while
// rawPosition is diagnostic only. Never derive a target from rawPosition or
// require raw values to be unique.
//
// Reliable role ordering: take ranks in desired HIGH -> LOW order, and move
// each to the very BOTTOM of the manageable role range, one at a time, with
// discord.js RoleManager#setPosition. After all moves, the first processed
// rank is highest, the last processed rank is lowest. This never requests a
// position above the bot, so it works even when all rawPosition values are 1.
// No roles are deleted/recreated or member assignments changed.

const take=x=>Array.isArray(x)?x.filter(Boolean):x?.values?[...x.values()].filter(Boolean):[];
const errorCode=e=>String(e?.code??e?.rawError?.code??e?.status??"unknown");
const raw=r=>Number.isInteger(r?.rawPosition)?r.rawPosition:r?.position;

export function inspectRankOrder(guildRoles,botMember,highestToLowest){
  const roles=take(guildRoles),issues=[];
  const botId=botMember?.roles?.highest?.id;
  const bot=roles.find(r=>r.id===botId)||botMember?.roles?.highest;
  const botPosition=bot?.position;
  const botRawPosition=raw(bot);
  if(!botId||!Number.isInteger(botPosition)||botPosition<=0)
    issues.push("TARC Assistant's position could not be confirmed.");

  const targets=[];
  const usedIds=new Set();
  for(const name of highestToLowest){
    const found=roles.filter(r=>r.name===name);
    if(found.length!==1){
      issues.push("Expected exactly one rank named "+name+"; found "+found.length+".");
      continue;
    }
    const r=found[0];
    if(usedIds.has(r.id))issues.push("Repeated rank role ID: "+r.id);
    usedIds.add(r.id);
    if(r.managed||r.id===botId)issues.push("Cannot reorder managed/bot role "+name);
    if(!Number.isInteger(r.position)||r.position<1)
      issues.push("Invalid displayed position for "+name);
    else if(Number.isInteger(botPosition)&&r.position>=botPosition)
      issues.push("TARC Assistant is not above "+name+
        " (rank #"+r.position+", bot #"+botPosition+").");
    targets.push({id:r.id,name,position:r.position,rawPosition:raw(r)});
  }
  // Same rawPosition on several roles is NORMAL. The display order remains
  // unique and already encodes the server's actual hierarchy.
  const ordered=issues.length===0&&targets.every((r,i)=>
    i===0||targets[i-1].position>r.position);
  const duplicates=targets.reduce((m,r)=>
    (m.set(r.rawPosition,(m.get(r.rawPosition)||0)+1),m),new Map());
  return {ok:issues.length===0,issues,ordered,botPosition,botRawPosition,
    botRoleId:botId,actual:targets,
    rawTies:[...duplicates].filter(([,count])=>count>1).map(([position,count])=>({position,count}))};
}

export async function reconcileRankOrder(guild,highestToLowest,{onProgress=async()=>{}}={}){
  const snapshot=async()=>{
    const [roles,member]=await Promise.all([guild.roles.fetch(),guild.members.fetchMe()]);
    return inspectRankOrder(roles,member,highestToLowest);
  };
  const first=await snapshot();
  const result={
    verified:false,applied:false,method:null,
    botPosition:first.botPosition,botRawPosition:first.botRawPosition,
    actual:first.actual,rawTies:first.rawTies,
    errors:[...first.issues],warnings:[],lastAttempt:null,
    movesCompleted:0
  };
  if(!first.ok)return result;
  if(first.ordered){
    result.verified=true;
    result.method="already-ordered";
    return result;
  }
  if(typeof guild.roles.setPosition!=="function"){
    result.errors.push("Discord.js RoleManager.setPosition is unavailable. "+
      "No hierarchy change was attempted.");
    return result;
  }

  result.method="bottom-up-single-role";
  // Put Field Marshal at the bottom first, then CGS beneath it, then D-CGS
  // beneath CGS, and so on. At completion Field Marshal is the highest rank.
  // Always move to position 1, rather than above the bot or to a large raw
  // position that could trigger error 50013.
  for(const name of highestToLowest){
    const now=await snapshot();
    if(!now.ok){result.errors.push(...now.issues);return result;}
    const role=now.actual.find(r=>r.name===name);
    result.lastAttempt={
      name,roleId:role.id,requestedPosition:1,
      currentDisplayPosition:role.position,currentRawPosition:role.rawPosition,
      botDisplayPosition:now.botPosition,botRawPosition:now.botRawPosition
    };
    await onProgress("Ordering regimental role: "+name);
    try{
      await guild.roles.setPosition(role.id,1);
      result.applied=true;
      result.movesCompleted++;
    }catch(e){
      result.errors.push("Discord rejected moving "+name+" to bottom rank position 1 "+
        "(code "+errorCode(e)+"). Bot display position "+now.botPosition+
        ". No roles were deleted; rerun after reviewing permissions.");
      return result;
    }
  }
  const final=await snapshot();
  result.actual=final.actual;
  result.botPosition=final.botPosition;
  result.botRawPosition=final.botRawPosition;
  result.rawTies=final.rawTies;
  if(!final.ok){result.errors.push(...final.issues);return result;}
  if(!final.ordered){
    result.errors.push("Discord returned an incorrect role order after the individual moves. "+
      "Actual positions are attached for troubleshooting.");
    return result;
  }
  result.verified=true;
  return result;
}
