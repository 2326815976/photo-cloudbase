const test = require('node:test');
const assert = require('node:assert/strict');
const loadTypeScript = require('./helpers/load-typescript.cjs');

const outage = Object.assign(new Error('database connection failed'), { code: 'TRANSIENT_BACKEND' });
const sqlBoundary = {
  executeSQL: async () => { throw outage; },
  extractErrorMessage: (error) => error.message,
  isRetryableSqlError: (error) => error.code === 'TRANSIENT_BACKEND',
  logSqlError() {},
  TRANSIENT_BACKEND_ERROR_CODE: 'TRANSIENT_BACKEND',
  TRANSIENT_BACKEND_ERROR_MESSAGE: '数据库服务暂时不可用，请稍后重试',
};

test('配置接口读取失败返回错误，不返回全部菜单的成功配置', async () => {
  const route = loadTypeScript('app/api/miniprogram/runtime-config/route.ts', {
    '@/lib/page-center/runtime': { loadEffectiveMiniProgramRuntimeConfig: async () => { throw outage; } },
    '@/lib/cloudbase/sql-executor': sqlBoundary,
  });
  const response = await route.GET();
  assert.equal(response.status, 503);
  const payload = await response.json();
  assert.equal(payload.error.code, 'TRANSIENT_BACKEND');
  assert.equal(payload.tabBarItems, undefined);
});

test('结构探测超时不能缓存为表不存在，恢复后应重新查询', async () => {
  let fail = true;
  const compat = loadTypeScript('lib/page-center/sql-compat.ts', {
    '@/lib/cloudbase/sql-executor': {
      ...sqlBoundary,
      executeSQL: async () => { if (fail) throw outage; return { rows: [{ row_count: 1 }] }; },
    },
  });
  await assert.rejects(compat.tableExists('app_page_registry'), /connection failed/);
  await assert.rejects(compat.hasTableColumns('app_page_registry', ['is_nav_candidate_web']), /connection failed/);
  fail = false;
  assert.equal(await compat.tableExists('app_page_registry'), true);
  assert.equal(await compat.hasTableColumns('app_page_registry', ['is_nav_candidate_web']), true);
});

for (const method of ['loadActiveMiniProgramRuntimeConfigFromDatabase', 'loadPageCenterRows']) {
  test(`${method} 不将数据库故障转换成缺省配置`, async () => {
    const runtime = loadTypeScript('lib/page-center/runtime.ts', {
      '@/lib/cloudbase/sql-executor': sqlBoundary,
      '@/lib/page-center/sql-compat': { tableExists: async () => true, hasTableColumns: async () => true },
      '@/lib/page-center/legacy-beta-admin': {},
    });
    await assert.rejects(runtime[method](), /connection failed/);
  });
}

test('后端保留显式空菜单与全禁用菜单', () => {
  const runtime = loadTypeScript('lib/miniprogram/runtime-config.ts');
  assert.equal(runtime.normalizeTabBarItems([]).length, 0);
  assert.equal(runtime.normalizeTabBarItems(runtime.buildStandardTabBarItems().map((item) => ({ ...item, enabled: false }))).length, 0);
  assert.equal(runtime.normalizeTabBarItems(null).length, 5);
});

test('后端首页回退只选择可见菜单', () => {
  const runtime = loadTypeScript('lib/miniprogram/runtime-config.ts');
  const gallery = runtime.buildStandardTabBarItems().filter((item) => item.key === 'gallery');
  assert.equal(runtime.normalizeHomeEntryPagePath('pages/index/index', gallery, 'pose'), 'pages/gallery/index');
  assert.equal(runtime.normalizeHomeEntryPagePath(null, [], 'pose'), '');
  assert.equal(runtime.normalizeHomeEntryPagePath(null, [], 'gallery'), '');
});
