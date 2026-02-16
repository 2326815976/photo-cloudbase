import { AuthContext } from '@/lib/auth/types';
import { isValidChinaMobile, normalizeChinaMobile } from '@/lib/utils/phone';
import { getTodayUTC8 } from '@/lib/utils/date-helpers';
import { DbQueryPayload, QueryFilter } from './query-types';

function clonePayload(payload: DbQueryPayload): DbQueryPayload {
  return {
    ...payload,
    filters: [...(payload.filters ?? [])],
    orders: [...(payload.orders ?? [])],
  };
}

function ensureAuthenticated(context: AuthContext) {
  if (!context.user) {
    throw new Error('未授权：请先登录');
  }
}

function isAdmin(context: AuthContext): boolean {
  return context.role === 'admin' || context.role === 'system';
}

function addFilter(payload: DbQueryPayload, filter: QueryFilter): void {
  if (!payload.filters) {
    payload.filters = [];
  }
  payload.filters.push(filter);
}

function forceUserFilter(payload: DbQueryPayload, userId: string): void {
  addFilter(payload, {
    column: 'user_id',
    operator: 'eq',
    value: userId,
  });
}

function enforceUserIdInValues(payload: DbQueryPayload, userId: string): void {
  if (!payload.values) {
    return;
  }

  if (Array.isArray(payload.values)) {
    payload.values = payload.values.map((item) => ({
      ...item,
      user_id: userId,
    }));
    return;
  }

  payload.values = {
    ...payload.values,
    user_id: userId,
  };
}

function sanitizeChinaMobileInValues(
  values: DbQueryPayload['values'],
  options?: { require?: boolean; allowNull?: boolean }
): void {
  if (!values) {
    return;
  }

  const sanitizeOne = (record: Record<string, unknown>) => {
    const rawPhone = record.phone;
    if (rawPhone === undefined) {
      if (options?.require) {
        throw new Error('手机号不能为空');
      }
      return;
    }

    const trimmed = typeof rawPhone === 'string' ? rawPhone.trim() : rawPhone;
    if (trimmed === null || trimmed === undefined || trimmed === '') {
      if (options?.allowNull) {
        record.phone = null;
        return;
      }

      throw new Error('手机号不能为空');
    }

    const normalized = normalizeChinaMobile(String(trimmed));
    if (!isValidChinaMobile(normalized)) {
      throw new Error('手机号格式不正确');
    }
    record.phone = normalized;
  };

  if (Array.isArray(values)) {
    values.forEach((item) => sanitizeOne(item as Record<string, unknown>));
    return;
  }

  sanitizeOne(values as Record<string, unknown>);
}

function ensureObjectValues(values: DbQueryPayload['values']): Record<string, unknown> {
  if (!values || Array.isArray(values)) {
    throw new Error('更新数据格式错误');
  }
  return values;
}

export function enforceQueryPermissions(payload: DbQueryPayload, context: AuthContext): DbQueryPayload {
  const scoped = clonePayload(payload);

  if (isAdmin(context)) {
    return scoped;
  }

  switch (scoped.table) {
    case 'poses':
    case 'pose_tags':
      if (scoped.action !== 'select') {
        throw new Error('未授权操作');
      }
      return scoped;

    case 'album_photos':
      if (scoped.action !== 'select') {
        throw new Error('未授权操作');
      }
      addFilter(scoped, { column: 'is_public', operator: 'eq', value: 1 });
      return scoped;

    case 'booking_types':
    case 'allowed_cities':
      if (scoped.action !== 'select') {
        throw new Error('未授权操作');
      }
      addFilter(scoped, { column: 'is_active', operator: 'eq', value: 1 });
      return scoped;

    case 'booking_blackouts':
    case 'app_releases':
      if (scoped.action !== 'select') {
        throw new Error('未授权操作');
      }
      return scoped;

    case 'profiles': {
      ensureAuthenticated(context);
      if (!context.user) {
        throw new Error('未授权操作');
      }

      if (scoped.action !== 'select' && scoped.action !== 'update') {
        throw new Error('未授权操作');
      }

      if (scoped.action === 'update') {
        sanitizeChinaMobileInValues(scoped.values, { allowNull: true });
      }

      addFilter(scoped, {
        column: 'id',
        operator: 'eq',
        value: context.user.id,
      });
      return scoped;
    }

    case 'bookings': {
      ensureAuthenticated(context);
      if (!context.user) {
        throw new Error('未授权操作');
      }

      if (scoped.action === 'select') {
        forceUserFilter(scoped, context.user.id);
        return scoped;
      }

      if (scoped.action === 'insert') {
        enforceUserIdInValues(scoped, context.user.id);
        sanitizeChinaMobileInValues(scoped.values, { require: true, allowNull: false });
        return scoped;
      }

      if (scoped.action === 'update') {
        forceUserFilter(scoped, context.user.id);
        addFilter(scoped, {
          column: 'status',
          operator: 'in',
          value: ['pending', 'confirmed'],
        });
        addFilter(scoped, {
          column: 'booking_date',
          operator: 'gt',
          value: getTodayUTC8(),
        });

        const values = ensureObjectValues(scoped.values);
        const keys = Object.keys(values);
        if (keys.length !== 1 || !keys.includes('status')) {
          throw new Error('未授权操作：仅允许取消预约');
        }
        if (values.status !== 'cancelled') {
          throw new Error('未授权操作：仅允许将预约状态更新为已取消');
        }

        return scoped;
      }

      if (scoped.action === 'delete') {
        forceUserFilter(scoped, context.user.id);
        addFilter(scoped, {
          column: 'status',
          operator: 'in',
          value: ['finished', 'cancelled'],
        });
        return scoped;
      }

      throw new Error('未授权操作');
    }

    case 'users':
    case 'user_sessions':
    case 'password_reset_tokens':
      throw new Error('未授权操作：请使用认证API');

    case 'albums':
    case 'album_folders':
      throw new Error('未授权操作：请使用RPC函数');

    case 'user_album_bindings': {
      ensureAuthenticated(context);
      if (!context.user) {
        throw new Error('未授权操作');
      }
      forceUserFilter(scoped, context.user.id);
      return scoped;
    }

    case 'photo_comments': {
      if (scoped.action === 'select') {
        return scoped;
      }
      throw new Error('未授权操作：请使用RPC函数');
    }

    case 'photo_likes': {
      if (scoped.action === 'select') {
        return scoped;
      }

      ensureAuthenticated(context);
      if (!context.user) {
        throw new Error('未授权操作');
      }

      if (scoped.action === 'insert') {
        enforceUserIdInValues(scoped, context.user.id);
        return scoped;
      }

      if (scoped.action === 'delete') {
        forceUserFilter(scoped, context.user.id);
        return scoped;
      }

      throw new Error('未授权操作');
    }

    case 'analytics_daily':
      if (scoped.action === 'select') {
        throw new Error('未授权操作：仅管理员可查看');
      }
      throw new Error('未授权操作');

    case 'photo_views':
      if (scoped.action === 'insert') {
        if (context.user) {
          enforceUserIdInValues(scoped, context.user.id);
        }
        return scoped;
      }

      ensureAuthenticated(context);
      if (!context.user) {
        throw new Error('未授权操作');
      }

      if (scoped.action === 'select') {
        forceUserFilter(scoped, context.user.id);
        return scoped;
      }
      throw new Error('未授权操作');

    case 'user_active_logs':
      ensureAuthenticated(context);
      if (!context.user) {
        throw new Error('未授权操作');
      }

      if (scoped.action === 'insert') {
        enforceUserIdInValues(scoped, context.user.id);
        return scoped;
      }

      if (scoped.action === 'select') {
        addFilter(scoped, {
          column: 'user_id',
          operator: 'eq',
          value: context.user.id,
        });
        return scoped;
      }

      throw new Error('未授权操作');

    default:
      throw new Error('未授权操作');
  }
}
