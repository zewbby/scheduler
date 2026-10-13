import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import worker, { canonicalPayload, validateItem } from '../src/worker.mjs';

const TOKEN = 'test-only-personal-workspace-token-0000000000';

// Execute the real migration and SQL against SQLite; only the D1 transport is adapted.
class SqliteD1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec(readFileSync(new URL('../migrations/0001_planner.sql', import.meta.url), 'utf8'));
    this.sqlite.exec(readFileSync(new URL('../migrations/0002_profile.sql', import.meta.url), 'utf8'));
  }
  withSession(mode) { assert.equal(mode, 'first-primary'); return this; }
  prepare(sql) {
    const build = (values) => ({
      sql, values, bind: (...next) => build(next),
      first: async () => this.sqlite.prepare(sql).get(...values) ?? null,
    });
    return build([]);
  }
  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try {
      const result = statements.map(({ sql, values }) => {
        const statement = this.sqlite.prepare(sql);
        const results = /^\s*SELECT/i.test(sql) ? statement.all(...values) : (statement.run(...values), []);
        return { success: true, results };
      });
      this.sqlite.exec('COMMIT');
      return result;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
}

function item(overrides = {}) {
  return { id: 'event-a', title: '整理本周计划', date: '2026-10-13', startTime: '09:00', endTime: '10:00', category: 'work', notes: '留一点时间给自己。🌿', completed: false, updatedAt: 1000, deleted: false, ...overrides };
}
function environment() {
  return { DB: new SqliteD1(), SYNC_TOKEN: TOKEN, ALLOWED_ORIGINS: 'http://localhost:5173', ALLOW_FILE_ORIGIN: 'true' };
}
test('day-card tasks synchronize without invented times and preserve creation order',async()=>{const env=environment();const original=item({id:'card-task',startTime:'',endTime:'',createdAt:1000});const saved=await sync(env,0,[original]);assert.equal(saved.items[0].startTime,'');assert.equal(saved.items[0].createdAt,1000);const completed=await sync(env,saved.cursor,[{...original,completed:true,updatedAt:2000}]);assert.equal(completed.items[0].createdAt,1000);assert.equal(completed.items[0].completed,true);assert.equal((await worker.fetch(request({since:0,items:[{...original,endTime:'10:00'}]}),env)).status,400);});
function accountEnvironment(){const env=environment();const salt=randomBytes(24);env.ACCOUNT_PASSWORD_RECORD=JSON.stringify({version:1,username:'test-user',iterations:10000,salt:salt.toString('base64url'),hash:pbkdf2Sync('testing-password',salt,10000,32,'sha256').toString('base64url')});return env;}
test('account login returns a sync credential only after verifying username and password',async()=>{
 const env=accountEnvironment();
 const wrong=await worker.fetch(request({username:'test-user',password:'wrong-password'}, {}, 'POST','/api/login'),env);assert.equal(wrong.status,401);assert.equal(JSON.stringify(await wrong.json()).includes(TOKEN),false);
 const response=await worker.fetch(request({username:'test-user',password:'testing-password'}, {}, 'POST','/api/login'),env);assert.equal(response.status,200);assert.deepEqual(await response.json(),{username:'test-user',token:TOKEN});
 assert.equal((await worker.fetch(request({username:'other-user',password:'testing-password'}, {}, 'POST','/api/login'),env)).status,401);
});
test('account login rate limits attempts and rejects missing credential configuration',async()=>{
 const env=accountEnvironment();for(let i=0;i<8;i++)assert.equal((await worker.fetch(request({username:'test-user',password:'incorrect'}, {}, 'POST','/api/login'),env)).status,401);
 assert.equal((await worker.fetch(request({username:'test-user',password:'testing-password'}, {}, 'POST','/api/login'),env)).status,429);
 assert.equal((await worker.fetch(request({username:'test-user',password:'testing-password'}, {}, 'POST','/api/login'),environment())).status,503);
 assert.equal((await worker.fetch(request({username:'test-user',password:''}, {}, 'POST','/api/login'),accountEnvironment())).status,400);
});
function request(body, headers = {}, method = 'POST', path = '/api/sync') {
  return new Request(`https://sync.example.com${path}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, Origin: 'http://localhost:5173', ...headers },
    ...(['GET', 'OPTIONS'].includes(method) ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
}
test('avatar choices synchronize across devices and stale profile writes cannot overwrite them',async()=>{
 const env=environment();assert.equal(await (await worker.fetch(request(null,{},'GET','/api/profile'),env)).json(),null);
 const first={avatarId:'notebook-yellow',image:null,updatedAt:1000},second={avatarId:'notebook-blue',image:null,updatedAt:2000};
 assert.deepEqual(await (await worker.fetch(request(first,{},'PUT','/api/profile'),env)).json(),first);
 assert.deepEqual(await (await worker.fetch(request(second,{},'PUT','/api/profile'),env)).json(),second);
 assert.deepEqual(await (await worker.fetch(request(first,{},'PUT','/api/profile'),env)).json(),second);
 assert.deepEqual(await (await worker.fetch(request(null,{},'GET','/api/profile'),env)).json(),second);
});
test('avatar API requires authentication and rejects executable or oversized image data',async()=>{
 const env=environment();
 assert.equal((await worker.fetch(request(null,{Authorization:'Bearer invalid'},'GET','/api/profile'),env)).status,401);
 for(const value of [{avatarId:'anything',image:null,updatedAt:1000},{avatarId:'custom',image:'data:image/svg+xml;base64,PHN2Zz4=',updatedAt:1000},{avatarId:'custom',image:'data:image/png;base64,AAAA',updatedAt:1000},{avatarId:'custom',image:'data:image/png;base64,'+'A'.repeat(180000),updatedAt:1000}])assert.equal((await worker.fetch(request(value,{},'PUT','/api/profile'),env)).status,400);
 assert.equal(await (await worker.fetch(request(null,{},'GET','/api/profile'),env)).json(),null);
 const value={avatarId:'custom',image:'data:image/webp;base64,UklGRiIAAABXRUJQ',updatedAt:1000};
 assert.deepEqual(await (await worker.fetch(request(value,{},'PUT','/api/profile'),env)).json(),value);
});
async function sync(env, since = 0, items = []) {
  const response = await worker.fetch(request({ since, items }), env);
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}

test('two devices exchange creations and edits through incremental sync', async () => {
  const env = environment();
  const initial = await sync(env, 0, [item()]);
  assert.equal(initial.cursor, 1);
  assert.equal(initial.full, true);
  assert.equal(initial.items[0].title, item().title);
  const deviceB = await sync(env);
  assert.equal(deviceB.items.length, 1);
  const changed = await sync(env, deviceB.cursor, [item({ title: '第二台设备修改', updatedAt: 2000 })]);
  assert.equal(changed.cursor, 2);
  const deviceA = await sync(env, initial.cursor);
  assert.equal(deviceA.items.length, 1);
  assert.equal(deviceA.items[0].title, '第二台设备修改');
  assert.deepEqual((await sync(env, deviceA.cursor)).items, []);
});

test('retry is idempotent and stale client always receives canonical winner', async () => {
  const env = environment();
  const original = await sync(env, 0, [item({ updatedAt: 5000 })]);
  const retry = await sync(env, original.cursor, [item({ updatedAt: 5000 })]);
  assert.equal(retry.cursor, original.cursor);
  assert.equal(retry.items.length, 1);
  const stale = await sync(env, original.cursor, [item({ title: 'stale write', updatedAt: 1000 })]);
  assert.equal(stale.cursor, original.cursor);
  assert.equal(stale.items[0].title, item().title);
});

test('tombstones survive stale devices and new devices receive deletions', async () => {
  const env = environment();
  const initial = await sync(env, 0, [item()]);
  const deletion = await sync(env, initial.cursor, [item({ updatedAt: 2000, deleted: true })]);
  assert.equal(deletion.items[0].deleted, true);
  const stale = await sync(env, deletion.cursor, [item()]);
  assert.equal(stale.items[0].deleted, true);
  const freshDevice = await sync(env, 0);
  assert.equal(freshDevice.items[0].deleted, true);
  assert.equal(freshDevice.cursor, deletion.cursor);
});

test('equal-time delete wins regardless of delivery order', async () => {
  for (const deletedFirst of [true, false]) {
    const env = environment();
    await sync(env, 0, [item({ deleted: deletedFirst })]);
    await sync(env, 0, [item({ deleted: !deletedFirst })]);
    assert.equal((await sync(env)).items[0].deleted, true);
  }
});

test('equal-time payload conflict converges with unicode titles regardless of order', async () => {
  const left = item({ title: '🌿 Hello' });
  const right = item({ title: '周二计划' });
  let canonical;
  for (const pair of [[left, right], [right, left]]) {
    const env = environment();
    await sync(env, 0, [pair[0]]);
    await sync(env, 0, [pair[1]]);
    const result = (await sync(env)).items[0];
    canonical ??= result.title;
    assert.equal(result.title, canonical);
    assert.equal(result.title, canonicalPayload(left) > canonicalPayload(right) ? left.title : right.title);
  }
});

test('250 records use a bulk statement, return all records and monotonic revisions', async () => {
  const env = environment();
  const items = Array.from({ length: 250 }, (_, index) => item({ id: `record-${index}` }));
  const result = await sync(env, 0, items);
  assert.equal(result.items.length, 250);
  assert.equal(result.cursor, 250);
  assert.equal(new Set(result.items.map((entry) => entry.revision)).size, 250);
});

test('ahead-of-server cursor requests a full snapshot', async () => {
  const env = environment();
  await sync(env, 0, [item()]);
  const result = await sync(env, 1000);
  assert.equal(result.full, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.cursor, 1);
});

test('an obsolete cursor still resets when new writes advance past it', async () => {
  const env = environment();
  await sync(env, 0, [item({ id: 'existing' })]);
  const result = await sync(env, 2, [item({ id: 'incoming-a' }), item({ id: 'incoming-b' })]);
  assert.equal(result.full, true);
  assert.equal(result.cursor, 3);
  assert.deepEqual(new Set(result.items.map((record) => record.id)), new Set(['existing', 'incoming-a', 'incoming-b']));
});

test('authorization and origin checks happen before any storage access', async () => {
  const env = environment();
  env.DB.batch = () => { throw new Error('Must not access storage'); };
  assert.equal((await worker.fetch(request({ since: 0, items: [] }, { Authorization: 'Bearer bad' }), env)).status, 401);
  assert.equal((await worker.fetch(request({ since: 0, items: [] }, { Origin: 'https://unknown.example' }), env)).status, 403);
  assert.equal((await worker.fetch(request({ since: 0, items: [] }), { ...env, SYNC_TOKEN: 'short' })).status, 503);
});

test('CORS preflights support explicit file origins and native requests', async () => {
  const env = environment();
  const fileResponse = await worker.fetch(request(null, { Origin: 'null' }, 'OPTIONS'), env);
  assert.equal(fileResponse.status, 204);
  assert.equal(fileResponse.headers.get('Access-Control-Allow-Origin'), 'null');
  assert.equal(fileResponse.headers.get('Access-Control-Allow-Credentials'), null);
  assert.equal((await worker.fetch(request(null, { Origin: 'null' }, 'OPTIONS'), { ...env, ALLOW_FILE_ORIGIN: 'false' })).status, 403);
  const native = request({ since: 0, items: [] });
  native.headers.delete('Origin');
  assert.equal((await worker.fetch(native, env)).status, 200);
});

test('malformed inputs do not partially write a batch', async () => {
  const env = environment();
  for (const body of [
    { since: -1, items: [] },
    { since: 0, items: [item(), item()] },
    { since: 0, items: [item(), item({ id: 'bad', date: '2026-02-30' })] },
    { since: 0, items: [item({ startTime: '10:00', endTime: '09:00' })] },
    { since: 0, items: [item({ updatedAt: Date.now() + 3600000 })] },
    { since: 0, items: [item({ deleted: 1 })] },
    { since: 0, items: [item({ id: "sql'injection" })] },
    { since: 0, items: Array.from({ length: 251 }, (_, index) => item({ id: `item-${index}` })) },
    '{bad json',
  ]) {
    assert.equal((await worker.fetch(request(body), env)).status, 400);
    assert.equal((await sync(env)).cursor, 0);
  }
  assert.equal((await worker.fetch(request({}, { 'Content-Type': 'text/plain' }), env)).status, 415);
  assert.equal((await worker.fetch(request('x'.repeat(2 * 1024 * 1024 + 1)), env)).status, 413);
});

test('D1 failures roll back all records and return a retryable error', async () => {
  const env = environment();
  env.DB.sqlite.exec(`CREATE TRIGGER fail_bad BEFORE INSERT ON planner_items WHEN NEW.id = 'fail' BEGIN SELECT RAISE(ABORT, 'test failure'); END;`);
  const response = await worker.fetch(request({ since: 0, items: [item(), item({ id: 'fail' })] }), env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'storage_unavailable');
  assert.equal((await sync(env)).cursor, 0);
  assert.deepEqual((await sync(env)).items, []);
});

test('normalization strips extra client fields and accepts real leap days', () => {
  assert.deepEqual(validateItem(item({ revision: 600, deviceSecret: 'strip' })), item());
  assert.equal(validateItem(item({ date: '2028-02-29' })).date, '2028-02-29');
  assert.throws(() => validateItem(item({ date: '2027-02-29' })));
  assert.match(canonicalPayload(item()), /\\ud83c\\udf3f/);
});
