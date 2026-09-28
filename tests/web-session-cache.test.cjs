const test = require('node:test');
const assert = require('node:assert/strict');
const loadTypeScript = require('./helpers/load-typescript.cjs');

function deferred() {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
}

function createClient(t, fetch) {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  t.after(() => {
    if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
    else delete globalThis.window;
  });
  t.mock.method(globalThis, 'fetch', fetch);
  const module = loadTypeScript('lib/cloudbase/client.ts', { '@/lib/env': { env: {} } });
  return { client: module.createClient(), invalidate: module.invalidateClientSessionCache };
}

test('Web 旧登录查询晚到后不能恢复已退出的用户', async (t) => {
  const oldResponse = deferred();
  let reads = 0;
  const { client } = createClient(t, async (url) => {
    if (url === '/api/auth/session') return ++reads === 1 ? oldResponse.promise : Response.json({ user: null });
    return Response.json({ data: null });
  });
  const pending = client.auth.getUser();
  await client.auth.signOut();
  oldResponse.resolve(Response.json({ user: { id: 'old-user' } }));
  await pending;
  assert.equal((await client.auth.getUser()).data.user, null);
});

test('Web 旧匿名响应不会覆盖新查询的登录状态', async (t) => {
  const oldResponse = deferred();
  let reads = 0;
  const { client, invalidate } = createClient(t, async () => ++reads === 1
    ? oldResponse.promise
    : Response.json({ user: { id: 'new-user' } }));
  const oldUser = client.auth.getUser();
  invalidate();
  assert.equal((await client.auth.getUser()).data.user.id, 'new-user');
  oldResponse.resolve(Response.json({ user: null }));
  assert.equal((await oldUser).data.user?.id, 'new-user');
  assert.equal((await client.auth.getUser()).data.user.id, 'new-user');
  assert.equal(reads, 2);
});

test('Web 退出进行期间读到的旧会话，在退出完成后重新确认', async (t) => {
  const logout = deferred();
  let signedOut = false;
  const { client } = createClient(t, async (url) => {
    if (url === '/api/auth/logout') { await logout.promise; signedOut = true; return Response.json({ error: null }); }
    return Response.json({ user: signedOut ? null : { id: 'old-user' } });
  });
  const pending = client.auth.signOut();
  await client.auth.getUser();
  logout.resolve();
  await pending;
  assert.equal((await client.auth.getUser()).data.user, null);
});
