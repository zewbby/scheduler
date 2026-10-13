import test from 'node:test';
test('name-only day tasks accept empty times while retaining legacy timed records',()=>{const legacy=createExamples(new Date())[0];assert.equal(validItem({...legacy,startTime:'',endTime:'',createdAt:legacy.updatedAt}),true);assert.equal(validItem({...legacy,startTime:'',endTime:'10:00'}),false);assert.equal(validItem({...legacy,createdAt:legacy.updatedAt+1}),false);assert.equal(validItem(legacy),true);});
import assert from 'node:assert/strict';
import { dateKey,parseDate,addDays,startOfWeek,monthDays,layoutEvents,validItem,createExamples,taskTime,taskOrder } from './model';
test('single time tags coexist with legacy records and sort without moving completed tasks',()=>{
 const seed=createExamples(new Date())[0],untimed={...seed,id:'old',startTime:'',endTime:''},later={...untimed,id:'late',time:'18:30',createdAt:seed.updatedAt},early={...untimed,id:'early',time:'06:15',completed:true};
 assert.equal(validItem(later),true);assert.equal(validItem({...later,time:'24:00'}),false);assert.equal(validItem({...later,time:42}),false);assert.equal(validItem({...later,time:''}),true);assert.equal(taskTime(seed),seed.startTime);assert.equal(taskTime(untimed),'');
 assert.deepEqual([untimed,later,early].sort(taskOrder).map(x=>x.id),['early','late','old']);assert.equal(taskTime({...seed,time:''}),'');
});
import { mergeSync,normalizedEndpoint,selectSyncBatch,syncRequest,readConfig } from './sync';
test('local calendar stays correct across leap days and year boundaries',()=>{assert.equal(dateKey(addDays(parseDate('2024-02-28'),1)),'2024-02-29');assert.equal(dateKey(startOfWeek(parseDate('2026-01-01'))),'2025-12-29');assert.equal(monthDays(parseDate('2026-10-13')).length,42);});
test('overlapping events receive separate lanes and later events regain width',()=>{const item=createExamples(parseDate('2026-10-13'))[0];const rows=[{...item,id:'a',startTime:'09:00',endTime:'10:00'},{...item,id:'b',startTime:'09:30',endTime:'11:00'},{...item,id:'c',startTime:'11:00',endTime:'12:00'}];const layout=layoutEvents(rows);assert.deepEqual(layout.map(x=>[x.column,x.columns]),[[0,2],[1,2],[0,1]]);});
test('backup validation rejects impossible dates and backwards intervals',()=>{const item=createExamples(new Date())[0];assert.ok(validItem(item));assert.equal(validItem({...item,date:'2026-02-30'}),false);assert.equal(validItem({...item,endTime:item.startTime}),false);});
test('sync preserves edits made during a request, including deletions',()=>{const item=createExamples(new Date())[0];const edited={...item,title:'new edit',updatedAt:item.updatedAt+1};const response={items:[item],cursor:8,full:false,serverTime:Date.now()};const merged=mergeSync([edited],[item.id],[item],response);assert.equal(merged.items[0].title,'new edit');assert.deepEqual(merged.pending,[item.id]);const accepted=mergeSync([item],[item.id],[item],response);assert.deepEqual(accepted.pending,[]);assert.equal(mergeSync([{...edited,deleted:true}],[item.id],[item],response).items[0].deleted,true);});
test('sync endpoint rejects remote insecure and credential-bearing URLs',()=>{assert.equal(normalizedEndpoint('https://example.workers.dev/'),'https://example.workers.dev');assert.throws(()=>normalizedEndpoint('http://example.com'));assert.throws(()=>normalizedEndpoint('https://a:b@example.com'));assert.throws(()=>normalizedEndpoint('https://example.com/api/sync'));});

test('sync batches respect byte limits for long Chinese notes and 250 record limit',()=>{
  const seed=createExamples(new Date())[0];
  const large=Array.from({length:250},(_,index)=>({...seed,id:`large-${index}`,notes:'字'.repeat(10000)}));
  const chosen=selectSyncBatch(large,large.map(item=>item.id),9000);
  assert.ok(chosen.length>0&&chosen.length<250);
  assert.ok(new TextEncoder().encode(JSON.stringify({since:9000,items:chosen})).byteLength<=2*1024*1024);
  assert.ok(new TextEncoder().encode(JSON.stringify({since:9000,items:large.slice(0,chosen.length+1)})).byteLength>2*1024*1024);
  const small=Array.from({length:251},(_,index)=>({...seed,id:`small-${index}`,notes:''}));
  assert.equal(selectSyncBatch(small,small.map(item=>item.id),0).length,250);
  assert.deepEqual(selectSyncBatch(small,[],0),[]);
});

test('sync accepts exact submitted server winners and preserves unrelated outbox edits',()=>{
  const seed=createExamples(new Date())[0];const unrelated={...seed,id:'other',title:'local-only'};
  const remote={...seed,title:'server tie winner',deleted:true};
  const merged=mergeSync([seed,unrelated],[seed.id,unrelated.id],[seed],{items:[remote,{...unrelated,title:'stale remote'}],cursor:5,full:true,serverTime:Date.now()});
  assert.equal(merged.items.find(item=>item.id===seed.id)?.deleted,true);
  assert.equal(merged.items.find(item=>item.id===unrelated.id)?.title,'local-only');
  assert.deepEqual(merged.pending,[unrelated.id]);
});

test('sync never advances from a malformed or incomplete server acknowledgement',async()=>{
  const seed=createExamples(new Date())[0];
  const originalFetch=globalThis.fetch;
  try {
    for(const body of [null,{items:[],cursor:1,full:true,serverTime:Date.now()},{items:[seed,seed],cursor:1,full:true,serverTime:Date.now()},{items:[seed],cursor:1}]){
      globalThis.fetch=async()=>new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
      await assert.rejects(syncRequest('https://example.workers.dev','token',0,[seed]));
    }
    globalThis.fetch=async()=>new Response(JSON.stringify({items:[seed],cursor:1,full:true,serverTime:Date.now()}),{status:200,headers:{'Content-Type':'application/json'}});
    assert.equal((await syncRequest('https://example.workers.dev','token',0,[seed])).cursor,1);
  } finally { globalThis.fetch=originalFetch; }
});

test('corrupted sync settings fall back safely without breaking app startup',()=>{
  const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  try {
    for(const value of ['null','false','{"endpoint":42}','{"endpoint":"http://remote.example"}','bad json']){
      Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>value}});
      assert.deepEqual(readConfig(),{endpoint:''});
    }
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>' {"endpoint":"https://example.workers.dev/"}'}});
    assert.deepEqual(readConfig(),{endpoint:'https://example.workers.dev'});
  } finally { if(original)Object.defineProperty(globalThis,'localStorage',original);else Reflect.deleteProperty(globalThis,'localStorage'); }
});
