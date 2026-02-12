export type QueryAction = 'select' | 'insert' | 'update' | 'delete';

export type QueryFilterOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'contains'
  | 'overlaps';

export interface QueryFilter {
  column: string;
  operator: QueryFilterOperator;
  value: unknown;
}

export interface QueryOrder {
  column: string;
  ascending: boolean;
}

export interface QueryRange {
  from: number;
  to: number;
}

export interface DbQueryPayload {
  table: string;
  action: QueryAction;
  columns?: string;
  values?: Record<string, unknown> | Array<Record<string, unknown>>;
  filters?: QueryFilter[];
  orders?: QueryOrder[];
  range?: QueryRange | null;
  limit?: number | null;
  count?: 'exact' | null;
  single?: boolean;
  maybeSingle?: boolean;
  selectAfterWrite?: boolean;
}

export interface DbRpcPayload {
  functionName: string;
  args?: Record<string, unknown>;
}

