const test = require('node:test');
const assert = require('node:assert/strict');
const loadTypeScript = require('./helpers/load-typescript.cjs');

function deferred() {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
}

const userRows = { rows: [{ id: 'user-1', email: 'test@example.test', role: 'user', name: '测试用户' }] };
function loadStore(executeSQL) {
  return loadTypeScript('lib/auth/session-store.ts', { '@/lib/cloudbase/sql-executor': { executeSQL } });
}

for (const scope of ['token', 'user']) {
  test(`注销 ${scope} 时在途查询不能重新缓存已撤销的会话`, async () => {
    const oldLookup = deferred();
    let reads = 0;
    const store = loadStore(async (sql) => {
      if (sql.includes('SELECT')) return ++reads === 1 ? oldLookup.promise : { rows: [] };
      return { rows: [] };
    });
    const lookup = store.findSessionUser('test-token');
    if (scope === 'token') await store.revokeSessionByToken('test-token');
    else await store.revokeSessionsByUserId('user-1');
    oldLookup.resolve(userRows);
    assert.equal(await lookup, null);
    assert.equal(await store.findSessionUser('test-token'), null);
  });
}

test('撤销写入期间读取的会话，在撤销完成后不能继续命中缓存', async () => {
  const revoke = deferred();
  let revoked = false;
  const store = loadStore(async (sql) => {
    if (sql.includes('SET is_revoked = 1')) { await revoke.promise; revoked = true; return { rows: [] }; }
    if (sql.includes('SELECT')) return revoked ? { rows: [] } : userRows;
    return { rows: [] };
  });
  const revoking = store.revokeSessionByToken('test-token');
  assert.equal((await store.findSessionUser('test-token')).id, 'user-1');
  revoke.resolve();
  await revoking;
  assert.equal(await store.findSessionUser('test-token'), null);
});

test('旧查询完成不能移除更新后的合并查询', async () => {
  const oldLookup = deferred();
  const newLookup = deferred();
  let reads = 0;
  const store = loadStore(async (sql) => {
    if (sql.includes('SELECT')) return ++reads === 1 ? oldLookup.promise : newLookup.promise;
    return { rows: [] };
  });
  const first = store.findSessionUser('test-token');
  await store.revokeSessionByToken('test-token');
  const second = store.findSessionUser('test-token');
  oldLookup.resolve(userRows);
  await new Promise((resolve) => setImmediate(resolve));
  const third = store.findSessionUser('test-token');
  newLookup.resolve({ rows: [] });
  const users = await Promise.all([first, second, third]);
  assert.ok(users.every((user) => user === null));
  assert.equal(reads, 2);
});
