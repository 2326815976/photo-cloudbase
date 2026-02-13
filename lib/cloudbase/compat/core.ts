import { DbQueryPayload } from '@/lib/cloudbase/query-types';

interface CompatError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

interface QueryResult<T = any> {
  data: T;
  error: CompatError | null;
  count: number | null;
}

type QueryExecutor = (payload: DbQueryPayload) => Promise<QueryResult>;
type RpcExecutor = (functionName: string, args?: Record<string, unknown>) => Promise<{ data: any; error: CompatError | null }>;

type StorageUploadExecutor = (
  bucket: string,
  path: string,
  file: File | Blob,
  options?: Record<string, unknown>
) => Promise<{ data: { path: string } | null; error: CompatError | null; publicUrl?: string | null }>;

type StorageRemoveExecutor = (
  bucket: string,
  paths: string[]
) => Promise<{ data: Array<Record<string, any>> | null; error: CompatError | null }>;

interface AuthUser {
  id: string;
  email?: string | null;
  phone?: string | null;
  role?: string;
}

interface AuthClient {
  getUser: () => Promise<{ data: { user: AuthUser | null }; error: CompatError | null }>;
  getSession: () => Promise<{ data: { session: { user: AuthUser } | null }; error: CompatError | null }>;
  signInWithPassword: (params: { phone: string; password: string }) => Promise<{ data: { user: AuthUser | null }; error: CompatError | null }>;
  signOut: () => Promise<{ error: CompatError | null }>;
  updateUser: (params: { password?: string }) => Promise<{ data: { user: AuthUser | null }; error: CompatError | null }>;
  resetPasswordForEmail: (email: string, options?: { redirectTo?: string }) => Promise<{ data: null; error: CompatError | null }>;
  verifyOtp: (params: Record<string, unknown>) => Promise<{ data: null; error: CompatError | null }>;
  exchangeCodeForSession: (code: string) => Promise<{ data: { session: { user: AuthUser } | null }; error: CompatError | null }>;
}

interface BuildCompatClientOptions {
  queryExecutor: QueryExecutor;
  rpcExecutor: RpcExecutor;
  authClient: AuthClient;
  storageUploadExecutor: StorageUploadExecutor;
  storageRemoveExecutor: StorageRemoveExecutor;
  storagePublicUrlResolver?: (bucket: string, path: string, options?: Record<string, unknown>) => string;
}

type QueryAction = 'select' | 'insert' | 'update' | 'delete';

class CompatQueryBuilder implements PromiseLike<QueryResult> {
  private action: QueryAction = 'select';
  private columns = '*';
  private values: Record<string, unknown> | Array<Record<string, unknown>> | undefined;
  private filters: NonNullable<DbQueryPayload['filters']> = [];
  private orders: NonNullable<DbQueryPayload['orders']> = [];
  private rangeValue: DbQueryPayload['range'] = null;
  private limitValue: number | null = null;
  private count: 'exact' | null = null;
  private singleMode = false;
  private maybeSingleMode = false;
  private selectAfterWrite = false;

  constructor(
    private readonly table: string,
    private readonly executor: QueryExecutor
  ) {}

  select(columns: string = '*', options?: { count?: 'exact' | null }) {
    if (this.action === 'insert' || this.action === 'update' || this.action === 'delete') {
      this.selectAfterWrite = true;
      this.columns = columns;
    } else {
      this.action = 'select';
      this.columns = columns;
    }

    if (options?.count) {
      this.count = options.count;
    }
    return this;
  }

  insert(values: Record<string, unknown> | Array<Record<string, unknown>>) {
    this.action = 'insert';
    this.values = values;
    return this;
  }

  update(values: Record<string, unknown>) {
    this.action = 'update';
    this.values = values;
    return this;
  }

  delete() {
    this.action = 'delete';
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, operator: 'eq', value });
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push({ column, operator: 'neq', value });
    return this;
  }

  gt(column: string, value: unknown) {
    this.filters.push({ column, operator: 'gt', value });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push({ column, operator: 'gte', value });
    return this;
  }

  lt(column: string, value: unknown) {
    this.filters.push({ column, operator: 'lt', value });
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push({ column, operator: 'lte', value });
    return this;
  }

  in(column: string, value: unknown[]) {
    this.filters.push({ column, operator: 'in', value });
    return this;
  }

  contains(column: string, value: unknown) {
    this.filters.push({ column, operator: 'contains', value });
    return this;
  }

  overlaps(column: string, value: unknown) {
    this.filters.push({ column, operator: 'overlaps', value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orders.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  range(from: number, to: number) {
    this.rangeValue = { from, to };
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  single() {
    this.singleMode = true;
    this.maybeSingleMode = false;
    return this;
  }

  maybeSingle() {
    this.maybeSingleMode = true;
    this.singleMode = false;
    return this;
  }

  async execute(): Promise<QueryResult> {
    return this.executor({
      table: this.table,
      action: this.action,
      columns: this.columns,
      values: this.values,
      filters: this.filters,
      orders: this.orders,
      range: this.rangeValue,
      limit: this.limitValue,
      count: this.count,
      single: this.singleMode,
      maybeSingle: this.maybeSingleMode,
      selectAfterWrite: this.selectAfterWrite,
    });
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled as any, onrejected as any);
  }
}

class CompatStorageBucket {
  private readonly uploadedUrlMap = new Map<string, string>();

  constructor(
    private readonly bucket: string,
    private readonly uploadExecutor: StorageUploadExecutor,
    private readonly removeExecutor: StorageRemoveExecutor,
    private readonly publicUrlResolver?: (bucket: string, path: string, options?: Record<string, unknown>) => string
  ) {}

  async upload(path: string, file: File | Blob, options?: Record<string, unknown>) {
    const result = await this.uploadExecutor(this.bucket, path, file, options);
    if (result.publicUrl) {
      this.uploadedUrlMap.set(path, result.publicUrl);
    }
    return {
      data: result.data,
      error: result.error,
    };
  }

  async remove(paths: string[]) {
    return this.removeExecutor(this.bucket, paths);
  }

  // 兼容历史客户端 API，同步返回 publicUrl
  getPublicUrl(path: string, options?: Record<string, unknown>) {
    const cached = this.uploadedUrlMap.get(path);
    if (cached) {
      return { data: { publicUrl: cached } };
    }
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return { data: { publicUrl: path } };
    }

    if (this.publicUrlResolver) {
      return { data: { publicUrl: this.publicUrlResolver(this.bucket, path, options) } };
    }

    return { data: { publicUrl: path } };
  }
}

export function buildCompatClient(options: BuildCompatClientOptions) {
  return {
    auth: options.authClient,
    from(table: string) {
      return new CompatQueryBuilder(table, options.queryExecutor);
    },
    rpc(functionName: string, args?: Record<string, unknown>) {
      return options.rpcExecutor(functionName, args);
    },
    storage: {
      from(bucket: string) {
        return new CompatStorageBucket(
          bucket,
          options.storageUploadExecutor,
          options.storageRemoveExecutor,
          options.storagePublicUrlResolver
        );
      },
    },
  };
}
