import {PermissionFlagsBits as P,OverwriteType} from "discord.js";

export const REVISED_BASE_FLAGS=[
 "ViewChannel","ReadMessageHistory","SendMessages","EmbedLinks","AttachFiles",
 "UseApplicationCommands","Connect","Speak"
];
export const HEADQUARTERS=["Field Marshal","Chief of General Staff","Deputy Chief of General Staff",
 "Assistant Chief of General Staff","Army Sergeant Major"];
export const CHANNEL_FLAGS=["ViewChannel","SendMessages","ReadMessageHistory","Connect","Speak",
 "SendMessagesInThreads","CreatePublicThreads","CreatePrivateThreads","UseApplicationCommands"];
export const channelBaseName=name=>String(name||"").replace(/^.*?│/u,"").toLowerCase();
export const channelKey=name=>channelBaseName(name).replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const patterns={
 command:/^(Commanding Officer|Executive Officer|Academy Director|Director|Assistant Director|Royal Captain|Field Commander|Head of (?:Security|Protection|Armour|Operations|Infantry|Discipline|Investigations)|Head Analyst|Unit Commander|Unit Executive|Department Commander|Department Executive|Squadron Commander|Squadron Executive)$/i,
 staff:/\b(?:Staff|Instructor|Director|Commanding Officer|Executive Officer|Royal Captain|Royal Officer|Field Commander|Field Officer|Regimental Sergeant Major|Head of|Unit Commander|Unit Executive|Department Commander|Department Executive|Agent Supervisor|Appeals Reviewer|Reports Staff|Moderation Department|Recruiting Staff|Recruiter|Filtering|Exam Reviewing Clearance)\b/i,
 trainee:/\b(?:Trainee|Training|Phase|Stage|Student|Applicant|Cadet|Novice|School|Probationary|Graduation)\b/i,
 guard:/\b(?:Royal Guard|Guard|Combatant|Operative)\b/i,
 operator:/\b(?:Operator|Operative|Warfare Trainee)\b/i,
 agent:/\b(?:Agent|Analyst|Investigation|Intelligence)\b/i
};
const list=t=>(t?.role_definitions||[]).map(r=>r.name);
const isHQ=n=>HEADQUARTERS.includes(n);
const isCommand=n=>isHQ(n)||patterns.command.test(n);
const isStaff=n=>isCommand(n)||patterns.staff.test(n);
const isPersonnel=n=>n.includes(" | Personnel")||n==="BA | British Army Personnel";
const isVisitor=n=>n==="Guest"||n==="Regimental Oversight"||n==="RIC | Royal Intelligence Corps";
function groupFor(t,access,categoryName,channelName){
 const names=list(t),code=t.server_code;
 const selected=new Set();
 const add=fn=>{for(const n of names)if(fn(n))selected.add(n);};
 const addStaff=()=>add(n=>isStaff(n));
 const addCommand=()=>add(n=>isCommand(n));
 const phase=(code==="OCA"?/phase[-\s]*(\d)/i:null);
 const phaseNumber=code==="OCA"?
   (/𝐏𝐇𝐀𝐒𝐄 𝐈𝐈/u.test(categoryName)?2:
    /𝟏/u.test(categoryName)?1:/𝟑/u.test(categoryName)?3:
    /𝟒/u.test(categoryName)?4:/𝟓/u.test(categoryName)?5:null):null;
 const academy=()=>add(n=>patterns.trainee.test(n)||isPersonnel(n));
 const allPersonnel=()=>add(n=>!isVisitor(n)&&n!=="Applicant"&&n!=="Awaiting Approval");
 if(access==="public")allPersonnel();
 else if(access==="personnel")allPersonnel();
 else if(["academy","trainees","students","candidates"].includes(access))academy();
 else if(["instructors","staff","department"].includes(access))addStaff();
 else if(["command","directorate","appeals"].includes(access))addCommand();
 else if(["agents","reports"].includes(access))add(n=>patterns.agent.test(n)||isPersonnel(n)||/Reports Staff|Moderation Department|Appeals Reviewer/.test(n));
 else if(access==="iad")add(n=>/\bIAD\b|Internal Affairs/i.test(n));
 else if(access==="cod")add(n=>/\bCOD\b|Covert Operations/i.test(n));
 else if(access==="pad")add(n=>/\bPAD\b|Public Affairs/i.test(n));
 else if(access==="provost")add(n=>/Provost Officer/.test(n));
 else if(access==="operations")add(n=>/Operations Specialist/.test(n));
 else if(access==="squadron")add(n=>/Squadron|Troop|Vehicle Commander|Qualified/.test(n));
 else if(access==="guards")add(n=>patterns.guard.test(n));
 else if(access==="operators")add(n=>patterns.operator.test(n));
 else if(access==="mixed")add(n=>!isVisitor(n)&&n!=="Applicant");
 addCommand();
 if(["instructors","staff","academy","students","trainees","candidates","guards",
   "operations","provost","squadron","agents","reports","operators","mixed"].includes(access))addStaff();

 // The source Officer Academy marks all categories public, even the STAFF,
 // COMMAND and five PHASE categories. The pack's permission_policy explicitly
 // calls for phase/staff gating. Never let that inherited broad public label
 // expose confidential instructor/command rooms.
 if(code==="OCA"){
   if(phaseNumber!==null){
     selected.clear();
     if(phaseNumber<=3)add(n=>n==="Phase "+phaseNumber);
     else if(phaseNumber===4)add(n=>n==="Academy Student"||n==="Graduation");
     else add(n=>n==="Officer Cadet"||n==="Graduation");
     addStaff();
   }else if(/𝐀𝐂𝐀𝐃𝐄𝐌𝐘 𝐒𝐓𝐀𝐅𝐅|𝐈𝐧𝐬𝐭𝐫𝐮𝐜𝐭𝐨𝐫 𝐂𝐨𝐫𝐩𝐬/u.test(categoryName)){
     selected.clear();addStaff();
   }else if(/𝐂𝐨𝐦𝐦𝐚𝐧𝐝/u.test(categoryName)){
     selected.clear();addCommand();
   }else if(/𝐑𝐞𝐩𝐮𝐛𝐥𝐢𝐜 𝐈𝐧𝐭𝐞𝐥𝐥𝐢𝐠𝐞𝐧𝐜𝐞/u.test(categoryName)){
     selected.clear();add(n=>n==="RIC | Royal Intelligence Corps");addCommand();
   }
 }
 if(code==="RICA"){
   if(/\[PHASE I\]/.test(categoryName)&&!/\[PHASE II\]|\[PHASE III\]/.test(categoryName)){
     selected.clear();add(n=>n==="Stage 1");addStaff();
   }else if(categoryName==="[PHASE II]"){
     selected.clear();add(n=>n==="Stage 2");addStaff();
   }else if(categoryName==="[PHASE III]"){
     selected.clear();add(n=>n==="Stage 3");addStaff();
   }else if(categoryName==="[ACADEMY STAFF]"){
     selected.clear();addStaff();
   }else if(categoryName==="[REPUBLIC INTELLIGENCE]"){
     selected.clear();add(n=>n==="RIC | Royal Intelligence Corps");addStaff();
   }else if(categoryName==="PAD Trial phase"){
     selected.clear();add(n=>n==="Filtering"||n==="Applicant");addStaff();
   }
 }
 if(code==="RA"){
   if(categoryName==="Ticket Center"){
     selected.clear();add(n=>/Personnel|Reports Staff|Appeals Reviewer|Moderation Department/.test(n));addCommand();
   }else if(/Republic Intelligence|Internal Affairs/i.test(categoryName)){
     selected.clear();add(n=>n==="RIC | Royal Intelligence Corps");addCommand();
   }else if(/Moderation Reports/.test(categoryName)){
     selected.clear();add(n=>n==="Moderation Department"||n==="Reports Staff");addCommand();
   }else if(/Appeal Tickets/.test(categoryName)){
     selected.clear();add(n=>n==="Appeals Reviewer");addCommand();
   }else if(/Joint Communications/.test(categoryName)){
     selected.clear();add(n=>/Appeals Reviewer|Reports Staff|Moderation Department/.test(n));addCommand();
   }
 }
 // Private voice areas have channel-specific readers, not merely category
 // mixed-access grants. This matters when General, Staff and Command VC share
 // one Voice category.
 if(access==="mixed" && channelName){
   if(/command|hq|headquarters/i.test(channelName)){selected.clear();addCommand();}
   else if(/staff|instructor/i.test(channelName)){selected.clear();addStaff();}
 }
 // Ensure no nonexistent role placeholders are ever sent to Discord.
 return [...selected];
}

export function expectedAccess(t,cat,ch=null){
 const name=ch?.name||"",channel=ch!=null;
 const source=channel?ch.permission_overwrites_template:cat.permission_overwrites_template;
 const everyone=source?.["@everyone"];
 if(!everyone)throw Error("Missing @everyone access specification");
 const phaseOCA=t.server_code==="OCA"&&(
   /𝟏|𝐈𝐈|𝟑|𝟒|𝟓/u.test(cat.name)&&/𝐏𝐡𝐚𝐬𝐞|𝐏𝐇𝐀𝐒𝐄/u.test(cat.name));
 const adminOCA=t.server_code==="OCA"&&(
   /𝐀𝐂𝐀𝐃𝐄𝐌𝐘 𝐒𝐓𝐀𝐅𝐅|𝐈𝐧𝐬𝐭𝐫𝐮𝐜𝐭𝐨𝐫 𝐂𝐨𝐫𝐩𝐬|𝐂𝐨𝐦𝐦𝐚𝐧𝐝|𝐑𝐞𝐩𝐮𝐛𝐥𝐢𝐜 𝐈𝐧𝐭𝐞𝐥𝐥𝐢𝐠𝐞𝐧𝐜𝐞/u.test(cat.name));
 const privateArea=cat.access!=="public"||phaseOCA||adminOCA;
 const authorized=groupFor(t,cat.access,cat.name,name);
 const staff=authorized.filter(n=>isStaff(n)||
   (t.server_code==="OCA"&&n==="RIC | Royal Intelligence Corps"&&/𝐈𝐧𝐭𝐞𝐥𝐥𝐢𝐠𝐞𝐧𝐜𝐞/.test(cat.name)));
 const shouldShow=!privateArea&&everyone.ViewChannel===true;
 const readOnly=channel?source.authorized_roles?.SendMessages===false:false;
 const publicWrite=shouldShow&&everyone.SendMessages===true&&!(channel&&readOnly);
 const rolePolicy={};
 for(const name of authorized){
   const writable=!readOnly||staff.includes(name);
   rolePolicy[name]={ViewChannel:true,ReadMessageHistory:true,
     SendMessages:writable,Connect:true,Speak:true,
     SendMessagesInThreads:writable};
 }
 const everyonePolicy={ViewChannel:shouldShow,ReadMessageHistory:shouldShow,
   SendMessages:publicWrite,Connect:publicWrite,Speak:publicWrite,
   SendMessagesInThreads:publicWrite};
 return {category:cat.name,name,access:cat.access,privateArea,authorized,
   staff,warnings:authorized.length?"":[] ,everyone:everyonePolicy,roles:rolePolicy};
}
export function toOverwriteArray(t,cat,ch,guildId,roleIdByName){
 const p=expectedAccess(t,cat,ch);
 const boolsToFlags=(entry)=>{
   const allow=[],deny=[];
   for(const [flag,state] of Object.entries(entry)){
     if(!Object.hasOwn(P,flag))throw Error("Unsupported Discord flag "+flag);
     (state?allow:deny).push(P[flag]);
   }
   return {allow,deny};
 };
 const base=boolsToFlags(p.everyone);
 const rows=[{id:guildId,type:OverwriteType.Role,...base}];
 for(const name of p.authorized){
   const id=roleIdByName.get(name);
   if(!id)throw Error("Cannot grant access: missing role "+name);
   rows.push({id,type:OverwriteType.Role,...boolsToFlags(p.roles[name])});
 }
 return rows;
}

// Discord resolves permissions: @everyone overwrites, then combined role
// allows/denies. Admin/owner is intentionally not part of this simulation.
// Used to test guest/member/trainee/instructor/command before every build.
export function simulateChannelAccess(t,cat,ch,roleNames){
 const p=expectedAccess(t,cat,ch);
 const roles=new Set(roleNames);
 const effective={...p.everyone};
 for(const [r,flags] of Object.entries(p.roles)){
   if(!roles.has(r))continue;
   for(const [bit,value] of Object.entries(flags))
     if(value===true)effective[bit]=true;
 }
 return {
   view:effective.ViewChannel===true,
   send:effective.ViewChannel===true&&effective.SendMessages===true,
   connect:effective.ViewChannel===true&&effective.Connect===true
 };
}
export function testAccessMatrix(t){
 const all=t.role_definitions.map(x=>x.name);
 const guest=[],member=all.filter(x=>x.endsWith(" | Personnel")||x==="BA | British Army Personnel"),
  trainee=all.filter(x=>/Academy Student|Academy Phase 1|Phase 1|Stage 1|Trainee Crewman|Guard in Training|Novice Operator/.test(x)),
  instructor=all.filter(x=>/Academy Instructor|Instructor$|Training Instructor|Reports Staff/.test(x)),
  command=all.filter(x=>x==="Commanding Officer"||x==="Academy Director"||x==="Director"||x==="Field Marshal");
 const result={personas:{guest,member,trainee,instructor,command},sample:[],warnings:[],issues:[]};
 for(const cat of t.categories_top_to_bottom){
   const first=cat.channels[0]||null;
   const row={category:cat.name,channel:first?.name||"(category)",
     guests:simulateChannelAccess(t,cat,first,guest),
     members:simulateChannelAccess(t,cat,first,member),
     trainees:simulateChannelAccess(t,cat,first,trainee),
     instructors:simulateChannelAccess(t,cat,first,instructor),
     command:simulateChannelAccess(t,cat,first,command)};
   result.sample.push(row);
   const p=expectedAccess(t,cat,first);
   if(p.privateArea && p.authorized.length===0)
     result.issues.push("Private category has no mapped authorized role: "+cat.name);
   if(!p.privateArea && !row.guests.view)
     result.issues.push("Public category unexpectedly invisible to guest: "+cat.name);
   if(p.privateArea && row.guests.view)
     result.issues.push("Guest unexpectedly sees private category: "+cat.name);
   if(p.privateArea&&!row.command.view)
     result.issues.push("Command cannot see restricted category: "+cat.name);
   if(!p.privateArea&&!row.guests.view)
     result.warnings.push("Public area invisible: "+cat.name);
 }
 if(!trainee.length)result.warnings.push("No matching trainee sample role; verify live assignments.");
 if(!instructor.length)result.warnings.push("No matching instructor sample role; verify live assignments.");
 return result;
}
