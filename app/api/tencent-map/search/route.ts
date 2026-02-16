import { NextRequest, NextResponse } from 'next/server';
import { requestTencentWebService } from '@/lib/tencent-map/webservice';

export async function POST(request: NextRequest) {
  try {
    const { keyword, cityName } = await request.json();

    if (!keyword) {
      return NextResponse.json({ error: '缺少搜索关键词' }, { status: 400 });
    }

    const boundary = cityName ? `region(${cityName},0)` : 'region(全国,0)';
    const webServiceResult = await requestTencentWebService('/ws/place/v1/search', {
      keyword: String(keyword).trim(),
      boundary,
      page_size: 10,
    });

    if (webServiceResult.ok && Array.isArray(webServiceResult.raw.data)) {
      const results = webServiceResult.raw.data.map((item: any) => ({
        name: item.title,
        address: item.address,
        location: {
          lat: item.location.lat,
          lng: item.location.lng,
        },
        cityName: String(item?.ad_info?.city ?? '').trim() || undefined,
        province: String(item?.ad_info?.province ?? '').trim() || undefined,
        district: String(item?.ad_info?.district ?? '').trim() || undefined,
        adcode: String(item?.ad_info?.adcode ?? '').trim() || undefined,
      }));

      return NextResponse.json({ results });
    }

    return NextResponse.json(
      {
        error: '地点搜索失败',
        errorCode: webServiceResult.status,
        message: webServiceResult.message,
        hint: webServiceResult.hint,
        detail: webServiceResult.raw,
      },
      { status: 502 }
    );
  } catch (error) {
    console.error('地点搜索错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
