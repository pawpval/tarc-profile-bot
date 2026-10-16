// TARC game rank progression is independent of Roblox group roles.
export const SERVICE_RANKS=[
["E0","Cadet",1],["E1","Private",2],["E2","Private Second Class",3],["E3","Private First Class",4],
["E4","Trooper",5],["E5","Specialist",7],["E6","Lance Corporal",9],["E7","Corporal",11],
["E8","Sergeant",14],["E9","Staff Sergeant",17],["E10","Master Sergeant",20],
["E11","Sergeant Major",24],["E12","Warrant Officer",28],["E13","Upper Warrant Officer",33],
["E14","Command Warrant Officer",38],["E15","Chief Warrant Officer",44],
["O1","Second Lieutenant",50],["O2","Lieutenant",58],["O3","Captain",67],["O4","Major",77],
["O5","Lieutenant Colonel",88],["O6","Colonel",100],
["C1","Battalion Commander",115],["C2","Regimental Commander",135],["C3","Marshal Commander",160],
["L1","Grand Marshal",190],["L2","Supreme Commander",225],["L3","Vice Chancellor",270],["L4","Supreme Chancellor",325]
];
export const LEAGUES=[
["Bronze",0,"🥉"],["Silver",1100,"🥈"],["Gold",1250,"🥇"],["Platinum",1450,"💠"],
["Diamond",1650,"💎"],["Master",1900,"🏅"],["Grandmaster",2200,"👑"],["Galactic Legend",2600,"🌌"]
];
export function serviceRank(level){
  let result=SERVICE_RANKS[0];
  for(const entry of SERVICE_RANKS){if(level>=entry[2])result=entry;else break;}
  const index=SERVICE_RANKS.indexOf(result);
  return {code:result[0],name:result[1],level:result[2],next:SERVICE_RANKS[index+1]||null};
}
export function competitiveLeague(elo){
  let result=LEAGUES[0];
  for(const entry of LEAGUES){if(elo>=entry[1])result=entry;else break;}
  const index=LEAGUES.indexOf(result);
  return {name:result[0],emoji:result[2],minimum:result[1],next:LEAGUES[index+1]||null};
}
