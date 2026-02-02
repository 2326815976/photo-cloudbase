import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    COS_BUCKET: process.env.COS_BUCKET || 'undefined',
    COS_REGION: process.env.COS_REGION || 'undefined',
    COS_CDN_DOMAIN: process.env.COS_CDN_DOMAIN || 'undefined',
    COS_SECRET_ID: process.env.COS_SECRET_ID ? '已设置' : 'undefined',
    COS_SECRET_KEY: process.env.COS_SECRET_KEY ? '已设置' : 'undefined',
    NODE_ENV: process.env.NODE_ENV,
  });
}
