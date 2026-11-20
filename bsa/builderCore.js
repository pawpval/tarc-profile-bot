// BSA V4 pure configuration validation; no Discord writes or network reads.
export const BSA_SCHEMA = "bsa-discord-builder-config";
export const BSA_VERSION = 4;
export const KINDS = ["text", "voice", "stage", "forum"];
const exactName = value => typeof value === "string" && value.trim().length > 0 && value.length <= 100;
const duplicateNames = list => {
  const found = new Set(), duplicates = new Set();
  for (const name of list) { if (found.has(name)) duplicates.add(name); found.add(name); }
  return [...duplicates];
};
export const collection = template => ({
  roles: Array.isArray(template?.roles) ? template.roles : [],
  categories: Array.isArray(template?.categories) ? template.categories : [],
  top: Array.isArray(template?.top_level_channels) ? template.top_level_channels : []
});

export function validateBsaTemplate(template) {
  const errors = [], warnings = [];
  const { roles, categories, top } = collection(template);
  if (template?.schema !== BSA_SCHEMA) errors.push("Schema must be " + BSA_SCHEMA);
  if (template?.version !== BSA_VERSION) errors.push("Template version must be 4.");
  if (template?.server_name !== "British Sandhurst Army | BSA") errors.push("Expected server_name: British Sandhurst Army | BSA.");
  if (!Array.isArray(template?.roles) || roles.length === 0) errors.push("Missing roles array.");
  if (!Array.isArray(template?.categories) || categories.length === 0) errors.push("Missing categories array.");
  if (!Array.isArray(template?.top_level_channels)) errors.push("Missing top_level_channels array.");
  if (roles.length > 230) errors.push("Role count exceeds safe Discord role limit.");
  for (const name of duplicateNames(roles.map(r => r?.name))) errors.push("Duplicate role name: " + name);
  for (const [index, role] of roles.entries()) {
    if (!exactName(role?.name)) errors.push("roles[" + index + "] has missing/invalid name.");
    if (!/^#[0-9a-f]{6}$/i.test(role?.color || "")) errors.push("Role " + (role?.name || index) + " requires a #RRGGBB colour.");
    if (role?.administrator !== false) errors.push("Role " + (role?.name || index) + ": administrator must be explicitly false. No Administrator roles are approved.");
  }
  const known = new Set(["@everyone", ...roles.map(r => r.name)]);
  const all = [], categoryNames = categories.map(c => c?.name);
  for (const n of duplicateNames(categoryNames)) errors.push("Duplicate category: " + n);
  for (const [i, cat] of categories.entries()) {
    if (!exactName(cat?.name)) errors.push("categories[" + i + "] has missing/invalid name.");
    if (!Array.isArray(cat?.channels) || !cat.channels.length) errors.push("Category " + cat?.name + " requires channels.");
    for (const n of duplicateNames((cat?.channels || []).map(c => c.name))) errors.push("Duplicate channel " + n + " inside " + cat?.name);
    for (const role of (cat?.default_view || [])) {
      if (!known.has(role)) warnings.push('Category "' + cat.name + '" default_view refers to undefined "' + role + '"; category access will be calculated only from explicit channel.view lists.');
    }
    for (const [j, ch] of (cat?.channels || []).entries()) all.push({ name: ch?.name, type: ch?.type, category: cat?.name, categoryIndex:i, index:j, access:ch?.access });
  }
  for (const [i,ch] of top.entries()) all.push({ name:ch?.name, type:ch?.type, category:null, categoryIndex:-1, index:i, access:ch?.access });
  if (all.length > 480) errors.push("Too many channels for safe creation.");
  for (const ch of all) {
    const path = (ch.category || "TOP LEVEL") + "/" + ch.name;
    if (!exactName(ch.name)) errors.push("Invalid channel name in " + path);
    if (!KINDS.includes(ch.type)) errors.push(path + " has unsupported channel type: " + ch.type);
    if (!ch.access || !Array.isArray(ch.access.view) || !Array.isArray(ch.access.post)) {
      errors.push(path + " requires explicit access.view and access.post arrays."); continue;
    }
    if (!ch.access.view.length) errors.push(path + " has no viewing roles. Explicit viewing permissions are required.");
    for (const field of ["view","post"]) {
      for (const v of ch.access[field]) if (!known.has(v)) errors.push(path + " references missing role '" + v + "' in access." + field);
      for (const v of duplicateNames(ch.access[field])) warnings.push(path + " repeats " + v + " in access." + field);
    }
    if (!ch.access.view.includes("@everyone")) {
      for (const v of ch.access.post) if (!ch.access.view.includes(v))
        errors.push(path + " gives post access to " + v + " without view access.");
    }
  }
  const count = type => all.filter(x=>x.type===type).length;
  const has = (category,name,type) => all.some(x => x.category===category && x.name===name && x.type===type);
  if (has("OFFICER STAFF SECTOR","pings","text")) errors.push("Remove OFFICER STAFF SECTOR/pings from the template.");
  if (has("LOGGING SECTOR","dyno-logs","text")) errors.push("Use LOGGING SECTOR/server-logs, not dyno-logs.");
  for (const [category,name,type] of [
    ["OFFICER STAFF SECTOR","event-logs","text"],["LOGGING SECTOR","automated-event-logs","text"],
    ["LOGGING SECTOR","server-logs","text"],["VOICE CHANNELS","BSA Assembly","stage"],
    ["MAIN COMMS","suggestions","forum"],["DEVELOPMENT BOARD","bug-reports","forum"],
    ["OFFICER STAFF SECTOR","supervision-request","text"]
  ]) if (!has(category,name,type)) errors.push("Required " + category + "/" + name + " (" + type + ") is missing.");
  const supervision = all.find(x=>x.category==="OFFICER STAFF SECTOR" && x.name==="supervision-request");
  const trialNames = roles.map(r=>r.name).filter(n=>/officer cadet.*trial|trial.*officer cadet/i.test(n));
  if (supervision) {
    if (trialNames.length !== 1)
      errors.push("supervision-request: V4 notes specify Officer Cadets on Trial, but no unique trial-cadet Discord role is defined. Add its exact role name and colour to roles and explicitly set supervision-request.access.view/post. Do not treat all OF-0 cadets as trial cadets.");
    else if (!supervision.access?.post?.includes(trialNames[0]) || !supervision.access?.view?.includes(trialNames[0]))
      errors.push("supervision-request: the Officer Cadet on Trial role must appear explicitly in access.view and access.post.");
    if (supervision.access?.post?.includes("OF-0 | Officer Cadet"))
      errors.push("supervision-request: remove general OF-0 | Officer Cadet from access.post. Only the confirmed trial-cadet role, not all cadets, should request supervision.");
  }
  // Default_view is an advisory field and has mismatched legacy aliases in V4.
  // Every channel carries authoritative access; never grant an unrecognised alias.
  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    counts: { roles:roles.length, categories:categories.length, channels:all.length,
      topLevelChannels:top.length, text:count("text"), voice:count("voice"),
      stage:count("stage"), forum:count("forum") },
    channels: all
  };
}

export function categoryAccess(category) {
  const names = new Set();
  for (const channel of category.channels || []) {
    for (const role of (channel.access?.view || [])) names.add(role);
  }
  return [...names];
}
