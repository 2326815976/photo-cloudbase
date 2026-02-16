'use client';

/**
 * 腾讯地图 JS SDK（qq.maps）坐标构造器兼容层。
 * 某些加载阶段会先注入 qq.maps 命名空间，但 LatLng 尚未就绪；
 * 另外也存在 LatLng 不能被 `new` 的实现差异（可调用但不可构造）。
 */
export function createQqLatLng(lat: number, lng: number): any | null {
  const qq = (window as any).qq;
  const LatLng = qq?.maps?.LatLng;
  if (typeof LatLng !== 'function') {
    return null;
  }

  try {
    return new (LatLng as any)(lat, lng);
  } catch {
    try {
      return (LatLng as any)(lat, lng);
    } catch {
      return null;
    }
  }
}

