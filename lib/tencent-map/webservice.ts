import 'server-only';

import { env } from '@/lib/env';

type TencentWebServiceRaw = {
  status?: number;
  message?: string;
  [key: string]: unknown;
};

export type TencentWebServiceResult = {
  ok: boolean;
  status: number;
  message: string;
  raw: TencentWebServiceRaw;
  hint?: string;
};

function buildWebServiceHint(status: number, message: string): string | undefined {
  if (status === 112) {
    return '腾讯地图 WebService Key 未授权当前服务器出口IP，请在腾讯地图控制台将当前公网IP加入白名单，或改用已授权的 TMAP_SERVER_KEY。';
  }
  if (status === 199) {
    return '当前腾讯地图 Key 未开启 WebService API，请在腾讯地图控制台开启后重试。';
  }
  if (status === 110 || status === 111) {
    return '腾讯地图 Key 无效或已被禁用，请检查 TMAP_SERVER_KEY / TMAP_KEY 配置。';
  }
  if (status === 120 || status === 121 || status === 122) {
    return '腾讯地图 WebService 调用达到频率限制，请稍后再试。';
  }

  const normalizedMessage = String(message || '').trim();
  if (normalizedMessage) {
    return `腾讯地图接口调用失败：${normalizedMessage}`;
  }

  return undefined;
}

function resolveTencentWebServiceKey(): string {
  return env.TMAP_SERVER_KEY();
}

export async function requestTencentWebService(
  path: string,
  params: Record<string, string | number | boolean>
): Promise<TencentWebServiceResult> {
  const key = resolveTencentWebServiceKey();
  if (!key) {
    return {
      ok: false,
      status: -1,
      message: '腾讯地图 Key 未配置',
      raw: {},
      hint: '请在环境变量中配置 TMAP_SERVER_KEY（或 TMAP_KEY）。',
    };
  }

  const url = new URL(path, 'https://apis.map.qq.com');
  Object.entries(params).forEach(([paramKey, value]) => {
    url.searchParams.set(paramKey, String(value));
  });
  url.searchParams.set('key', key);

  try {
    const response = await fetch(url.toString(), {
      cache: 'no-store',
    });
    const raw = (await response.json()) as TencentWebServiceRaw;
    const status = Number(raw?.status ?? -1);
    const message = String(raw?.message ?? '').trim();
    const ok = status === 0;

    return {
      ok,
      status,
      message,
      raw,
      hint: ok ? undefined : buildWebServiceHint(status, message),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '腾讯地图服务请求失败';
    return {
      ok: false,
      status: -2,
      message,
      raw: {},
      hint: '网络请求失败，请检查本机网络或稍后重试。',
    };
  }
}
