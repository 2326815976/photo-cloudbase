import { NextRequest, NextResponse } from 'next/server';
import { requestTencentWebService } from '@/lib/tencent-map/webservice';

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function pickBestAddress(result: Record<string, any>): string {
  const formattedAddress = normalizeText(result?.address);
  const recommendedAddress = normalizeText(result?.formatted_addresses?.recommend);
  const roughAddress = normalizeText(result?.formatted_addresses?.rough);
  const street = normalizeText(result?.address_component?.street);
  const streetNumber = normalizeText(result?.address_component?.street_number);
  const landmarkL2 = normalizeText(result?.address_reference?.landmark_l2?.title);
  const landmarkL1 = normalizeText(result?.address_reference?.landmark_l1?.title);

  let address = recommendedAddress || formattedAddress || roughAddress;
  const streetDetail = `${street}${streetNumber}`.trim();
  const landmark = landmarkL2 || landmarkL1;

  if (!address) {
    address = streetDetail || landmark;
  }

  if (address && streetDetail && !address.includes(streetDetail)) {
    address = `${address}${streetDetail}`;
  }
  if (address && landmark && !address.includes(landmark)) {
    address = `${address}（${landmark}）`;
  }

  return address.trim();
}

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
      get_poi: 1,
    });

    if (webServiceResult.ok && webServiceResult.raw.result) {
      const result = webServiceResult.raw.result as Record<string, any>;
      const component = result.address_component ?? {};
      const adInfo = result.ad_info ?? {};
      const detailAddress = pickBestAddress(result);
      return NextResponse.json({
        formattedAddress: detailAddress || normalizeText(result.address),
        rawAddress: normalizeText(result.address),
        formattedAddresses: result.formatted_addresses ?? undefined,
        addressReference: result.address_reference ?? undefined,
        addressComponent: {
          cityName: String(component.city ?? adInfo.city ?? '').trim(),
          province: String(component.province ?? adInfo.province ?? '').trim(),
          district: String(component.district ?? adInfo.district ?? '').trim(),
          adcode: String(component.adcode ?? component.citycode ?? adInfo.adcode ?? adInfo.citycode ?? '').trim(),
          street: String(component.street ?? '').trim(),
          streetNumber: String(component.street_number ?? '').trim(),
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
