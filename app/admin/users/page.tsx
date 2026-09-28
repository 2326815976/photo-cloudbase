'use client';

import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { parseDateTimeUTC8 } from '@/lib/utils/date-helpers';

type NoticeTone = 'success' | 'error' | 'info';

interface AdminUserItem {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  wechat: string | null;
  role: 'user' | 'admin';
  isDisabled: boolean;
  disabledAt: string | null;
  createdAt: string | null;
  lastActiveAt: string | null;
  lastSessionAt: string | null;
  albumCount: number;
  bookingCount: number;
}

interface NoticeState {
  type: NoticeTone;
  message: string;
}

interface PasswordFormState {
  newPassword: string;
  confirmPassword: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function readResponsePayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function readPayloadField(payload: unknown, field: string): unknown {
  let current = payload;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!isRecord(current)) {
      return undefined;
    }

    if (Object.prototype.hasOwnProperty.call(current, field)) {
      return current[field];
    }

    current = current.data;
  }

  return undefined;
}

function readPayloadErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === 'string' && payload.trim()) {
    return payload.trim();
  }

  let current = payload;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!isRecord(current)) {
      break;
    }

    if (typeof current.error === 'string' && current.error.trim()) {
      return current.error.trim();
    }

    if (isRecord(current.error) && typeof current.error.message === 'string' && current.error.message.trim()) {
      return current.error.message.trim();
    }

    if (typeof current.message === 'string' && current.message.trim()) {
      return current.message.trim();
    }

    current = current.data;
  }

  return fallback;
}

function toSafeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toSafeText(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function toSafeBoolean(value: unknown): boolean {
  return Number(value ?? 0) > 0 || value === true;
}

function normalizeAdminUserRow(row: unknown): AdminUserItem | null {
  if (!isRecord(row)) {
    return null;
  }

  const id = String(row.id ?? '').trim();
  if (!id) {
    return null;
  }

  return {
    id,
    name: toSafeText(row.name),
    email: toSafeText(row.email),
    phone: toSafeText(row.phone),
    wechat: toSafeText(row.wechat),
    role: row.role === 'admin' ? 'admin' : 'user',
    isDisabled: toSafeBoolean(row.isDisabled ?? row.is_disabled),
    disabledAt: toSafeText(row.disabledAt ?? row.disabled_at),
    createdAt: toSafeText(row.createdAt ?? row.created_at),
    lastActiveAt: toSafeText(row.lastActiveAt ?? row.last_active_at),
    lastSessionAt: toSafeText(row.lastSessionAt ?? row.last_session_at),
    albumCount: toSafeNumber(row.albumCount ?? row.album_count),
    bookingCount: toSafeNumber(row.bookingCount ?? row.booking_count),
  };
}

function formatDateTimeText(value: string | null | undefined): string {
  const parsed = parseDateTimeUTC8(value);
  if (!parsed) {
    return '—';
  }

  return parsed.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function buildDisplayName(user: AdminUserItem): string {
  return user.name || user.phone || user.email || user.wechat || `用户 ${user.id.slice(0, 8)}`;
}

const EMPTY_PASSWORD_FORM: PasswordFormState = {
  newPassword: '',
  confirmPassword: '',
};

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [actingUserId, setActingUserId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AdminUserItem | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<AdminUserItem | null>(null);
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>(EMPTY_PASSWORD_FORM);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  const totalUsers = users.length;
  const activeUsers = useMemo(() => users.filter((item) => !item.isDisabled).length, [users]);

  const loadUsers = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const response = await fetch('/api/admin/users', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'include',
      });
      const payload = await readResponsePayload(response);
      if (!response.ok) {
        throw new Error(readPayloadErrorMessage(payload, '加载用户列表失败'));
      }

      const userRows = readPayloadField(payload, 'users');
      const nextUsers = Array.isArray(userRows)
        ? userRows.map((row) => normalizeAdminUserRow(row)).filter((row): row is AdminUserItem => Boolean(row))
        : [];
      const nextCurrentUserId = String(readPayloadField(payload, 'currentUserId') ?? '').trim();

      setUsers(nextUsers);
      setCurrentUserId(nextCurrentUserId);
      setError('');
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : '加载用户列表失败';
      setError(message);
      if (mode !== 'initial') {
        setNotice({ type: 'error', message });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers('initial');
  }, [loadUsers]);

  const handleToggleDisabled = useCallback(
    async (user: AdminUserItem) => {
      setActingUserId(user.id);
      try {
        const nextDisabled = !user.isDisabled;
        const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ isDisabled: nextDisabled }),
        });
        const payload = await readResponsePayload(response);
        if (!response.ok) {
          throw new Error(readPayloadErrorMessage(payload, nextDisabled ? '禁用用户失败' : '启用用户失败'));
        }

        setUsers((current) =>
          current.map((item) =>
            item.id === user.id
              ? {
                  ...item,
                  isDisabled: nextDisabled,
                  disabledAt: nextDisabled ? new Date().toISOString() : null,
                }
              : item
          )
        );
        setNotice({
          type: 'success',
          message: nextDisabled ? '账号已禁用，已同步清理该用户会话' : '账号已恢复启用',
        });
      } catch (actionError) {
        setNotice({
          type: 'error',
          message: actionError instanceof Error ? actionError.message : '更新用户状态失败',
        });
      } finally {
        setActingUserId('');
      }
    },
    []
  );

  const handleDeleteUser = useCallback(async () => {
    if (!deleteTarget) {
      return;
    }

    setActingUserId(deleteTarget.id);
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(deleteTarget.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const payload = await readResponsePayload(response);
      if (!response.ok) {
        throw new Error(readPayloadErrorMessage(payload, '删除用户失败'));
      }

      const warning = toSafeText(readPayloadField(payload, 'warning'));
      setUsers((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      setNotice({
        type: warning ? 'info' : 'success',
        message: warning || '用户账号已删除',
      });
    } catch (actionError) {
      setNotice({
        type: 'error',
        message: actionError instanceof Error ? actionError.message : '删除用户失败',
      });
    } finally {
      setActingUserId('');
    }
  }, [deleteTarget]);

  const handleOpenPasswordModal = useCallback((user: AdminUserItem) => {
    setPasswordTarget(user);
    setPasswordForm(EMPTY_PASSWORD_FORM);
    setPasswordError('');
  }, []);

  const handleSubmitPasswordReset = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!passwordTarget) {
        return;
      }

      if (passwordForm.newPassword.length < 6) {
        setPasswordError('密码长度至少为 6 位');
        return;
      }

      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        setPasswordError('两次输入的密码不一致');
        return;
      }

      setPasswordSubmitting(true);
      setPasswordError('');
      try {
        const response = await fetch(`/api/admin/users/${encodeURIComponent(passwordTarget.id)}/password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ newPassword: passwordForm.newPassword }),
        });
        const payload = await readResponsePayload(response);
        if (!response.ok) {
          throw new Error(readPayloadErrorMessage(payload, '重置密码失败'));
        }

        setPasswordTarget(null);
        setPasswordForm(EMPTY_PASSWORD_FORM);
        setNotice({
          type: 'success',
          message: `已重置「${buildDisplayName(passwordTarget)}」的密码，并强制下线其所有会话`,
        });
      } catch (submitError) {
        setPasswordError(submitError instanceof Error ? submitError.message : '重置密码失败');
      } finally {
        setPasswordSubmitting(false);
      }
    },
    [passwordForm, passwordTarget]
  );

  return (
    <div className="admin-mobile-page user-admin-page space-y-6 pt-6">
      <section className="stats-header">
        <div className="stats-header__top">
          <div className="stats-header__main">
            <span className="stats-header__eyebrow">用户管理</span>
            <h1 className="stats-header__title">全部用户账号</h1>
            <p className="stats-header__desc">
              从这里查看所有用户资料、登录活跃情况，并执行禁用、删除与密码重置操作。
            </p>
          </div>
          <div className="user-admin-toolbar">
            <button
              type="button"
              className="stats-refresh-btn"
              onClick={() => void loadUsers('refresh')}
              disabled={loading || refreshing || Boolean(actingUserId) || passwordSubmitting}
            >
              {refreshing ? '刷新中...' : '刷新列表'}
            </button>
            <button
              type="button"
              className="stats-refresh-btn"
              onClick={() => router.push('/admin/stats')}
              disabled={loading || refreshing || Boolean(actingUserId) || passwordSubmitting}
            >
              返回统计
            </button>
          </div>
        </div>
        <div className="stats-meta-panel">
          <div className="stats-meta-item">
            <span className="stats-meta-item__label">用户总数</span>
            <span className="stats-meta-item__value">{totalUsers}</span>
          </div>
          <div className="stats-meta-item">
            <span className="stats-meta-item__label">当前启用</span>
            <span className="stats-meta-item__value">{activeUsers}</span>
          </div>
        </div>
      </section>

      {notice ? (
        <div className={`user-admin-notice user-admin-notice--${notice.type}`}>
          {notice.message}
        </div>
      ) : null}

      {loading ? (
        <div className="stats-error-panel">
          <p className="stats-error-panel__text">正在加载用户列表...</p>
        </div>
      ) : error ? (
        <div className="stats-error-panel">
          <p className="stats-error-panel__text">{error}</p>
        </div>
      ) : !users.length ? (
        <div className="stats-error-panel">
          <p className="stats-error-panel__text">当前还没有可管理的用户数据。</p>
        </div>
      ) : (
        <div className="user-admin-list">
          {users.map((user) => {
            const displayName = buildDisplayName(user);
            const isCurrentAdmin = currentUserId === user.id;
            const canManage = user.role !== 'admin' && !isCurrentAdmin;
            const isActing = actingUserId === user.id;

            return (
              <article key={user.id} className="user-admin-card">
                <div className="user-admin-card__head">
                  <div>
                    <span className="user-admin-card__title">{displayName}</span>
                    <span className="user-admin-card__desc">
                      用户 ID：{user.id}
                      {user.disabledAt ? ` · 禁用时间：${formatDateTimeText(user.disabledAt)}` : ''}
                    </span>
                  </div>
                  <div className="user-admin-badges">
                    <span className={`user-admin-badge ${user.role === 'admin' ? 'user-admin-badge--admin' : 'user-admin-badge--user'}`}>
                      {user.role === 'admin' ? '管理员' : '普通用户'}
                    </span>
                    {user.isDisabled ? <span className="user-admin-badge user-admin-badge--disabled">已禁用</span> : null}
                    {isCurrentAdmin ? <span className="user-admin-badge user-admin-badge--current">当前账号</span> : null}
                  </div>
                </div>

                <div className="user-admin-grid">
                  <div className="user-admin-metric">
                    <span className="user-admin-metric__label">注册时间</span>
                    <span className="user-admin-metric__value">{formatDateTimeText(user.createdAt)}</span>
                  </div>
                  <div className="user-admin-metric">
                    <span className="user-admin-metric__label">最近活跃</span>
                    <span className="user-admin-metric__value">{formatDateTimeText(user.lastActiveAt)}</span>
                  </div>
                  <div className="user-admin-metric">
                    <span className="user-admin-metric__label">最近会话</span>
                    <span className="user-admin-metric__value">{formatDateTimeText(user.lastSessionAt)}</span>
                  </div>
                  <div className="user-admin-metric">
                    <span className="user-admin-metric__label">预约 / 相册</span>
                    <span className="user-admin-metric__value">
                      {user.bookingCount} / {user.albumCount}
                    </span>
                  </div>
                </div>

                <div className="user-admin-contact">
                  <div className="user-admin-contact__row">
                    <span className="user-admin-contact__label">手机号</span>
                    <span className="user-admin-contact__value">{user.phone || '未填写'}</span>
                  </div>
                  <div className="user-admin-contact__row">
                    <span className="user-admin-contact__label">邮箱</span>
                    <span className="user-admin-contact__value">{user.email || '未填写'}</span>
                  </div>
                  <div className="user-admin-contact__row">
                    <span className="user-admin-contact__label">微信号</span>
                    <span className="user-admin-contact__value">{user.wechat || '未填写'}</span>
                  </div>
                </div>

                <div className="user-admin-actions">
                  {canManage ? (
                    <>
                      <button
                        type="button"
                        className={`user-admin-action ${user.isDisabled ? 'user-admin-action--primary' : 'user-admin-action--ghost'}`}
                        onClick={() => void handleToggleDisabled(user)}
                        disabled={isActing || passwordSubmitting}
                      >
                        {isActing ? '处理中...' : user.isDisabled ? '恢复账号' : '禁用账号'}
                      </button>
                      <button
                        type="button"
                        className="user-admin-action user-admin-action--primary"
                        onClick={() => handleOpenPasswordModal(user)}
                        disabled={isActing || passwordSubmitting}
                      >
                        修改密码
                      </button>
                      <button
                        type="button"
                        className="user-admin-action user-admin-action--danger"
                        onClick={() => setDeleteTarget(user)}
                        disabled={isActing || passwordSubmitting}
                      >
                        删除账号
                      </button>
                    </>
                  ) : (
                    <span className="user-admin-card__desc">
                      {isCurrentAdmin ? '当前登录管理员不允许在此页面执行禁用或删除操作。' : '管理员账号默认受保护，不支持后台禁用、删除或重置密码。'}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {deleteTarget ? (
        <div className="booking-modal-mask" onClick={() => (actingUserId ? undefined : setDeleteTarget(null))}>
          <div className="booking-confirm-modal" onClick={(event) => event.stopPropagation()}>
            <div className="booking-confirm-modal__head">
              <div className="booking-confirm-modal__icon booking-confirm-modal__icon--danger">!</div>
              <span className="booking-confirm-modal__title">确认删除账号</span>
              <span className="booking-confirm-modal__desc">
                确定要删除「<span className="booking-confirm-modal__accent">{buildDisplayName(deleteTarget)}</span>」吗？
              </span>
              <div className="booking-confirm-modal__warn">该操作会同步删除该用户的预约记录、资料及关联资源，且不可撤销。</div>
            </div>
            <div className="booking-confirm-modal__actions">
              <button
                type="button"
                className="booking-confirm-modal__btn booking-confirm-modal__btn--ghost"
                onClick={() => setDeleteTarget(null)}
                disabled={actingUserId === deleteTarget.id}
              >
                取消
              </button>
              <button
                type="button"
                className="booking-confirm-modal__btn booking-confirm-modal__btn--danger"
                onClick={() => void handleDeleteUser()}
                disabled={actingUserId === deleteTarget.id}
              >
                {actingUserId === deleteTarget.id ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {passwordTarget ? (
        <div className="booking-modal-mask" onClick={() => (passwordSubmitting ? undefined : setPasswordTarget(null))}>
          <div
            className="booking-modal booking-modal--form user-admin-password-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="booking-modal__head">
              <h3 className="booking-modal__title">修改用户密码</h3>
            </div>
            <form className="booking-modal__body" onSubmit={handleSubmitPasswordReset}>
              <div className="booking-modal__field">
                <label className="booking-modal__label">目标账号</label>
                <input className="booking-modal__input" value={buildDisplayName(passwordTarget)} disabled />
              </div>
              <div className="booking-modal__field">
                <label className="booking-modal__label">新密码</label>
                <input
                  className="booking-modal__input"
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                  placeholder="请输入至少 6 位的新密码"
                  minLength={6}
                  maxLength={64}
                  autoFocus
                />
              </div>
              <div className="booking-modal__field">
                <label className="booking-modal__label">确认新密码</label>
                <input
                  className="booking-modal__input"
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                  placeholder="请再次输入新密码"
                  minLength={6}
                  maxLength={64}
                />
              </div>
              {passwordError ? <span className="user-admin-inline-error">{passwordError}</span> : null}
              <div className="user-admin-password-actions">
                <button
                  type="button"
                  className="stats-refresh-btn"
                  onClick={() => setPasswordTarget(null)}
                  disabled={passwordSubmitting}
                >
                  取消
                </button>
                <button type="submit" className="stats-maint-btn" disabled={passwordSubmitting}>
                  {passwordSubmitting ? '提交中...' : '确认修改'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
