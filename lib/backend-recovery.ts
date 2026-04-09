'use client';

const BACKEND_HEALTH_CHECK_PATH = '/api/health/ready';
const BACKEND_RECOVERY_MAX_WAIT_MS = 45 * 1000;
const BACKEND_RECOVERY_INTERVAL_MS = 2500;
const BACKEND_HEALTH_CHECK_TIMEOUT_MS = 10000;
const BACKEND_POST_RECOVERY_RETRY_TIMES = 2;
const BACKEND_POST_RECOVERY_RETRY_DELAY_MS = 1500;

type BackendRecoveryState = {
  backendReady: boolean;
  backendReconnecting: boolean;
  backendRetryCount: number;
  backendLastError: string;
};

type BackendRecoveryListener = (state: BackendRecoveryState) => void;

type RecoveryResult = {
  recovered: boolean;
  attempts: number;
  elapsedMs: number;
};

type RecoveryAttemptResult = {
  response: Response | null;
  recovery: RecoveryResult | null;
  error: Error | null;
};

type BackendRecoveryRequestOptions = {
  disabled?: boolean;
  skipReadyGate?: boolean;
};

type BackendRecoveryRequestInit = RequestInit & {
  backendRecovery?: BackendRecoveryRequestOptions;
};

const state: BackendRecoveryState = {
  backendReady: false,
  backendReconnecting: false,
  backendRetryCount: 0,
  backendLastError: '',
};

const listeners = new Set<BackendRecoveryListener>();

let originalFetch: typeof window.fetch | null = null;
let restoreFetch: (() => void) | null = null;
let backendRecoveryPromise: Promise<RecoveryResult> | null = null;
let backendReadyPromise: Promise<RecoveryResult | null> | null = null;
let backendBootstrapPromise: Promise<RecoveryResult | null> | null = null;
let teardownRecoverySignalListeners: (() => void) | null = null;

function emitState() {
  const snapshot = getBackendRecoveryState();
  listeners.forEach((listener) => {
    listener(snapshot);
  });
}

function syncBackendStatus(patch: Partial<BackendRecoveryState>) {
  let changed = false;

  if (typeof patch.backendReady === 'boolean' && patch.backendReady !== state.backendReady) {
    state.backendReady = patch.backendReady;
    changed = true;
  }

  if (
    typeof patch.backendReconnecting === 'boolean' &&
    patch.backendReconnecting !== state.backendReconnecting
  ) {
    state.backendReconnecting = patch.backendReconnecting;
    changed = true;
  }

  if (typeof patch.backendRetryCount === 'number') {
    const nextRetryCount = Math.max(0, Number(patch.backendRetryCount || 0));
    if (nextRetryCount !== state.backendRetryCount) {
      state.backendRetryCount = nextRetryCount;
      changed = true;
    }
  }

  if (typeof patch.backendLastError === 'string' && patch.backendLastError !== state.backendLastError) {
    state.backendLastError = patch.backendLastError;
    changed = true;
  }

  if (changed) {
    emitState();
  }
}

function sleep(ms: number) {
  const delay = Math.max(0, Number(ms || 0));
  if (!delay) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, delay);
  });
}

function isBrowserOnline() {
  if (typeof navigator === 'undefined') {
    return true;
  }

  return navigator.onLine !== false;
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const text = value.trim();
  if (!text) {
    return value;
  }

  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

function hasBackendUnavailableMessageKeyword(message: unknown) {
  const text = String(message || '').trim().toLowerCase();
  if (!text) {
    return false;
  }

  return (
    text.includes('service unavailable') ||
    text.includes('upstream connect error') ||
    text.includes('upstream request timeout') ||
    text.includes('gateway timeout') ||
    text.includes('connection reset') ||
    text.includes('econnreset') ||
    text.includes('socket hang up') ||
    text.includes('request:fail') ||
    text.includes('failed to fetch') ||
    text.includes('networkerror') ||
    text.includes('network request failed') ||
    text.includes('timeout') ||
    text.includes('timed out') ||
    text.includes('网络错误') ||
    text.includes('连接失败') ||
    text.includes('连接超时') ||
    text.includes('暂不可用')
  );
}

function hasBackendTransientMessageKeyword(message: unknown) {
  const text = String(message || '').trim().toLowerCase();
  if (!text) {
    return false;
  }

  return (
    hasBackendUnavailableMessageKeyword(text) ||
    text.includes('invalidparameter') ||
    (text.includes('parameter error') && text.includes('run query failed')) ||
    text.includes('run query failed, database') ||
    text.includes('database connection failed') ||
    text.includes('服务暂时不可用') ||
    text.includes('服务正在恢复')
  );
}

function extractPayloadErrorInfo(payload: unknown): { message: string; code: string } | null {
  let current = parseMaybeJson(payload);

  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== 'object') {
      break;
    }

    const record = current as {
      error?: unknown;
      message?: unknown;
      code?: unknown;
      success?: unknown;
      ok?: unknown;
      data?: unknown;
    };

    if (typeof record.error === 'string' && record.error.trim()) {
      return {
        message: record.error.trim(),
        code: String(record.code || '').trim(),
      };
    }

    if (record.error && typeof record.error === 'object') {
      const errorRecord = record.error as { message?: unknown; code?: unknown };
      const message = String(errorRecord.message || record.message || '').trim();
      const code = String(errorRecord.code || record.code || '').trim();

      if (message || code) {
        return { message, code };
      }
    }

    if (record.success === false || record.ok === false) {
      return {
        message: String(record.message || '请求失败').trim(),
        code: String(record.code || '').trim(),
      };
    }

    const next = record.data;
    if (!next || typeof next !== 'object' || next === current) {
      break;
    }

    current = next;
  }

  return null;
}

function isTransientPayloadError(payload: unknown) {
  const info = extractPayloadErrorInfo(payload);
  if (!info) {
    return false;
  }

  if (info.code.trim().toUpperCase() === 'TRANSIENT_BACKEND') {
    return true;
  }

  return hasBackendTransientMessageKeyword(info.message);
}

function isBackendUnavailableStatus(statusCode: number) {
  return [502, 503, 504, 520, 521, 522, 523, 524].includes(statusCode);
}

function resolvePayloadMessage(payload: unknown, statusCode: number, fallback: string) {
  const data = parseMaybeJson(payload);
  if (data && typeof data === 'object') {
    const record = data as {
      error?: unknown;
      message?: unknown;
    };

    if (record.error && typeof record.error === 'object') {
      const errorRecord = record.error as { message?: unknown };
      const errorMessage = String(errorRecord.message || '').trim();
      if (errorMessage) {
        return errorMessage;
      }
    }

    if (typeof record.error === 'string' && record.error.trim()) {
      return record.error.trim();
    }

    const message = String(record.message || '').trim();
    if (message) {
      return message;
    }
  }

  if (typeof data === 'string' && data.trim()) {
    return data.trim();
  }

  return fallback || `请求失败（${statusCode}）`;
}

async function parseResponsePayload(response: Response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    return await response.text();
  } catch {
    return null;
  }
}

function buildResponseError(request: Request, response: Response, payload: unknown) {
  const message = resolvePayloadMessage(payload, response.status, response.statusText || '请求失败');
  const error = new Error(message);
  (error as Error & { statusCode?: number; path?: string; method?: string }).statusCode = response.status;
  (error as Error & { statusCode?: number; path?: string; method?: string }).path = request.url;
  (error as Error & { statusCode?: number; path?: string; method?: string }).method = request.method;
  return error;
}

function buildTransientPayloadError(request: Request, payload: unknown, statusCodeHint: number) {
  const info = extractPayloadErrorInfo(payload);
  const error = new Error(info?.message || '服务暂时不可用，请稍后重试');
  (error as Error & { code?: string; statusCode?: number; path?: string; method?: string }).code =
    info?.code || 'TRANSIENT_BACKEND';
  (error as Error & { code?: string; statusCode?: number; path?: string; method?: string }).statusCode =
    statusCodeHint || 503;
  (error as Error & { code?: string; statusCode?: number; path?: string; method?: string }).path = request.url;
  (error as Error & { code?: string; statusCode?: number; path?: string; method?: string }).method = request.method;
  return error;
}

function shouldTriggerBackendRecovery(error: unknown, statusCodeHint?: number) {
  if (!isBrowserOnline()) {
    return false;
  }

  const statusCode = Number(
    statusCodeHint ??
      ((error && typeof error === 'object' && 'statusCode' in error
        ? (error as { statusCode?: unknown }).statusCode
        : 0) || 0)
  );

  if (isBackendUnavailableStatus(statusCode)) {
    return true;
  }

  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : String(error || '');

  if (!message.trim()) {
    return false;
  }

  return hasBackendTransientMessageKeyword(message);
}

async function probeBackendHealth(fetchImpl: typeof window.fetch) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), BACKEND_HEALTH_CHECK_TIMEOUT_MS);

  try {
    const response = await fetchImpl(BACKEND_HEALTH_CHECK_PATH, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'x-backend-health-check': '1',
      },
      signal: controller.signal,
    });

    const payload = await parseResponsePayload(response.clone());
    if (response.ok && !isTransientPayloadError(payload) && payload !== false) {
      return {
        healthy: true,
        error: '',
      };
    }

    return {
      healthy: false,
      error: resolvePayloadMessage(payload, response.status, response.statusText || '服务暂时不可用'),
    };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : String(error || '服务暂时不可用'),
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function probeBackendHealthOnce(fetchImpl: typeof window.fetch) {
  const result = await probeBackendHealth(fetchImpl);
  return result.healthy;
}

async function waitForBackendRecovery(fetchImpl: typeof window.fetch, triggerError?: unknown) {
  if (backendRecoveryPromise) {
    return backendRecoveryPromise;
  }

  const lastError =
    triggerError && typeof triggerError === 'object' && 'message' in triggerError
      ? String((triggerError as { message?: unknown }).message || '')
      : String(triggerError || '服务暂时不可用');

  syncBackendStatus({
    backendReady: false,
    backendReconnecting: true,
    backendLastError: lastError,
  });

  const startedAt = Date.now();

  backendRecoveryPromise = (async () => {
    let attempts = 0;

    while (Date.now() - startedAt <= BACKEND_RECOVERY_MAX_WAIT_MS) {
      attempts += 1;
      const healthy = await probeBackendHealthOnce(fetchImpl);
      if (healthy) {
        const result = {
          recovered: true,
          attempts,
          elapsedMs: Date.now() - startedAt,
        };

        syncBackendStatus({
          backendReady: true,
          backendReconnecting: false,
          backendLastError: '',
        });

        return result;
      }

      await sleep(BACKEND_RECOVERY_INTERVAL_MS);
    }

    return {
      recovered: false,
      attempts,
      elapsedMs: Date.now() - startedAt,
    };
  })().finally(() => {
    backendRecoveryPromise = null;
  });

  const result = await backendRecoveryPromise;

  if (!result.recovered) {
    syncBackendStatus({
      backendReady: false,
      backendReconnecting: true,
      backendLastError: lastError,
    });
  }

  return result;
}

function recoverBackendInBackground(fetchImpl: typeof window.fetch, reason?: string) {
  if (typeof window === 'undefined' || !isBrowserOnline()) {
    return;
  }

  if (backendReadyPromise || backendRecoveryPromise || (state.backendReady && !state.backendReconnecting)) {
    return;
  }

  void waitForBackendRecovery(fetchImpl, reason || state.backendLastError || '服务暂时不可用').catch(
    () => null
  );
}

function attachRecoverySignalListeners(fetchImpl: typeof window.fetch) {
  if (typeof window === 'undefined' || teardownRecoverySignalListeners) {
    return;
  }

  const handleOnline = () => {
    recoverBackendInBackground(fetchImpl, '网络已恢复');
  };

  window.addEventListener('online', handleOnline);

  teardownRecoverySignalListeners = () => {
    window.removeEventListener('online', handleOnline);
    teardownRecoverySignalListeners = null;
  };
}

async function ensureBackendReady(fetchImpl: typeof window.fetch, options?: BackendRecoveryRequestOptions) {
  if (options?.disabled || options?.skipReadyGate || !isBrowserOnline()) {
    return null;
  }

  if (state.backendReady) {
    return null;
  }

  if (backendReadyPromise) {
    return backendReadyPromise;
  }

  syncBackendStatus({
    backendReady: false,
    backendReconnecting: true,
  });

  const startedAt = Date.now();

  backendReadyPromise = (async () => {
    let attempts = Math.max(0, Number(state.backendRetryCount || 0));

    while (true) {
      attempts += 1;
      const probeResult = await probeBackendHealth(fetchImpl);

      if (probeResult.healthy) {
        const result = {
          recovered: true,
          attempts,
          elapsedMs: Date.now() - startedAt,
        };

        syncBackendStatus({
          backendReady: true,
          backendReconnecting: false,
          backendRetryCount: attempts,
          backendLastError: '',
        });

        return result;
      }

      syncBackendStatus({
        backendReady: false,
        backendReconnecting: true,
        backendRetryCount: attempts,
        backendLastError: probeResult.error || state.backendLastError || '服务暂时不可用',
      });

      await sleep(BACKEND_RECOVERY_INTERVAL_MS);
    }
  })().finally(() => {
    backendReadyPromise = null;
  });

  return backendReadyPromise;
}

async function retryRequestAfterRecovery(
  request: Request,
  fetchImpl: typeof window.fetch,
  triggerError: Error,
  options?: BackendRecoveryRequestOptions
): Promise<RecoveryAttemptResult> {
  if (options?.disabled || !shouldTriggerBackendRecovery(triggerError)) {
    return {
      response: null,
      recovery: null,
      error: null,
    };
  }

  const recovery = await waitForBackendRecovery(fetchImpl, triggerError);
  if (!recovery.recovered) {
    return {
      response: null,
      recovery,
      error: null,
    };
  }

  let lastResponse: Response | null = null;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= BACKEND_POST_RECOVERY_RETRY_TIMES; attempt += 1) {
    try {
      const response = await fetchImpl(request.clone());
      const payload = await parseResponsePayload(response.clone());
      const shouldRetryAgain =
        isBackendUnavailableStatus(response.status) || isTransientPayloadError(payload);

      lastResponse = response;

      if (!shouldRetryAgain) {
        syncBackendStatus({
          backendReady: true,
          backendReconnecting: false,
          backendLastError: '',
        });

        return {
          response,
          recovery,
          error: null,
        };
      }

      lastError =
        isTransientPayloadError(payload)
          ? buildTransientPayloadError(request, payload, response.status || 503)
          : buildResponseError(request, response, payload);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error || '请求失败'));
    }

    if (attempt < BACKEND_POST_RECOVERY_RETRY_TIMES) {
      await sleep(BACKEND_POST_RECOVERY_RETRY_DELAY_MS * (attempt + 1));
    }
  }

  syncBackendStatus({
    backendReady: false,
    backendReconnecting: true,
    backendLastError: String(lastError?.message || triggerError.message || '服务暂时不可用'),
  });

  return {
    response: lastResponse,
    recovery,
    error: lastResponse ? null : lastError,
  };
}

async function fetchWithBackendRecovery(
  request: Request,
  options: BackendRecoveryRequestOptions,
  fetchImpl: typeof window.fetch
) {
  await ensureBackendReady(fetchImpl, options);

  try {
    const response = await fetchImpl(request.clone());
    const payload = await parseResponsePayload(response.clone());

    if (!response.ok) {
      const responseError = buildResponseError(request, response, payload);
      const recovered = await retryRequestAfterRecovery(request, fetchImpl, responseError, options);

      if (recovered.response) {
        return recovered.response;
      }

      return response;
    }

    if (isTransientPayloadError(payload)) {
      const payloadError = buildTransientPayloadError(request, payload, response.status || 503);
      const recovered = await retryRequestAfterRecovery(request, fetchImpl, payloadError, options);

      if (recovered.response) {
        return recovered.response;
      }

      return response;
    }

    syncBackendStatus({
      backendReady: true,
      backendReconnecting: false,
      backendLastError: '',
    });

    return response;
  } catch (error) {
    const requestError = error instanceof Error ? error : new Error(String(error || '请求失败'));
    const recovered = await retryRequestAfterRecovery(request, fetchImpl, requestError, options);

    if (recovered.response) {
      return recovered.response;
    }

    if (recovered.error) {
      throw recovered.error;
    }

    if (recovered.recovery && !recovered.recovery.recovered) {
      throw new Error(requestError.message || '服务暂时不可用，请稍后重试');
    }

    throw requestError;
  }
}

function shouldHandleRequest(request: Request, options: BackendRecoveryRequestOptions) {
  if (options.disabled || typeof window === 'undefined') {
    return false;
  }

  const url = new URL(request.url, window.location.origin);
  if (url.origin !== window.location.origin) {
    return false;
  }

  if (!url.pathname.startsWith('/api/')) {
    return false;
  }

  return url.pathname !== BACKEND_HEALTH_CHECK_PATH;
}

function normalizeRequest(
  input: RequestInfo | URL,
  init?: BackendRecoveryRequestInit
): { request: Request; options: BackendRecoveryRequestOptions } {
  return {
    request: new Request(input, init),
    options: init?.backendRecovery || {},
  };
}

export function getBackendRecoveryState(): BackendRecoveryState {
  return { ...state };
}

export function subscribeBackendRecovery(listener: BackendRecoveryListener) {
  listeners.add(listener);
  listener(getBackendRecoveryState());

  return () => {
    listeners.delete(listener);
  };
}

export function ensureBackendRecoveryFetchInstalled() {
  if (typeof window === 'undefined') {
    return;
  }

  installBackendRecoveryFetch();
}

export function bootstrapBackendReady() {
  if (typeof window === 'undefined') {
    return Promise.resolve<RecoveryResult | null>(null);
  }

  ensureBackendRecoveryFetchInstalled();

  if (backendBootstrapPromise) {
    return backendBootstrapPromise;
  }

  if (state.backendReady) {
    return Promise.resolve<RecoveryResult | null>({
      recovered: true,
      attempts: Math.max(0, Number(state.backendRetryCount || 0)),
      elapsedMs: 0,
    });
  }

  const fetchImpl = originalFetch || window.fetch.bind(window);
  attachRecoverySignalListeners(fetchImpl);

  backendBootstrapPromise = (async () => {
    if (!isBrowserOnline()) {
      syncBackendStatus({
        backendReady: false,
        backendReconnecting: false,
        backendLastError: '网络未连接',
      });
      return null;
    }

    return ensureBackendReady(fetchImpl);
  })().finally(() => {
    backendBootstrapPromise = null;
  });

  return backendBootstrapPromise;
}

export function installBackendRecoveryFetch() {
  if (typeof window === 'undefined') {
    return () => {};
  }

  if (restoreFetch) {
    return restoreFetch;
  }

  originalFetch = window.fetch.bind(window);
  attachRecoverySignalListeners(originalFetch);

  const patchedFetch: typeof window.fetch = async (input, init) => {
    const fetchImpl = originalFetch;
    if (!fetchImpl) {
      return window.fetch(input, init);
    }

    const normalizedInit = init as BackendRecoveryRequestInit | undefined;
    const { request, options } = normalizeRequest(input, normalizedInit);

    if (!shouldHandleRequest(request, options)) {
      return fetchImpl(request);
    }

    return fetchWithBackendRecovery(request, options, fetchImpl);
  };

  window.fetch = patchedFetch;

  restoreFetch = () => {
    teardownRecoverySignalListeners?.();
    if (originalFetch) {
      window.fetch = originalFetch;
    }

    backendReadyPromise = null;
    backendBootstrapPromise = null;
    restoreFetch = null;
    originalFetch = null;
  };

  return restoreFetch;
}
