// Exact BSA UKSF scan supplied 2026-11-23T08:00:16.130Z.
// The IDs below are identity guards, NOT permission assumptions.
export const UKSF_GUILD_ID="1573839214553075823";
export const UKSF_RTR_EXCLUDED="1573839470359482431";
export const UKSF_BUILDER_ID="1573883643234091098";
export const UKSF_BOT_ROLE_ID="1573844353552486562";
export const UKSF_PROTECTED_ROLES=Object.freeze({
 "Guest":"1573883644110700685",
 "UKSF | Personnel":"1573883645364543688",
 "RIC | Royal Intelligence Corps":"1573883646773952632",
 "Regimental Oversight":"1573883647856087221",
 "Army Sergeant Major":"1573883668366237698",
 "Assistant Chief of General Staff":"1573883669423329443",
 "Deputy Chief of General Staff":"1573883670370979951",
 "Chief of General Staff":"1573883671327277136",
 "Field Marshal":"1573883672363405373",
 "BSA Builder | UKSF":UKSF_BUILDER_ID,
 "TARC Assistant":UKSF_BOT_ROLE_ID
});
export const UKSF_HQ=Object.freeze([
 "Field Marshal","Chief of General Staff","Deputy Chief of General Staff",
 "Assistant Chief of General Staff","Army Sergeant Major"
]);
export const UKSF_RANKS_TOP=Object.freeze([
 "Commanding Officer","Executive Officer","Head of Operations","Regimental Sergeant Major",
 "Senior Operations Officer","Operations Officer","Recruitment Officer","Operations Sergeant",
 "SAS | Special Air Service","SRR | Special Reconnaissance Regiment",
 "Operator","Special Training Course"
]);
export const UKSF_BRANCHES=Object.freeze(["Branch | SAS","Branch | SRR"]);
export const UKSF_RENAME_CANDIDATES=Object.freeze([
 {id:"1573883649324228754",from:"Novice Operator",to:"SAS | Special Air Service"},
 {id:"1573883651400278077",from:"Operator II",to:"SRR | Special Reconnaissance Regiment"},
 {id:"1573883654210592818",from:"Advanced Warfare Trainee",to:"Operations Sergeant"},
 {id:"1573883655540179105",from:"Special Operator",to:"Recruitment Officer"},
 {id:"1573883656382980098",from:"Special Operator II",to:"Operations Officer"},
 {id:"1573883657494466640",from:"Recruiter",to:"Senior Operations Officer"}
]);
export const UKSF_KEPT_RANK_IDS=Object.freeze({
 "Special Training Course":"1573883648543817731",
 "Operator":"1573883650397839362",
 "Regimental Sergeant Major":"1573883663786057759",
 "Head of Operations":"1573883665606385735",
 "Executive Officer":"1573883666164093071",
 "Commanding Officer":"1573883667603001414"
});
export const UKSF_LEGACY_RETIRE=Object.freeze({
 "Instructor":"1573883659604332695",
 "Senior Instructor":"1573883660480807082",
 "Directorate Staff":"1573883662108200970",
 "Directorate Staff Supervisor":"1573883662871568447"
});
// public = everyone can view, read-only announcements
// general = UKSF Personnel and the functional ranks
// trainee = STC and recruitment staff + command
// operations = Operator, SAS/SRR and operations leadership
// recruitment = Recruitment Officer, Ops Sergeants and senior staff
// staff = Operations Officer and above
// command = Head of Operations, XO, CO and HQ
// Retain all pre-existing user/third-party/integration overwrites; report
// conflicts rather than silently replacing them.
export const UKSF_CATEGORIES=Object.freeze([
 {id:"1573883732039966792",name:"ENTRANCE",tier:"public",channels:[
  ["1573883752231469077","👋│welcome","public","readonly"],
  ["1573883754232021075","📜│rules","public","readonly"]]},
 {id:"1573883733050925146",name:"INFORMATION",tier:"public",channels:[
  ["1573883757122031656","📣│announcements","public","readonly"],
  ["1573883759655264276","📌│regimental-information","public","readonly"],
  ["1573883761429324019","⭐│chain-of-command","public","readonly"],
  ["1573883764285902869","📚│documents","public","readonly"],
  ["1573883879582863421","🪖│recruitment-information","public","readonly"]]},
 {id:"1573883741770883144",name:"EVENTS",tier:"general",channels:[
  ["1573884639452594288","📅│event-logs","staff"],
  ["1573884416076292106","📅│event-checks","operations"],
  ["1573884418773352448","🎯│tryout-announcements","public","readonly"],
  ["1573884413266108597","📅│event-announcements","public","readonly"]]},
 {id:"1573883734409875609",name:"MAIN COMMUNICATIONS",tier:"general",channels:[
  ["1573883883357995110","💬│general-chat","general"],
  ["1573883887690448947","📸│media","general"],
  ["1573883889741602816","📌│questions","general"],
  ["1573883891956060280","📌│bot-commands","general"],
  ["1573883899757731910","💡│suggestions","general"]]},
 {id:"1573883745499619424",name:"UTILITIES",tier:"general",channels:[
  ["1573884898006012028","💤│inactivity-notices","general"],
  ["1573884900581580850","📤│discharge-requests","general"],
  ["1573884903345487902","🪖│recruitment-logs","recruitment"],
  ["1573884906843410512","📋│activity-logs","staff"]]},
 {id:"1573883747051511961",name:"VOICE",tier:"general",channels:[
  ["1573884909305462937","💬│General VC","general"],
  ["1573884911310602443","📅│Event VC","general"],
  ["1573884914900803604","👥│Staff VC","staff"],
  ["1573884918143127562","⭐│Command VC","command"]]},
 {id:"1573883735550722238",name:"SELECTION AND TRAINING",tier:"trainee",channels:[
  ["1573883902186102865","📌│selection-information","trainee","readonly"],
  ["1573883904593629286","📅│selection-events","trainee"],
  ["1573883906946506822","📌│placement-assessments","recruitment"],
  ["1573883908850720820","📌│combat-assessments","recruitment"],
  ["1573884136157085717","📊│selection-results","trainee","readonly"]]},
 {id:"1573883736519344238",name:"SPECIAL OPERATIONS",tier:"operations",channels:[
  ["1573884139516465233","⚙️│operations-briefings","operations","readonly"],
  ["1573884141756481547","🚀│deployment-logs","operations"],
  ["1573884144130330694","📌│mission-reviews","operations"],
  ["1573884148794269697","🚓│patrol-logs","operations"]]},
 {id:"1573883737886695535",name:"OPERATOR TEAMS",tier:"operations",channels:[
  ["1573884151344529593","📣│team-announcements","operations","readonly"],
  ["1573884154397982731","💬│team-chat","operations"],
  ["1573884156663046184","📅│team-events","operations"],
  ["1573884158609068104","📌│team-performance","operations"]]},
 {id:"1573883739338055691",name:"FLIGHT TRAINING",tier:"general",channels:[
  ["1573884386624147486","🚁│flight-course","trainee","readonly"],
  ["1573884388867833967","🚁│pilot-qualification-requests","trainee"],
  ["1573884392051576932","🚁│flight-assessments","recruitment"],
  ["1573884398066204822","🚁│flight-logs","operations"]]},
 {id:"1573883740483227790",name:"INSTRUCTOR SECTOR",tier:"recruitment",channels:[
  ["1573884401136435280","💬│instructor-chat","recruitment"],
  ["1573884404105875507","🏋️│training-documents","recruitment"],
  ["1573884410900644003","🏋️│training-reviews","recruitment"]]},
 {id:"1573883743205072992",name:"REGIMENTAL STAFF",tier:"staff",channels:[
  ["1573884643160231966","👥│staff-announcements","staff","readonly"],
  ["1573884646020743288","👥│staff-chat","staff"],
  ["1573884648042401903","👥│staff-documents","staff"],
  ["1573884651099914320","📋│promotion-logs","staff"],
  ["1573884653243338889","📋│disciplinary-logs","staff"]]},
 {id:"1573883744438456481",name:"REGIMENTAL COMMAND",tier:"command",channels:[
  ["1573884656787390504","⭐│command-announcements","command","readonly"],
  ["1573884667902300250","⭐│command-documents","command"],
  ["1573884659702702193","⭐│command-chat","command"],
  ["1573884670792437780","📌│personnel-reviews","command"]]},
 {id:"1573883748628562031",name:"ARCHIVES",tier:"staff",channels:[
  ["1573884920399659100","📌│archived-records","staff","readonly"]]}
]);
export function validateUksfSource(){
 if(UKSF_CATEGORIES.length!==14)throw Error("UKSF verified scan category count changed.");
 const rows=UKSF_CATEGORIES.flatMap(c=>c.channels);
 if(rows.length!==54)throw Error("UKSF verified scan channel count changed.");
 if(new Set(rows.map(x=>x[0])).size!==54)throw Error("UKSF duplicated scanned channel IDs.");
 if(new Set(UKSF_RANKS_TOP).size!==12)throw Error("Duplicate UKSF functional rank.");
 return true;
}
validateUksfSource();
