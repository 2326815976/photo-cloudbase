import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function parseBooleanEnv(input: string | undefined): boolean | null {
  const text = String(input || '').trim().toLowerCase();
  if (!text) return null;
  if (['1', 'true', 'yes', 'y', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(text)) return false;
  return null;
}

export function GET() {
  const parsed = parseBooleanEnv(process.env.HIDE_AUDIT);
  const hideAudit = parsed === null ? false : parsed;

  return NextResponse.json({
    hideAudit,
  });
}
