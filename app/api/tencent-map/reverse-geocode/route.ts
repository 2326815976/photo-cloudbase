import { NextRequest, NextResponse } from 'next/server';
import { requestTencentWebService } from '@/lib/tencent-map/webservice';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const lat = Number(payload?.lat);
    const lng = Number(payload?.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json({ error: '缺少经纬度参数' }, { status: 400 });
    }

    const webServiceResult = await requestTencentWebService('/ws/geocoder/v1/', {
      location: `${lat},${lng}`,
      get_poi: 0,
    });

    if (webServiceResult.ok && webServiceResult.raw.result) {
      const result = webServiceResult.raw.result as Record<string, any>;
      const component = result.address_component ?? {};
      const adInfo = result.ad_info ?? {};
      return NextResponse.json({
        formattedAddress: result.address,
        addressComponent: {
          cityName: String(component.city ?? adInfo.city ?? '').trim(),
          province: String(component.province ?? adInfo.province ?? '').trim(),
          district: String(component.district ?? adInfo.district ?? '').trim(),
          adcode: String(component.adcode ?? component.citycode ?? adInfo.adcode ?? adInfo.citycode ?? '').trim(),
        },
      });
    }

    return NextResponse.json(
      {
        error: '逆地理编码失败',
        errorCode: webServiceResult.status,
        message: webServiceResult.message,
        hint: webServiceResult.hint,
        detail: webServiceResult.raw,
      },
      { status: 502 }
    );
  } catch (error) {
    console.error('逆地理编码错误:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
