import 'fake-indexeddb/auto';
import {describe,it,expect} from 'vitest';
import {saveSession,listSessions,recoverInterruptedSessions,STUDY_DB_NAME} from '../src/storage';
import {sampleFixture,sessionFixture} from './dataFixtures';
import {pilotConfig} from '../src/pilotMaterials';
import {buildPilotPlan,PILOT_VERSION,SELECTION_RULES} from '../src/pilotProtocol';

describe('isolated chunked IndexedDB',()=>{
  it('atomically persists appended batches, preserving completed participants',async()=>{
    const first=sessionFixture('first');first.samples=Array.from({length:130},(_,i)=>sampleFixture({sessionId:'first',sampleIndex:i,callbackTimeMs:i*20}));
    await saveSession(first);
    first.samples.push(sampleFixture({sessionId:'first',sampleIndex:130,callbackTimeMs:2600}));
    await saveSession(first);
    const second=sessionFixture('second');await saveSession(second);
    const sessions=await listSessions();
    expect(sessions.find(s=>s.sessionId==='first')?.samples).toEqual(first.samples);
    expect(sessions.find(s=>s.sessionId==='second')).toEqual(second);
    const request=indexedDB.open(STUDY_DB_NAME);
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    const tx=db.transaction('samples','readonly'),count=tx.objectStore('samples').count();
    const chunks=await new Promise<number>((resolve)=>{count.onsuccess=()=>resolve(count.result);});
    expect(chunks).toBe(2);db.close();
  });
  it('takes a snapshot at save invocation instead of observing later mutations',async()=>{
    const s=sessionFixture('snapshot');s.artBackground='saved';const pending=saveSession(s);s.artBackground='mutated';await pending;
    expect((await listSessions()).find(x=>x.sessionId==='snapshot')?.artBackground).toBe('saved');
  });
  it('archives unfinished trials as interrupted without fabricating exposure time or continuing clocks',async()=>{
    const s=sessionFixture('crash');s.phase='free_view';s.status='active';s.quality='accepted';
    s.samples=[sampleFixture({sessionId:s.sessionId,callbackTimeMs:500})];s.timings=[{trialId:'A-1',paintingId:'A',startedMs:100,endedMs:null,wallMs:400,activeMs:300,status:'active'}];
    await saveSession(s);
    const recovered=(await recoverInterruptedSessions()).find(x=>x.sessionId==='crash')!;
    expect(recovered.status).toBe('interrupted');expect(recovered.phase).toBe('interrupted');expect(recovered.quality).toBe('low_quality');
    expect(recovered.timings[0]).toEqual({...s.timings[0],endedMs:500,status:'interrupted'});
    expect(recovered.events.at(-1)?.timeMs).toBe(500);expect(recovered.samples).toEqual(s.samples);
    const again=(await recoverInterruptedSessions()).find(x=>x.sessionId==='crash')!;
    expect(again.events).toHaveLength(1);
    expect((await listSessions()).find(x=>x.sessionId==='first')?.status).toBe('completed');
  });
  it('opens separate P00 runs from IndexedDB with their saved status and original rehearsal data',async()=>{
    const practice=sessionFixture('practice-one');
    practice.participantId='P00';
    practice.config=structuredClone(pilotConfig);
    const plan=buildPilotPlan('P00');
    practice.pilot={version:PILOT_VERSION,practice:true,plan,seed:42,selectionRules:{...SELECTION_RULES}};
    practice.order=plan.map(t=>t.paintingId);
    practice.samples=[sampleFixture({participantId:'P00',sessionId:practice.sessionId,paintingId:practice.order[0]})];
    const second=structuredClone(practice);
    second.sessionId='practice-two';second.phase='interrupted';second.status='interrupted';second.samples=[];
    await Promise.all([saveSession(practice),saveSession(second)]);
    const saved=await recoverInterruptedSessions();
    expect(saved.find(s=>s.sessionId===practice.sessionId)).toEqual(practice);
    expect(saved.find(s=>s.sessionId===second.sessionId)).toEqual(second);
  });
});
