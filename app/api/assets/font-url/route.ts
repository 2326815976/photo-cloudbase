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
  const path = FONT_MAP[name];

  if (!path) {
    return NextResponse.json(
      { error: '不支持的字体名称' },
      { status: 400 }
    );
  }

  // 优先使用配置的对外域名（CloudBase/自定义域名），避免 callContainer 场景下 Host 不可访问。
  const configuredOrigin = normalizeAbsoluteOrigin(env.APP_URL());
  const origin = configuredOrigin || getRequestOrigin(req);
  const url = origin ? `${origin}${path}` : path;

  return NextResponse.json({ url });
}
