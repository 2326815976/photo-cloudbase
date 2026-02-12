import { AuthContext } from '@/lib/auth/types';
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
        return scoped;
      }

      if (scoped.action === 'update') {
        forceUserFilter(scoped, context.user.id);
        addFilter(scoped, {
          column: 'status',
          operator: 'in',
          value: ['pending', 'confirmed'],
        });
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

    default:
      throw new Error('未授权操作');
  }
}

