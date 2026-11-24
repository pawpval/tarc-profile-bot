import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GROUP, ROLE, eligible, createRanker, startBsaAutoRank} from './bsaAutoRank.mjs';
const base = `groups/${GROUP}/roles/10`;
const other = `groups/${GROUP}/roles/99`;
const member = (roles = []) => ({path:`groups/${GROUP}/memberships/123`,user:'users/456',roles});
const rolePage = {groupRoles:[{path:ROLE,displayName:'🔴British Army Personnel',rank:1},{path:other,displayName:'Officer',rank:5}]};
function harness(fn) {
 const calls=[];
 const fetchFn=async(url,init)=>{ calls.push({url,init});const output=fn(new URL(url),init,calls.length);return {ok:true,json:async()=>output,headers:new Headers()}; };
 return {calls, ranker:createRanker({key:'TEST_ONLY',fetchFn,sleep:async()=>{}})};
}
test('empty roles eligible; any custom rank including target is protected',()=>{
 assert.equal(eligible(member()),true);
 assert.equal(eligible(member([other])),false);
 assert.equal(eligible(member([ROLE])),false);
 assert.equal(eligible({...member(),role:other}),false);
 assert.equal(eligible({...member(),roles:undefined}),false);
 assert.equal(eligible({...member(),path:'groups/7/memberships/123'}),false);
 assert.equal(eligible({...member(),user:'https://evil.test'}),false);
 assert.equal(eligible({...member([base]),role:base},new Set([base])),true);
});
test('dry run checks roles and members but never writes',async()=>{
 const {calls,ranker}=harness(u=>u.pathname.endsWith('/roles')?rolePage:{groupMemberships:[member(),member([other])]});
 const r=await ranker.cycle(); assert.equal(r.eligible,1);assert.equal(r.skipped,1); assert.ok(calls.every(c=>c.init.method==='GET'));
});
test('fresh check protects a member ranked during scan',async()=>{
 const {calls,ranker}=harness(u=>u.pathname.endsWith('/roles')?rolePage:{groupMemberships:[member(u.searchParams.has('filter')?[other]:[])]});
 const r=await ranker.cycle({write:true});assert.equal(r.assigned,0);assert.ok(calls.every(c=>c.init.method==='GET'));
});
test('only assigns exact verified role, and repeat scan skips it',async()=>{
 let ranked=false;
 const {calls,ranker}=harness((u,init)=>{
   if(u.pathname.endsWith('/roles'))return rolePage;
   if(init.method==='POST'){assert.equal(JSON.parse(init.body).role,ROLE);ranked=true;return member([ROLE]);}
   return {groupMemberships:[member(ranked?[ROLE]:[])]};
 });
 assert.equal((await ranker.cycle({write:true})).assigned,1);
 assert.equal((await ranker.cycle({write:true})).assigned,0);
 assert.equal(calls.filter(c=>c.init.method==='POST').length,1);
 assert.ok(calls.every(c=>!c.url.includes('TEST_ONLY')));
});
test('wrong target name fails closed',async()=>{
 const {ranker}=harness(()=>({groupRoles:[{...rolePage.groupRoles[0],displayName:'Wrong'}]}));
 await assert.rejects(ranker.cycle({write:true}),/TARGET_ROLE_MISMATCH/);
});
test('handles role and membership pagination',async()=>{
 const {ranker}=harness(u=>u.pathname.endsWith('/roles')?(u.searchParams.has('pageToken')?rolePage:{groupRoles:[],nextPageToken:'role2'}):(u.searchParams.has('pageToken')?{groupMemberships:[member([other])]}:{groupMemberships:[member()],nextPageToken:'page2'}));
 const r=await ranker.cycle();assert.equal(r.scanned,2);assert.equal(r.eligible,1);
});
test('membership without complete roles never assigned',async()=>{
 const {calls,ranker}=harness(u=>u.pathname.endsWith('/roles')?rolePage:{groupMemberships:[{...member(),roles:undefined}]});
 const r=await ranker.cycle({write:true});assert.equal(r.assigned,0);assert.equal(r.missingRoles,1);assert.ok(calls.every(c=>c.init.method==='GET'));
});
test('429 respects Retry-After without retrying write or disclosing response',async()=>{
 const ranker=createRanker({key:'PRIVATE',sleep:async()=>{},fetchFn:async()=>({ok:false,status:429,headers:new Headers({'retry-after':'120'})})});
 await assert.rejects(ranker.cycle(),e=>e.code==='HTTP_429'&&e.retryMs===120000&&!e.message.includes('PRIVATE'));
});
test('network errors are sanitized',async()=>{
 const ranker=createRanker({key:'PRIVATE',sleep:async()=>{},fetchFn:async()=>{throw Error('PRIVATE')}});
 await assert.rejects(ranker.cycle(),e=>e.code==='NETWORK_OR_TIMEOUT'&&!e.message.includes('PRIVATE'));
});
test('missing env leaves existing Discord process untouched',()=>{assert.equal(startBsaAutoRank({env:{},log:()=>{throw Error('should not log')}}),undefined)});
test('member leaving between scan and write is skipped',async()=>{
 const {ranker}=harness(u=>u.pathname.endsWith('/roles')?rolePage:{groupMemberships:u.searchParams.has('filter')?[]:[member()]});
 assert.equal((await ranker.cycle({write:true})).assigned,0);
});

test('built-in member omitted from role catalogue is verified and assigned',async()=>{
 const builtin=`groups/${GROUP}/roles/12884901889`;
 let ranked=false;
 const {calls,ranker}=harness((u,init)=>{
  if(u.pathname.endsWith('/roles'))return rolePage;
  if(u.pathname.endsWith('/roles/12884901889'))return {path:builtin,displayName:'member',rank:1};
  if(init.method==='POST'){ranked=true;return member([ROLE]);}
  return {groupMemberships:[ranked?member([ROLE]):{...member(),role:builtin}]};
 });
 assert.equal((await ranker.cycle({write:true})).assigned,1);
 assert.equal(calls.filter(c=>c.init.method==='POST').length,1);
 assert.equal((await ranker.cycle({write:true})).assigned,0);
});

test('unknown singular custom role remains protected after lookup',async()=>{
 const unknown=`groups/${GROUP}/roles/777`;
 const {calls,ranker}=harness(u=>u.pathname.endsWith('/roles')?rolePage:
  u.pathname.endsWith('/roles/777')?{path:unknown,displayName:'Officer',rank:3}:
  {groupMemberships:[{...member(),role:unknown}]});
 assert.equal((await ranker.cycle({write:true})).assigned,0);
 assert.ok(calls.every(c=>c.init.method==='GET'));
});

test('verified built-in membership ranked during scan is protected',async()=>{
 const builtin=`groups/${GROUP}/roles/12884901889`;
 const {calls,ranker}=harness(u=>u.pathname.endsWith('/roles')?rolePage:
  u.pathname.endsWith('/roles/12884901889')?{path:builtin,displayName:'member',rank:1}:
  {groupMemberships:[u.searchParams.has('filter')?member([other]):{...member(),role:builtin}]});
 assert.equal((await ranker.cycle({write:true})).assigned,0);
 assert.ok(calls.every(c=>c.init.method==='GET'));
});
