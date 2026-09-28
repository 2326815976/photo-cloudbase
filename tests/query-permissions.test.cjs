const test = require('node:test');
const assert = require('node:assert/strict');
const loadTypeScript = require('./helpers/load-typescript.cjs');
const { enforceQueryPermissions } = loadTypeScript('lib/cloudbase/permissions.ts');
const user = { role: 'user', user: { id: 'user-1', email: 'user@example.test' } };

test('普通用户不能通过资料更新改写角色或身份字段', () => {
  for (const values of [{ role: 'admin' }, { id: 'user-2' }, { email: 'admin@example.test' }]) {
    assert.throws(() => enforceQueryPermissions({ table: 'profiles', action: 'update', values }, user), /未授权/);
  }
});

test('普通用户资料编辑仍允许姓名和联系方式，并限定本人', () => {
  const scoped = enforceQueryPermissions({ table: 'profiles', action: 'update', values: { name: '测试用户', phone: '13800138000', wechat: 'test' } }, user);
  assert.ok(scoped.filters.some((filter) => filter.column === 'id' && filter.value === 'user-1'));
  assert.equal(scoped.values.name, '测试用户');
});

test('微信账号维持仅修改用户名的约束', () => {
  const wechatUser = { ...user, user: { ...user.user, email: 'test@wechat.miniprogram.local' } };
  assert.throws(() => enforceQueryPermissions({ table: 'profiles', action: 'update', values: { phone: '13800138000' } }, wechatUser), /仅允许修改用户名/);
  assert.equal(enforceQueryPermissions({ table: 'profiles', action: 'update', values: { name: ' 新名字 ' } }, wechatUser).values.name, '新名字');
});

test('普通用户不能绕过密钥校验直接新增或转移相册绑定', () => {
  for (const action of ['insert', 'update']) {
    assert.throws(() => enforceQueryPermissions({ table: 'user_album_bindings', action, values: { user_id: 'user-2', album_id: 'private-album' } }, user), /未授权/);
  }
});

test('新预约不能由普通用户直接确认为已完成或已确认', () => {
  for (const status of ['confirmed', 'finished', 'cancelled', 'in_progress']) {
    assert.throws(() => enforceQueryPermissions({ table: 'bookings', action: 'insert', values: { phone: '13800138000', status } }, user), /未授权/);
  }
  const scoped = enforceQueryPermissions({ table: 'bookings', action: 'insert', values: [{ user_id: 'user-2', phone: '13800138000', status: 'pending' }] }, user);
  assert.equal(scoped.values[0].user_id, 'user-1');
});

test('管理员仍可以管理角色、预约和相册绑定', () => {
  const admin = { role: 'admin', user: { id: 'admin-1' } };
  for (const payload of [
    { table: 'profiles', action: 'update', values: { role: 'admin' } },
    { table: 'bookings', action: 'insert', values: { status: 'finished' } },
    { table: 'user_album_bindings', action: 'insert', values: { album_id: 'album-1' } },
  ]) assert.deepEqual(enforceQueryPermissions(payload, admin).values, payload.values);
});
