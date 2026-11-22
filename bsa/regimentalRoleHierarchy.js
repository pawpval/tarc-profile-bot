// Discord's Role.position is a computed rank within all guild roles,
// whereas Role.rawPosition is the position returned by the Discord API.
// PATCH /guilds/:id/roles expects API/raw positions. Never submit the
// computed .position as an API target in a guild where the two differ.
const take=x=>Array.isArray(x)?x.filter(Boolean):x?.values?[...x.values()].filter(Boolean):[];
const errorCode=e=>String(e?.code??e?.rawError?.code??e?.status??"unknown");
const raw=r=>Number.isInteger(r?.rawPosition)?r.rawPosition:r?.position;

export function inspectRankOrder(guildRoles,botMember,highestToLowest){
  const roles=take(guildRoles),issues=[];
  const botId=botMember?.roles?.highest?.id;
  const botRole=roles.find(r=>r.id===botId)||botMember?.roles?.highest;
  const botPosition=botRole?.position;
  const botRawPosition=raw(botRole);
  if(!botId||!Number.isInteger(botPosition)||!Number.isInteger(botRawPosition)||
     botPosition<1||botRawPosition<1)
    issues.push("Could not verify the bot's highest role display and raw API positions.");

  const targets=[];
  const seen=new Set();
  for(const name of highestToLowest){
    const matches=roles.filter(r=>r.name===name);
    if(matches.length!==1){
      issues.push("Cannot uniquely identify rank role "+name);
      continue;
    }
    const r=matches[0],api=raw(r);
    if(seen.has(r.id))issues.push("Duplicate rank role ID "+r.id);
    seen.add(r.id);
    if(r.managed||r.id===botId)
      issues.push("Cannot manage a bot/integration-managed rank "+name);
    if(!Number.isInteger(r.position)||r.position<1||
       !Number.isInteger(api)||api<1)
      issues.push("Invalid role positions for "+name);
    else if(r.position>=botPosition||api>=botRawPosition)
      issues.push("TARC Assistant cannot reorder "+name+
        ": role display/raw "+r.position+"/"+api+
        ", bot display/raw "+botPosition+"/"+botRawPosition);
    targets.push({id:r.id,name,position:r.position,rawPosition:api});
  }
  const slots=targets.map(r=>r.rawPosition).sort((a,b)=>b-a);
  if(new Set(slots).size!==targets.length)
    issues.push("Some ranks share a Discord raw position; safe API mapping is ambiguous. "+
      "No roles moved. Check role-position diagnostics.");
  const ordered=issues.length===0&&targets.every((r,i)=>
    i===0||targets[i-1].position>r.position);
  const assignments=targets.map((r,i)=>({role:r.id,position:slots[i]}));
  return {ok:issues.length===0,issues,ordered,botPosition,botRawPosition,
    botRoleId:botId,actual:targets,assignments,highestRankSlot:slots[0]??null};
}

export async function reconcileRankOrder(guild,highestToLowest,{onProgress=async()=>{}}={}){
  const snapshot=async()=>{
    const [roles,bot]=await Promise.all([guild.roles.fetch(),guild.members.fetchMe()]);
    return inspectRankOrder(roles,bot,highestToLowest);
  };
  const first=await snapshot();
  const result={
    verified:false,applied:false,method:null,
    botPosition:first.botPosition,botRawPosition:first.botRawPosition,
    actual:first.actual,plannedAssignments:first.assignments,
    errors:[...first.issues],warnings:[],lastAttempt:null
  };
  if(!first.ok)return result;
  if(first.ordered){
    result.verified=true;result.method="already-ordered";return result;
  }
  try{
    result.lastAttempt={type:"batch",positions:first.assignments,
      botDisplay:first.botPosition,botRaw:first.botRawPosition};
    await guild.roles.setPositions(first.assignments);
    result.applied=true;result.method="batch-raw";
  }catch(e){
    const code=errorCode(e);
    if(code!=="50013"){
      result.errors.push("Bulk role reorder failed (Discord "+code+").");
      return result;
    }
    result.warnings.push("Discord 50013 on raw-position batch; trying single raw-position moves.");
    result.method="single-raw-fallback";
    for(const name of [...highestToLowest].reverse()){
      const now=await snapshot();
      if(!now.ok){
        result.errors.push(...now.issues);
        return result;
      }
      const target=now.actual.find(r=>r.name===name);
      if(target.rawPosition===now.highestRankSlot)continue;
      const destination=now.highestRankSlot;
      await onProgress("Correcting hierarchy: "+name);
      result.lastAttempt={
        type:"single",name,id:target.id,currentDisplay:target.position,
        currentRaw:target.rawPosition,requestedRaw:destination,
        botDisplay:now.botPosition,botRaw:now.botRawPosition
      };
      try{
        await guild.roles.setPositions([{role:target.id,position:destination}]);
        result.applied=true;
      }catch(singleErr){
        result.errors.push("Discord refused rank "+name+" ("+errorCode(singleErr)+
          "). Requested API raw position "+destination+" from "+target.rawPosition+
          "; bot raw position "+now.botRawPosition+
          ". Download result JSON for the exact request diagnostics.");
        return result;
      }
    }
  }
  const final=await snapshot();
  result.actual=final.actual;
  result.botPosition=final.botPosition;
  result.botRawPosition=final.botRawPosition;
  if(!final.ok){result.errors.push(...final.issues);return result;}
  if(!final.ordered){
    result.errors.push("Discord returned ranks in the wrong order after API update. "+
      "Raw/computed role positions are included in the result JSON.");
    return result;
  }
  result.verified=true;
  return result;
}
