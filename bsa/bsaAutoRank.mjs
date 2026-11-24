// Separate from the Discord bot's Roblox credentials, commands and RoWifi bindings.
export const GROUP = '1042762815';
export const ROLE = `groups/${GROUP}/roles/922992320`;
const ROOT = `https://apis.roblox.com/cloud/v2/groups/${GROUP}`;
export class RankError extends Error {
  constructor(code, retryMs = 0) { super(code); this.code = code; this.retryMs = retryMs; }
}
export function eligible(member, baseRoles = new Set()) {
  if (!member || !new RegExp(`^groups/${GROUP}/memberships/[A-Za-z0-9_-]+$`).test(member.path || '') ||
      !/^users\/\d+$/.test(member.user || '') || !Array.isArray(member.roles)) return false;
  if (member.roles.some(role => !baseRoles.has(role))) return false;
  return !member.role || baseRoles.has(member.role);
}
export function createRanker({key, fetchFn = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), now = Date.now}) {
  let lastRequest = 0;
  async function request(suffix, body) {
    await sleep(Math.max(0, 350 - (now() - lastRequest)));
    lastRequest = now();
    let response;
    try {
      response = await fetchFn(ROOT + suffix, {method: body ? 'POST' : 'GET',
        headers: {'x-api-key': key, ...(body ? {'Content-Type': 'application/json'} : {})},
        ...(body ? {body: JSON.stringify(body)} : {}), redirect: 'error', signal: AbortSignal.timeout(15000)});
    } catch { throw new RankError('NETWORK_OR_TIMEOUT'); }
    if (!response.ok) {
      const retry = response.headers.get('retry-after');
      const seconds = Number(retry);
      const delay = retry ? (Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retry) - now()) : 60000;
      throw new RankError(`HTTP_${response.status}`, response.status === 429 ? Math.max(60000, Number.isFinite(delay) ? delay : 60000) : 0);
    }
    try { return await response.json(); } catch { throw new RankError('INVALID_JSON'); }
  }
  async function list(kind, token = '', filter = '') {
    const q = new URLSearchParams({maxPageSize: kind === 'roles' ? '20' : '100'});
    if (token) q.set('pageToken', token);
    if (filter) q.set('filter', filter);
    return request(`/${kind}?${q}`);
  }
  async function validateRoles() {
    const roles = []; const seen = new Set(); let token = '';
    do {
      if (seen.has(token) || seen.size >= 30) throw new RankError('ROLE_PAGINATION_INVALID');
      seen.add(token);
      const page = await list('roles', token);
      if (!Array.isArray(page.groupRoles)) throw new RankError('ROLE_SCHEMA_INVALID');
      roles.push(...page.groupRoles); token = page.nextPageToken || '';
    } while (token);
    const target = roles.find(r => r.path === ROLE);
    if (!target || !/British Army Personnel/i.test(target.displayName || '') || !(target.rank > 0 && target.rank < 255)) throw new RankError('TARGET_ROLE_MISMATCH');
    // Roblox's built-in member role is not a custom rank. No other role is ignored.
    const baseRoles = new Set(roles.filter(r => /^member$/i.test(r.displayName || '') && r.rank <= 1 && r.path !== ROLE).map(r => r.path));
    if (roles.some(r => r.rank > 0 && r.rank < target.rank && !baseRoles.has(r.path))) throw new RankError('TARGET_NOT_FIRST_CUSTOM_RANK');
    return {baseRoles, knownRoles: new Set(roles.map(r => r.path)), targetRank: target.rank};
  }
  async function cycle({write = false, cursor = ''} = {}) {
    const {baseRoles, knownRoles, targetRank} = await validateRoles();
    const result = {scanned: 0, eligible: 0, assigned: 0, skipped: 0, missingRoles: 0, targetRank, nextCursor: ''};
    const seen = new Set(); let token = cursor;
    for (let pageNo = 0; pageNo < 5; pageNo++) {
      if (seen.has(token)) throw new RankError('MEMBERSHIP_PAGINATION_INVALID');
      seen.add(token);
      const page = await list('memberships', token);
      if (!Array.isArray(page.groupMemberships)) throw new RankError('MEMBERSHIP_SCHEMA_INVALID');
      for (const member of page.groupMemberships) {
        result.scanned++;
        if (!Array.isArray(member.roles)) result.missingRoles++;
        // Roblox omits its built-in member role from ListGroupRoles, but still
        // returns it in the deprecated singular membership.role field. Resolve
        // that exact role instead of mistaking it for an assigned custom rank.
        if (Array.isArray(member.roles) && member.roles.length === 0 &&
            typeof member.role === 'string' &&
            new RegExp(`^groups/${GROUP}/roles/\\d+$`).test(member.role) &&
            !knownRoles.has(member.role)) {
          const role = await request(`/roles/${member.role.split('/').at(-1)}`);
          knownRoles.add(member.role);
          if (role.path === member.role && /^member$/i.test(role.displayName || '') &&
              role.rank === 1 && role.path !== ROLE) baseRoles.add(role.path);
        }
        if (!eligible(member, baseRoles)) { result.skipped++; continue; }
        result.eligible++;
        if (!write) continue;
        // Re-read immediately before assigning. Never PATCH, remove or replace any role.
        const freshPage = await list('memberships', '', `user == '${member.user}'`);
        const fresh = freshPage.groupMemberships;
        if (freshPage.nextPageToken || !Array.isArray(fresh) || fresh.length !== 1 || fresh[0].path !== member.path || !eligible(fresh[0], baseRoles)) { result.skipped++; continue; }
        const assigned = await request(`/memberships/${encodeURIComponent(member.path.split('/').at(-1))}:assignRole`, {role: ROLE});
        if (!Array.isArray(assigned.roles) || !assigned.roles.includes(ROLE)) throw new RankError('ASSIGNMENT_NOT_CONFIRMED');
        result.assigned++;
      }
      token = page.nextPageToken || '';
      if (!token) break;
    }
    result.nextCursor = token;
    return result;
  }
  return {cycle};
}
export function startBsaAutoRank({env = process.env, log = console.log, fetchFn = fetch} = {}) {
  if (!env.BSA_AUTORANK_API_KEY) return;
  const write = env.BSA_AUTORANK_ENABLED === 'true';
  const ranker = createRanker({key: env.BSA_AUTORANK_API_KEY, fetchFn});
  let stopped = false, cursor = '', failures = 0, timer;
  async function run() {
    let delay = 45000;
    try {
      const result = await ranker.cycle({write, cursor}); cursor = result.nextCursor; failures = 0;
      const {nextCursor, ...counts} = result;
      log('[BSA auto-rank]', JSON.stringify({mode: write ? 'active' : 'dry-run', ...counts, morePages: Boolean(nextCursor)}));
    } catch (error) {
      failures++; cursor = '';
      delay = Math.max(error.retryMs || 0, Math.min(900000, 45000 * 2 ** Math.min(failures, 5)));
      // Never log raw fetch errors, headers, response bodies or secrets.
      log('[BSA auto-rank]', JSON.stringify({mode: write ? 'active' : 'dry-run', error: error instanceof RankError ? error.code : 'INTERNAL_ERROR', retrySeconds: Math.ceil(delay / 1000)}));
    }
    if (!stopped) { timer = setTimeout(run, delay); timer.unref?.(); }
  }
  timer = setTimeout(run, 10000); timer.unref?.();
  return () => { stopped = true; clearTimeout(timer); };
}
