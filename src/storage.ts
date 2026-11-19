import type { Session } from './types';

/** Deliberately separate from WebGazer/localforage's calibration database. */
export const STUDY_DB_NAME = 'painting-pilot-study-v1';
const TABLES = ['samples', 'events', 'responses', 'validation'] as const;
const CHUNK_SIZE = 128;
type Table = typeof TABLES[number];
type StoredSession = Omit<Session, Table> & { counts: Record<Table, number>; savedAtUtc: string };
let dbPromise: Promise<IDBDatabase> | undefined;
let writes: Promise<void> = Promise.resolve();

function database(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(STUDY_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('sessions', { keyPath: 'sessionId' });
      TABLES.forEach(table => request.result.createObjectStore(table, { keyPath: ['sessionId', 'chunk'] }));
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); dbPromise = undefined; };
      resolve(request.result);
    };
    request.onerror = () => { dbPromise = undefined; reject(request.error); };
    request.onblocked = () => { dbPromise = undefined; reject(new Error('研究数据存储被另一标签页阻塞，请关闭旧标签页后重试。')); };
  });
  return dbPromise;
}
function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
function completed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? new Error('研究数据保存事务中断')); });
}

/** Atomically save metadata and new chunks. At most the trailing chunk is rewritten. */
export function saveSession(session: Session): Promise<void> {
  const snapshot = structuredClone(session);
  const operation = writes.catch(() => undefined).then(async () => {
    const db = await database();
    const tx = db.transaction(['sessions', ...TABLES], 'readwrite');
    const done = completed(tx);
    const store = tx.objectStore('sessions');
    const get = store.get(snapshot.sessionId);
    get.onsuccess = () => {
      const previous = get.result as StoredSession | undefined;
      const counts = {} as Record<Table, number>;
      for (const table of TABLES) {
        const rows = snapshot[table];
        counts[table] = rows.length;
        const start = Math.floor(Math.min(previous?.counts[table] ?? 0, rows.length) / CHUNK_SIZE);
        for (let chunk = start; chunk * CHUNK_SIZE < rows.length; chunk++) {
          tx.objectStore(table).put({ sessionId: snapshot.sessionId, chunk, rows: rows.slice(chunk * CHUNK_SIZE, (chunk + 1) * CHUNK_SIZE) });
        }
        // A shrinking snapshot is uncommon, but obsolete tail chunks must never reappear.
        const oldChunks = Math.ceil((previous?.counts[table] ?? 0) / CHUNK_SIZE);
        for (let chunk = Math.ceil(rows.length / CHUNK_SIZE); chunk < oldChunks; chunk++) tx.objectStore(table).delete([snapshot.sessionId, chunk]);
      }
      const { samples: _s, events: _e, responses: _r, validation: _v, ...metadata } = snapshot;
      store.put({ ...metadata, counts, savedAtUtc: new Date().toISOString() });
    };
    await done;
  });
  writes = operation;
  return operation;
}

export async function listSessions(): Promise<Session[]> {
  await writes.catch(() => undefined);
  const db = await database();
  const tx = db.transaction(['sessions', ...TABLES], 'readonly');
  const done = completed(tx);
  const records = requestValue<StoredSession[]>(tx.objectStore('sessions').getAll());
  const tables = TABLES.map(table => requestValue<{sessionId:string;chunk:number;rows:unknown[]}[]>(tx.objectStore(table).getAll()));
  const [metas, ...allChunks] = await Promise.all([records, ...tables]);
  await done;
  return (metas as StoredSession[]).map(meta => {
    const { counts, savedAtUtc: _saved, ...base } = meta;
    const session = base as Session;
    TABLES.forEach((table, tableIndex) => {
      const chunks = allChunks[tableIndex] as {sessionId:string;chunk:number;rows:unknown[]}[];
      Object.assign(session, { [table]: chunks.filter(chunk => chunk.sessionId === meta.sessionId).sort((a,b) => a.chunk-b.chunk).flatMap(chunk => chunk.rows).slice(0, counts[table]) });
    });
    return session;
  }).sort((a,b) => b.startedUtc.localeCompare(a.startedUtc));
}

/** Old protocols archive a broken run. For Pilot 2, keep the resumable source
 * and return an exportable read-only snapshot when the original tab is gone. */
export async function recoverInterruptedSessions(resumeId?:string): Promise<Session[]> {
  const sessions = await listSessions();
  const locks=navigator.locks?await navigator.locks.query():null;
  const running=new Set((locks?.held??[]).map(l=>l.name));
  const visible=sessions.filter(s=>s.status!=='active'||!s.config.pilotSurveyVersion||s.sessionId===resumeId||!running.has('painting-pilot:'+s.sessionId));
  for (const session of visible) {
    if (session.status !== 'active' || session.sessionId===resumeId) continue;
    const pilotSnapshot=Boolean(session.config.pilotSurveyVersion);
    const lastKnownMs = Math.max(session.events.reduce((max,e)=>Math.max(max,e.timeMs),0), session.samples.reduce((max,s)=>Math.max(max,s.callbackTimeMs),0));
    const previousPhase = session.phase;
    session.status = 'interrupted';
    session.phase = 'interrupted';
    session.endedUtc = new Date().toISOString();
    if(!pilotSnapshot)session.quality = session.quality === 'flow_only' ? 'flow_only' : 'low_quality';
    session.qualityNotes.push(pilotSnapshot?'这是本机最后保存的只读快照。中断前已填写的问卷保留，尚未提交的页保留草稿状态。':'页面刷新或崩溃；已恢复最后保存批次。未保存尾段不可恢复。新采集须建立新会话并重新校准。');
    session.timings.forEach(timing => {
      if (timing.status === 'active') {
        timing.status = 'interrupted';
        timing.endedMs = lastKnownMs;
        timing.wallMs = Math.max(timing.wallMs, lastKnownMs - timing.startedMs);
      }
    });
    for (const exposure of session.cardExposures??[]) {
      if (exposure.hiddenMs!==null) continue;
      exposure.hiddenMs=Math.max(lastKnownMs,exposure.shownMs);
      session.events.push({sessionId:session.sessionId,participantId:session.participantId,timeMs:exposure.hiddenMs,type:'card_end_recovered',phase:'interrupted',paintingId:exposure.paintingId,detail:JSON.stringify({exposureId:exposure.exposureId,estimated:true})});
    }
    session.events.push({ sessionId:session.sessionId, participantId:session.participantId, timeMs:lastKnownMs, type:pilotSnapshot?'pilot_archived_snapshot':'recovered_interrupted', phase:'interrupted', paintingId:null, detail:JSON.stringify({previousPhase,recoveredAtUtc:session.endedUtc,clock:'last persisted original-page monotonic timestamp; not recovery exposure time'}) });
    if(!pilotSnapshot)await saveSession(session);
  }
  return visible;
}
