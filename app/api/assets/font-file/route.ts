import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

type FontFormat = 'woff2' | 'ttf';

const FONT_FILE_MAP: Record<string, Record<FontFormat, { fileName: string; contentType: string }>> = {
  letter: {
    woff2: {
      fileName: 'AaZhuNiWoMingMeiXiangChunTian-2.woff2',
      contentType: 'font/woff2',
    },
    ttf: {
      fileName: 'AaZhuNiWoMingMeiXiangChunTian-2.ttf',
      contentType: 'font/ttf',
    },
  },
  zqknny: {
    woff2: {
      fileName: 'ZQKNNY-Medium-2.woff2',
      contentType: 'font/woff2',
    },
    ttf: {
      fileName: 'ZQKNNY-Medium-2.ttf',
      contentType: 'font/ttf',
    },
  },
};

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const name = String(req.nextUrl.searchParams.get('name') || '').trim().toLowerCase();
  const formatRaw = String(req.nextUrl.searchParams.get('format') || '').trim().toLowerCase();
  const format: FontFormat = formatRaw === 'ttf' ? 'ttf' : 'woff2';
  const family = FONT_FILE_MAP[name];
  const target = family && family[format];

  if (!target) {
    return NextResponse.json({ error: '不支持的字体名称' }, { status: 400 });
  }

  const filePath = path.join(process.cwd(), 'public', 'fonts', target.fileName);

  try {
    const fileBuffer = await fs.readFile(filePath);
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': target.contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code || '') : '';
    if (code === 'ENOENT') {
      return NextResponse.json({ error: '字体文件不存在' }, { status: 404 });
    }
    return NextResponse.json({ error: '读取字体文件失败' }, { status: 500 });
  }
}
