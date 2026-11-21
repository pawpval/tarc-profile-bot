import {readFile} from "node:fs/promises";
import {brotliDecompressSync} from "node:zlib";
import {createHash} from "node:crypto";

export const REGIMENT_CODES=Object.freeze(["RMP","ETS","RGG","RTR","UKSF","GR","RIC","OCA","RICA","RA"]);
const ID=/^\d{17,20}$/;
const TYPES=new Set(["text","forum","voice","stage"]);
let cached;

export async function getRegimentalPresets(){
  if(!cached){
    // Source-faithful JSON data from *_PROPOSED_CONFIG.json files inside the
    // uploaded BSA_Regimental_Planning_Pack.zip. Brotli compression removes
    // repeated proposal metadata; no roles/channels are reconstructed by AI.
    const base64=(await readFile(new URL("./regimental-proposals.b64",import.meta.url),"utf8")).trim();
    const unpacked=brotliDecompressSync(Buffer.from(base64,"base64")).toString("utf8");
    const parsed=JSON.parse(unpacked);
    if(Object.keys(parsed).length!==REGIMENT_CODES.length ||
      REGIMENT_CODES.some(code=>!parsed[code])) throw new Error("Regimental pack incomplete");
    cached=Object.freeze(parsed);
  }
  return cached;
}

export function regimentTemplateHash(template){
  return createHash("sha256").update(JSON.stringify(template),"utf8").digest("hex");
}
export function regimentRoleNames(template){return template.roles_lowest_to_highest;}
export function regimentChannels(template){return template.categories_top_to_bottom.flatMap(c=>
  c.channels.map(ch=>({section:c.name,access:c.access,name:ch.name,type:ch.type})));
}
export function validateRegimentalPreset(template){
  const errors=[],warnings=[];
  if(!template || template.schema!=="bsa.regimental.proposal"||template.schemaVersion!==1)
    errors.push("Unexpected proposal schema/version");
  const code=String(template?.server_code||"");
  if(!REGIMENT_CODES.includes(code)) errors.push("Unknown server code: "+code);
  if(!ID.test(String(template?.reference_source?.guild_id||"")))
    errors.push("Missing immutable reference guild ID");
  if(template?.status!=="PROPOSAL_NOT_APPROVED")
    errors.push("Proposal status unexpectedly changed; inspect the source before proceeding");
  const roles=template?.roles_lowest_to_highest;
  const categories=template?.categories_top_to_bottom;
  if(!Array.isArray(roles)||!roles.length) errors.push("No role list");
  if(!Array.isArray(categories)||!categories.length) errors.push("No categories");
  const usedRoles=new Set(),roleDupes=[];
  for(const role of roles||[]){
    if(typeof role!=="string"||!role||role.length>100) errors.push("Invalid role name");
    if(usedRoles.has(role)) roleDupes.push(role);
    usedRoles.add(role);
  }
  if(roleDupes.length) errors.push("Duplicate role names in proposed rank list: "+[...new Set(roleDupes)].join(", ")+". Source requires an explicit owner decision; no roles will be silently merged.");
  const catSeen=new Set();let channels=0,forums=0,voice=0,stage=0;
  const categoryIssue=new Set();
  for(const cat of categories||[]){
    if(typeof cat.name!=="string"||!cat.name||cat.name.length>100)
      errors.push("Invalid category name");
    if(catSeen.has(cat.name)) errors.push("Duplicate category: "+cat.name);
    catSeen.add(cat.name);
    if(!Array.isArray(cat.channels)) {errors.push("Missing channels in "+cat.name);continue;}
    if(cat.access!=="public"){
      categoryIssue.add(cat.access);
      if(!Object.hasOwn(template.access_groups||{},cat.access))
        warnings.push("Access group '"+cat.access+"' is not defined in the proposal ("+cat.name+"). It will remain locked.");
    }
    const chSeen=new Set();
    for(const channel of cat.channels){
      channels++;
      if(typeof channel.name!=="string"||!channel.name||channel.name.length>100)
        errors.push("Invalid channel name in "+cat.name);
      if(!TYPES.has(channel.type)) errors.push("Unsupported channel type in "+cat.name+"/"+channel.name);
      if(chSeen.has(channel.name)) errors.push("Repeated channel name within category "+cat.name+": "+channel.name);
      chSeen.add(channel.name);
      if(channel.type==="forum")forums++;
      if(channel.type==="voice")voice++;
      if(channel.type==="stage")stage++;
    }
  }
  if(categories?.length+channels>495)errors.push("Proposed template approaches Discord's 500-channel limit");
  warnings.unshift("PROPOSAL_NOT_APPROVED: roles and category layout are proposals, not owner-approved final Discord policies.");
  warnings.push("No exact role colours or role/channel permission overwrites supplied. Roles use Discord default colour and zero guild privileges.");
  warnings.push("Categories tagged 'public' are readable but read-only by default. All nonpublic categories, including mixed voice, deny @everyone visibility; NO unapproved staff, investigator, trainee, departmental or personnel access is inferred.");
  warnings.push("No bot integrations, ticket routing, webhooks, Roblox group sync, messages or historical content are imported.");
  for(const question of template?.pending_decisions||[]) warnings.push("Pending: "+question);
  return {ok:errors.length===0,code,errors,warnings,roles:roles?.length||0,
    categories:categories?.length||0,channels,forums,voice,stage,restrictedGroups:[...categoryIssue].sort()};
}
