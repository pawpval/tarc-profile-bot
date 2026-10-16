import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } from "discord.js";
import { getPlayer, mutatePlayer, getLevelProgress } from "./gameState.js";

const JOBS=[
  {id:"courier",name:"Coruscant Courier",pay:240,xp:90,wait:15*60000},
  {id:"mechanic",name:"Droid Mechanic",pay:420,xp:140,wait:30*60000},
  {id:"security",name:"Security Contractor",pay:650,xp:220,wait:45*60000}
];
const RECIPES=[
  {id:"scanner",name:"Recon Scanner",parts:5,credits:500,level:2,description:"Adds 15% to job payouts while equipped"},
  {id:"armour",name:"Reinforced Armour",parts:9,credits:1200,level:5,description:"Reduces heist losses by 40%"},
  {id:"kit",name:"Infiltration Kit",parts:12,credits:1800,level:8,description:"Improves heist success chance by 15%"}
];
const FACTIONS={republic:"Galactic Republic",cis:"Separatist Alliance",neutral:"Independent Syndicate"};
const fmt=n=>Math.floor(Number(n)||0).toLocaleString("en-GB");
const btn=(id,label,style=ButtonStyle.Secondary)=>new ButtonBuilder().setCustomId("world:"+id).setLabel(label).setStyle(style);
const rows=()=>[
  new ActionRowBuilder().addComponents(btn("jobs","💼 Earn Credits",ButtonStyle.Success),btn("salvage","🔩 Collect Scrap",ButtonStyle.Primary)),
  new ActionRowBuilder().addComponents(btn("craft","🛠️ Craft Gear",ButtonStyle.Primary),btn("base","🏰 Upgrade Base",ButtonStyle.Success)),
  new ActionRowBuilder().addComponents(btn("heist","💰 Risk a Heist",ButtonStyle.Danger),btn("faction","🚩 Pick a Faction")),
  new ActionRowBuilder().addComponents(btn("home","↩ Back to Game"))
];
function init(p){
  p.world ||= {parts:0,faction:null,jobAt:{},salvageAt:0,heistAt:0,baseLevel:1,heistsWon:0,heistsLost:0};
  p.world.jobAt ||= {};
  return p.world;
}
async function show(i,note=""){
  const p=await getPlayer(i.user.id),w=init(p);
  const rank=getLevelProgress(p).level;
  const jobCount=Object.values(w.jobAt||{}).filter(Boolean).length;
  const crafted=["scanner","armour","kit"].filter(id=>p.inventory.includes("world_"+id)).length;
  const body=[
    note,
    "**YOUR WORLD PROGRESS**",
    "🎖️ Level **"+rank+"**  •  💵 **"+fmt(p.credits)+" Credits**",
    "🚩 **"+(FACTIONS[w.faction]||"No faction yet")+"**",
    "🏰 Base **"+w.baseLevel+"/20**  •  🛠️ Gear **"+crafted+"/3**",
    "🔩 Scrap **"+fmt(w.parts)+"**  •  💼 Jobs tried **"+jobCount+"/3**",
    "💰 Heists won **"+fmt(w.heistsWon)+"**",
    "",
    "**START HERE**",
    "🟢 **Earn Credits**: Take a job for XP and money.",
    "🔵 **Collect Scrap**: Find parts to make useful gear.",
    "🛠️ **Craft Gear**: Unlock perks for jobs and heists.",
    "🏰 **Upgrade Base**: Boost future job earnings.",
    "💰 **Risk a Heist**: Bigger rewards, but you can lose Credits.",
    "🚩 **Pick a Faction**: Choose your side.",
    "",
    "Everything uses your existing /game Credits and XP."
  ].filter(Boolean).join("\n");
  return i.update({embeds:[new EmbedBuilder().setColor(0x2b7fff).setTitle("🌆 CORUSCANT UNDERWORLD").setDescription(body)],components:rows()});
}
function select(id,placeholder,options){
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("world:"+id).setPlaceholder(placeholder).addOptions(options));
}
async function screen(i,type){
  const p=await getPlayer(i.user.id),w=init(p),now=Date.now();
  let title,description,components=[];
  if(type==="jobs"){
    title="💼 JOB BOARD";
    description="Take contracts for Credits and XP. Each job has its own cooldown. Crafted scanners boost payouts.";
    components=[select("job","Choose a contract",JOBS.map(j=>({label:j.name,value:j.id,description:fmt(j.pay)+" Credits, "+fmt(j.xp)+" XP | "+Math.round(j.wait/60000)+"m cooldown"})))];
  }else if(type==="craft"){
    title="🛠️ WORKBENCH";
    description="Scrap Parts: **"+fmt(w.parts)+"**\n"+RECIPES.map(r=>"**"+r.name+"** | "+r.parts+" parts + "+fmt(r.credits)+" Credits | Level "+r.level+"\n"+r.description+(p.inventory.includes("world_"+r.id)?" (Owned)":"")).join("\n\n");
    components=[select("make","Craft equipment",RECIPES.map(r=>({label:r.name,value:r.id,description:r.parts+" parts + "+fmt(r.credits)+" Credits"})))];
  }else if(type==="faction"){
    title="🚩 FACTIONS";
    description="Current faction: **"+(FACTIONS[w.faction]||"None")+"**\nChoose your allegiance. Switching factions costs 1,000 Credits after your first choice.";
    components=[select("join","Choose a faction",Object.entries(FACTIONS).map(([value,label])=>({value,label})))];
  }else if(type==="heist"){
    title="💰 UNDERWORLD HEIST";
    const remain=Math.max(0,60*60000-(now-w.heistAt));
    description="Risk **300 Credits** to attempt a heist. Win 900–1,400 Credits and 200 XP, or lose your stake. Infiltration Kits improve success and armour reduces losses.\n"+(remain?"Available in **"+Math.ceil(remain/60000)+" minutes**.":"**Ready now.**");
    components=[new ActionRowBuilder().addComponents(btn("doheist","Attempt Heist",ButtonStyle.Danger))];
  }else if(type==="base"){
    title="🏰 YOUR BASE";
    const cost=w.baseLevel*1600;
    description="Base Level: **"+w.baseLevel+"**\nUpgrade cost: **"+fmt(cost)+" Credits**\nEvery base level adds a small bonus to job income (5% per level after level 1). Maximum level 20.";
    components=[new ActionRowBuilder().addComponents(btn("upgrade","Upgrade Base",ButtonStyle.Success))];
  }
  components.push(new ActionRowBuilder().addComponents(btn("open","Back to World")));
  return i.update({embeds:[new EmbedBuilder().setColor(0x2b7fff).setTitle(title).setDescription(description)],components});
}
export async function handleWorldInteraction(i){
  if(!i.isButton()&&!i.isStringSelectMenu())return false;
  if(i.customId!=="game:world"&&!i.customId.startsWith("world:"))return false;
  const action=i.customId==="game:world"?"open":i.customId.slice(6);
  try{
    const owner=i.message?.interactionMetadata?.user?.id || i.message?.interaction?.user?.id;
    if(owner && owner!==i.user.id){await i.reply({content:"This game menu belongs to another player. Use /game to open your own.",ephemeral:true});return true;}
    if(action==="home"){
      await i.update({content:"Open /game to return to the main hub.",embeds:[],components:[]});return true;
    }
    if(action==="open"){await show(i);return true;}
    if(["jobs","craft","faction","heist","base"].includes(action)){await screen(i,action);return true;}
    if(action==="salvage"){
      let msg="";
      await mutatePlayer(i.user.id,p=>{
        const w=init(p),now=Date.now();
        if(now-w.salvageAt<20*60000){msg="Salvage is available again in "+Math.ceil((20*60000-(now-w.salvageAt))/60000)+" minutes.";return;}
        const amount=2+Math.floor(Math.random()*4);
        w.parts+=amount;w.salvageAt=now;msg="You recovered **"+amount+" Scrap Parts** from the Wastelands.";
      });
      await show(i,msg);return true;
    }
    if(action==="job"){
      const job=JOBS.find(x=>x.id===i.values?.[0]);if(!job)return true;
      let msg="";
      await mutatePlayer(i.user.id,p=>{
        const w=init(p),now=Date.now(),left=job.wait-(now-Number(w.jobAt[job.id]||0));
        if(left>0){msg="That contract is available in "+Math.ceil(left/60000)+" minutes.";return;}
        const bonus=1+(w.baseLevel-1)*.05+(p.inventory.includes("world_scanner") ? 0.15 : 0);
        const pay=Math.round(job.pay*bonus);
        p.credits+=pay;p.lifetimeCredits+=pay;p.xp+=job.xp;w.jobAt[job.id]=now;
        msg="Contract complete: **"+job.name+"**. +"+fmt(pay)+" Credits and +"+fmt(job.xp)+" XP.";
      });
      await show(i,msg);return true;
    }
    if(action==="make"){
      const recipe=RECIPES.find(x=>x.id===i.values?.[0]);if(!recipe)return true;
      let msg="";
      await mutatePlayer(i.user.id,p=>{
        const w=init(p),level=getLevelProgress(p).level;
        if(p.inventory.includes("world_"+recipe.id)){msg="You already own that equipment.";return;}
        if(level<recipe.level||w.parts<recipe.parts||p.credits<recipe.credits){msg="You need Level "+recipe.level+", "+recipe.parts+" parts and "+fmt(recipe.credits)+" Credits.";return;}
        w.parts-=recipe.parts;p.credits-=recipe.credits;p.inventory.push("world_"+recipe.id);msg="Crafted **"+recipe.name+"**. Its perk is now active.";
      });
      await show(i,msg);return true;
    }
    if(action==="join"){
      const choice=i.values?.[0];if(!FACTIONS[choice])return true;
      let msg="";
      await mutatePlayer(i.user.id,p=>{
        const w=init(p);
        if(w.faction===choice){msg="You're already in that faction.";return;}
        if(w.faction&&p.credits<1000){msg="Switching factions costs 1,000 Credits.";return;}
        if(w.faction)p.credits-=1000;
        w.faction=choice;msg="You joined **"+FACTIONS[choice]+"**.";
      });
      await show(i,msg);return true;
    }
    if(action==="upgrade"){
      let msg="";
      await mutatePlayer(i.user.id,p=>{
        const w=init(p),cost=w.baseLevel*1600;
        if(w.baseLevel>=20){msg="Your base is already max level.";return;}
        if(p.credits<cost){msg="You need "+fmt(cost)+" Credits.";return;}
        p.credits-=cost;w.baseLevel++;msg="Base upgraded to **Level "+w.baseLevel+"**.";
      });
      await show(i,msg);return true;
    }
    if(action==="doheist"){
      let msg="";
      await mutatePlayer(i.user.id,p=>{
        const w=init(p),now=Date.now();
        if(now-w.heistAt<60*60000){msg="Your crew needs more time before another heist.";return;}
        if(p.credits<300){msg="You need at least 300 Credits to attempt a heist.";return;}
        w.heistAt=now;
        const success=Math.random()<(p.inventory.includes("world_kit") ? 0.65 : 0.5);
        if(success){
          const reward=900+Math.floor(Math.random()*501);
          p.credits+=reward;p.lifetimeCredits+=reward;p.xp+=200;w.heistsWon++;
          msg="Heist successful! **+"+fmt(reward)+" Credits**, **+200 XP**.";
        }else{
          const loss=p.inventory.includes("world_armour")?180:300;
          p.credits-=loss;w.heistsLost++;
          msg="Heist failed. You lost **"+fmt(loss)+" Credits**.";
        }
      });
      await show(i,msg);return true;
    }
    return true;
  }catch(err){
    console.error("[WORLD]",err);
    if(i.deferred||i.replied)await i.followUp({content:"World action failed. Please try again.",ephemeral:true}).catch(()=>{});
    else await i.reply({content:"World action failed. Please try again.",ephemeral:true}).catch(()=>{});
    return true;
  }
}
