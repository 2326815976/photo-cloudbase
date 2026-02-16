import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

const FONT_MAP: Record<string, string> = {
  // 与 Web 端一致：public/fonts 下的字体文件
  letter: '/fonts/AaZhuNiWoMingMeiXiangChunTian-2.woff2',
  zqknny: '/fonts/ZQKNNY-Medium-2.woff2',
};

export const dynamic = 'force-dynamic';

function normalizeOrigin(input: string): string {
  return String(input ?? '').trim().replace(/\/+$/, '');
}

function normalizeAbsoluteOrigin(input: string): string {
  const trimmed = normalizeOrigin(input);
  if (!trimmed) {
    return '';
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = String(hostname || '').trim().toLowerCase();
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.local')) return true;
  if (host === '0.0.0.0') return true;
  if (host.startsWith('127.')) return true;
  if (host.startsWith('10.')) return true;
  if (host.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return false;
}

function normalizeFontOrigin(input: string): string {
  const raw = normalizeAbsoluteOrigin(input);
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    if (isPrivateOrLocalHost(parsed.hostname)) {
      return '';
    }
    parsed.protocol = 'https:';
    return normalizeOrigin(parsed.toString());
  } catch {
    return '';
  }
}

function joinUrl(origin: string, path: string): string {
  const base = normalizeOrigin(origin);
  const suffix = String(path || '').trim();
  if (!base) return suffix;
  if (!suffix) return base;
  if (suffix.startsWith('/')) return `${base}${suffix}`;
  return `${base}/${suffix}`;
}

function buildFontApiPath(name: string): string {
  return `/api/assets/font-file?name=${encodeURIComponent(name)}`;
}

function getRequestOrigin(req: NextRequest): string {
  // CloudBase/代理场景下优先读取转发头，避免 nextUrl.origin 丢失协议信息
  const proto = normalizeOrigin(req.headers.get('x-forwarded-proto') || 'https');
  const host = normalizeOrigin(req.headers.get('x-forwarded-host') || req.headers.get('host') || '');
  if (proto && host) {
    return `${proto}://${host}`;
  }
  return normalizeOrigin(req.nextUrl.origin);
}

export async function GET(req: NextRequest) {
  const name = String(req.nextUrl.searchParams.get('name') || '').trim().toLowerCase();
  const staticPath = FONT_MAP[name];

  if (!staticPath) {
    return NextResponse.json(
      { error: '不支持的字体名称' },
      { status: 400 }
    );
  }

  // 返回多个候选 URL：优先当前请求域名，再回退到 APP_URL，提升小程序端容错性。
  const requestOrigin = normalizeFontOrigin(getRequestOrigin(req));
  const configuredOrigin = normalizeFontOrigin(env.APP_URL());
  const apiPath = buildFontApiPath(name);
  const candidates: string[] = [];

  [requestOrigin, configuredOrigin].filter(Boolean).forEach((origin) => {
    candidates.push(joinUrl(origin, apiPath));
    candidates.push(joinUrl(origin, staticPath));
  });

  const uniqueCandidates = candidates.filter((item, index, arr) => arr.indexOf(item) === index);
  const url = uniqueCandidates[0] || '';

  return NextResponse.json({ url, urls: uniqueCandidates });
}
