'use client';

import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, MapPin, Search } from 'lucide-react';
import { isAndroidApp } from '@/lib/platform';
import Toast from '@/components/ui/Toast';

interface MapPickerSelectMeta {
  cityName?: string;
  province?: string;
  district?: string;
  adcode?: string;
}

interface MapPickerProps {
  onSelect: (location: string, lat: number, lng: number, meta?: MapPickerSelectMeta) => void;
  onClose: () => void;
  cityName?: string; // 可选的城市限制,用于限制搜索范围
}

interface SearchResult {
  name: string;
  address: string;
  location: { lat: number; lng: number };
  cityName?: string;
  province?: string;
  district?: string;
  adcode?: string;
}

function normalizeSelectMeta(input: Record<string, unknown> | null | undefined): MapPickerSelectMeta {
  const cityName = String(input?.cityName ?? input?.city ?? '').trim();
  const province = String(input?.province ?? '').trim();
  const district = String(input?.district ?? '').trim();
  const adcode = String(input?.adcode ?? '').trim();

  return {
    cityName: cityName || undefined,
    province: province || undefined,
    district: district || undefined,
    adcode: adcode || undefined,
  };
}

function readCoordinateValue(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw;
  }

  if (typeof raw === 'string') {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function extractLatLng(input: unknown): { lat: number; lng: number } | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const candidate = input as Record<string, unknown>;

  const directLat = readCoordinateValue(candidate.lat);
  const directLng = readCoordinateValue(candidate.lng);
  if (directLat !== null && directLng !== null) {
    return { lat: directLat, lng: directLng };
  }

  const getLat = typeof candidate.getLat === 'function' ? candidate.getLat.bind(candidate) : null;
  const getLng = typeof candidate.getLng === 'function' ? candidate.getLng.bind(candidate) : null;
  if (getLat && getLng) {
    const methodLat = readCoordinateValue(getLat());
    const methodLng = readCoordinateValue(getLng());
    if (methodLat !== null && methodLng !== null) {
      return { lat: methodLat, lng: methodLng };
    }
  }

  return null;
}

function formatCoordinateAddress(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

async function readJsonSafe(response: Response): Promise<any | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function normalizeReverseGeocodePayload(payload: any): { formattedAddress: string; addressComponent: MapPickerSelectMeta } | null {
  const candidate = payload?.result ?? payload?.data?.result ?? payload?.data ?? payload;
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const formattedAddress = String(candidate.address ?? candidate.formattedAddress ?? '').trim();
  const addressComponent = normalizeSelectMeta(
    candidate.address_component ?? candidate.addressComponent ?? candidate.ad_info ?? candidate
  );

  if (!formattedAddress && !addressComponent.cityName && !addressComponent.province && !addressComponent.district) {
    return null;
  }

  return {
    formattedAddress,
    addressComponent,
  };
}

function normalizeSearchResultItem(item: any): SearchResult | null {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const location =
    extractLatLng(item.location) ??
    extractLatLng(item.latlng) ??
    extractLatLng(item.point) ??
    extractLatLng(item.position);
  if (!location) {
    return null;
  }

  const name = String(item.title ?? item.name ?? '').trim();
  const address = String(item.address ?? item.addr ?? '').trim();
  if (!name && !address) {
    return null;
  }

  const meta = normalizeSelectMeta(item.ad_info ?? item.address_component ?? item.addressComponent ?? item);

  return {
    name: name || address,
    address,
    location,
    cityName: meta.cityName,
    province: meta.province,
    district: meta.district,
    adcode: meta.adcode,
  };
}

function normalizeSearchResultsPayload(payload: any): SearchResult[] {
  const candidates = [
    payload,
    payload?.result,
    payload?.data,
    payload?.result?.data,
    payload?.data?.data,
    payload?.suggestions,
    payload?.data?.suggestions,
  ];

  const rows = candidates.find((item) => Array.isArray(item));
  if (!Array.isArray(rows)) {
    return [];
  }

  const dedupe = new Set<string>();
  const results: SearchResult[] = [];

  rows.forEach((row) => {
    const normalized = normalizeSearchResultItem(row);
    if (!normalized) {
      return;
    }
    const key = `${normalized.location.lat},${normalized.location.lng},${normalized.name}`;
    if (dedupe.has(key)) {
      return;
    }
    dedupe.add(key);
    results.push(normalized);
  });

  return results;
}

async function invokeTencentService(
  instance: any,
  methodNames: string[],
  payloadCandidates: unknown[]
): Promise<any | null> {
  for (const methodName of methodNames) {
    const method = instance?.[methodName];
    if (typeof method !== 'function') {
      continue;
    }

    for (const payload of payloadCandidates) {
      try {
        const returned = method.call(instance, payload);
        if (returned && typeof returned.then === 'function') {
          const asyncResult = await returned;
          if (asyncResult !== null && asyncResult !== undefined) {
            return asyncResult;
          }
        } else if (returned !== undefined) {
          return returned;
        }
      } catch {
        // ignore and try next payload/call style
      }

      const callbackResult = await new Promise<any | null>((resolve) => {
        let finished = false;
        const timer = window.setTimeout(() => {
          if (!finished) {
            finished = true;
            resolve(null);
          }
        }, 1200);

        try {
          method.call(instance, payload, (...args: any[]) => {
            if (finished) {
              return;
            }
            finished = true;
            window.clearTimeout(timer);
            if (args.length <= 1) {
              resolve(args[0] ?? null);
              return;
            }
            resolve({
              status: args[0],
              result: args[1],
            });
          });
        } catch {
          if (!finished) {
            finished = true;
            window.clearTimeout(timer);
            resolve(null);
          }
        }
      });

      if (callbackResult !== null && callbackResult !== undefined) {
        return callbackResult;
      }
    }
  }

  return null;
}

async function reverseGeocodeByClientService(lat: number, lng: number): Promise<{ formattedAddress: string; addressComponent: MapPickerSelectMeta } | null> {
  const TMap = (window as any).TMap;
  const Geocoder = TMap?.service?.Geocoder;
  if (!Geocoder) {
    return null;
  }

  let geocoder: any = null;
  try {
    geocoder = new Geocoder();
  } catch {
    return null;
  }

  const latLng = (() => {
    try {
      return new TMap.LatLng(lat, lng);
    } catch {
      return { lat, lng };
    }
  })();

  const serviceResult = await invokeTencentService(
    geocoder,
    ['getAddress', 'reverseGeocoder', 'search'],
    [
      { location: latLng, get_poi: 0 },
      { location: `${lat},${lng}`, get_poi: 0 },
      { location: { lat, lng }, get_poi: 0 },
      latLng,
      `${lat},${lng}`,
    ]
  );

  return normalizeReverseGeocodePayload(serviceResult);
}

async function searchByClientService(keyword: string, cityName?: string): Promise<SearchResult[] | null> {
  const TMap = (window as any).TMap;
  const service = TMap?.service;
  if (!service) {
    return null;
  }

  const payloadCandidates = [
    { keyword, region: cityName || undefined, pageSize: 10 },
    { keyword, boundary: cityName ? `region(${cityName},0)` : undefined, pageSize: 10 },
    { keyword, pageSize: 10 },
    keyword,
  ];

  const serviceClasses = [service.Suggestion, service.Search].filter((entry) => typeof entry === 'function');
  for (const ServiceClass of serviceClasses) {
    let serviceInstance: any = null;
    try {
      serviceInstance = new ServiceClass({
        pageSize: 10,
        region: cityName || undefined,
      });
    } catch {
      continue;
    }

    const serviceResult = await invokeTencentService(
      serviceInstance,
      ['getSuggestions', 'search', 'getPoiList'],
      payloadCandidates
    );
    const normalized = normalizeSearchResultsPayload(serviceResult);
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return null;
}

export default function MapPicker({ onSelect, onClose, cityName }: MapPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const reverseGeocodeHintShownRef = useRef(false);
  const searchHintShownRef = useRef(false);
  const [map, setMap] = useState<any>(null);
  const [marker, setMarker] = useState<any>(null);
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedMeta, setSelectedMeta] = useState<MapPickerSelectMeta>({});

  useEffect(() => {
    setIsAndroid(isAndroidApp());
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    let checkCount = 0;
    const maxChecks = 50;

    const checkTMapLoaded = () => {
      checkCount++;

      if ((window as any).TMap) {
        const container = mapRef.current;
        if (container && container.offsetHeight > 0) {
          setTimeout(() => initializeMap(), 100);
        } else {
          setTimeout(checkTMapLoaded, 100);
        }
      } else {
        if (checkCount >= maxChecks) {
          setToast('地图加载失败，请刷新页面');
          setLoading(false);
        } else {
          setTimeout(checkTMapLoaded, 100);
        }
      }
    };

    checkTMapLoaded();
  }, []);

  const initializeMap = () => {
    const timeout = setTimeout(() => {
      setToast('定位超时，使用默认位置');
      initMap(25.2387, 110.2124);
    }, 3000);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timeout);
        const { latitude, longitude } = position.coords;
        initMap(latitude, longitude);
      },
      (error) => {
        clearTimeout(timeout);
        if (isAndroid && error.code === error.PERMISSION_DENIED) {
          setToast('需要位置权限才能定位');
        } else {
          setToast('定位失败，使用默认位置');
        }
        initMap(25.2387, 110.2124);
      },
      { timeout: 3000, enableHighAccuracy: false }
    );
  };

  useEffect(() => {
    if (!searchQuery.trim() || !map) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(() => {
      handleSearch();
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, map]);

  const initMap = (lat: number, lng: number) => {
    const TMap = (window as any).TMap;

    if (!TMap) {
      setToast('地图初始化失败');
      setLoading(false);
      return;
    }

    try {
      const center = new TMap.LatLng(lat, lng);
      const mapInstance = new TMap.Map(mapRef.current, {
        center: center,
        zoom: 15,
        viewMode: '2D',
      });

      const markerInstance = new TMap.MultiMarker({
        map: mapInstance,
        styles: {
          marker: new TMap.MarkerStyle({
            width: 25,
            height: 35,
            anchor: { x: 12, y: 35 },
          }),
        },
        geometries: [
          {
            id: 'marker',
            position: center,
            properties: { draggable: true },
          },
        ],
      });

      markerInstance.on('drag_end', (e: any) => {
        const position = extractLatLng(e?.geometry?.position);
        if (!position) {
          return;
        }
        getAddress(position.lat, position.lng);
      });

      mapInstance.on('click', (e: any) => {
        const clicked = extractLatLng(e?.latLng);
        if (!clicked) {
          return;
        }
        const { lat, lng } = clicked;
        markerInstance.updateGeometries([
          {
            id: 'marker',
            position: new TMap.LatLng(lat, lng),
            properties: { draggable: true },
          },
        ]);
        getAddress(lat, lng);
      });

      setMap(mapInstance);
      setMarker(markerInstance);
      getAddress(lat, lng);
      setLoading(false);
    } catch (error) {
      setToast('地图初始化失败');
      setLoading(false);
    }
  };

  const showTencentMapHintOnce = (hint: string | undefined, type: 'reverse' | 'search') => {
    const normalizedHint = String(hint ?? '').trim();
    if (!normalizedHint) {
      return;
    }

    if (type === 'reverse') {
      if (reverseGeocodeHintShownRef.current) {
        return;
      }
      reverseGeocodeHintShownRef.current = true;
      setToast(normalizedHint);
      return;
    }

    if (searchHintShownRef.current) {
      return;
    }
    searchHintShownRef.current = true;
    setToast(normalizedHint);
  };

  const getAddress = async (lat: number, lng: number) => {
    const fallbackAddress = formatCoordinateAddress(lat, lng);

    try {
      const response = await fetch('/api/tencent-map/reverse-geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng }),
      });
      const payload = await readJsonSafe(response);
      const normalized = normalizeReverseGeocodePayload(payload);

      if (response.ok && normalized) {
        setAddress(normalized.formattedAddress || fallbackAddress);
        setSelectedMeta(normalized.addressComponent);
        return;
      }

      const sdkFallback = await reverseGeocodeByClientService(lat, lng);
      if (sdkFallback) {
        setAddress(sdkFallback.formattedAddress || fallbackAddress);
        setSelectedMeta(sdkFallback.addressComponent);
        showTencentMapHintOnce(payload?.hint, 'reverse');
        return;
      }

      setAddress(fallbackAddress);
      setSelectedMeta({
        cityName: cityName || undefined,
      });
      showTencentMapHintOnce(payload?.hint, 'reverse');
    } catch {
      const sdkFallback = await reverseGeocodeByClientService(lat, lng);
      if (sdkFallback) {
        setAddress(sdkFallback.formattedAddress || fallbackAddress);
        setSelectedMeta(sdkFallback.addressComponent);
        return;
      }

      setAddress(fallbackAddress);
      setSelectedMeta({
        cityName: cityName || undefined,
      });
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setIsSearching(false);
      return;
    }

    try {
      const response = await fetch('/api/tencent-map/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: searchQuery, cityName }),
      });
      const payload = await readJsonSafe(response);

      if (response.ok) {
        const results = normalizeSearchResultsPayload(payload?.results ?? payload);
        setSearchResults(results);
        setShowResults(results.length > 0);
        return;
      }

      const sdkResults = await searchByClientService(searchQuery, cityName);
      if (sdkResults && sdkResults.length > 0) {
        setSearchResults(sdkResults);
        setShowResults(true);
        showTencentMapHintOnce(payload?.hint, 'search');
        return;
      }

      setSearchResults([]);
      setShowResults(false);
      showTencentMapHintOnce(payload?.hint, 'search');
    } catch {
      const sdkResults = await searchByClientService(searchQuery, cityName);
      if (sdkResults && sdkResults.length > 0) {
        setSearchResults(sdkResults);
        setShowResults(true);
        return;
      }

      setSearchResults([]);
      setShowResults(false);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectResult = (result: SearchResult) => {
    if (marker && map) {
      const TMap = (window as any).TMap;
      const position = new TMap.LatLng(result.location.lat, result.location.lng);

      marker.updateGeometries([
        {
          id: 'marker',
          position: position,
          properties: { draggable: true },
        },
      ]);
      map.setCenter(position);
      setAddress(`${result.name} - ${result.address}`);
      setSelectedMeta(
        normalizeSelectMeta({
          cityName: result.cityName,
          province: result.province,
          district: result.district,
          adcode: result.adcode,
        })
      );
      // 优先使用逆地理编码结果，保证城市信息与最终坐标一致。
      void getAddress(result.location.lat, result.location.lng);
      setShowResults(false);
      setSearchQuery('');
    }
  };

  const handleConfirm = () => {
    if (marker && address) {
      const geometries = marker.getGeometries();
      if (geometries.length > 0) {
        const position = extractLatLng(geometries[0]?.position);
        if (!position) {
          setToast('无法读取坐标，请重新选择位置');
          return;
        }
        const fallbackMeta: MapPickerSelectMeta = {
          cityName: selectedMeta.cityName || cityName || undefined,
          province: selectedMeta.province,
          district: selectedMeta.district,
          adcode: selectedMeta.adcode,
        };
        onSelect(address, position.lat, position.lng, fallbackMeta);
      }
    }
  };

  const MapContent = (
    <>
      <div className="flex-none flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-[#FFC857]" />
          <h3 className="text-lg font-semibold text-[#5D4037]">选择位置</h3>
        </div>
        <button onClick={onClose} className={`p-2 hover:bg-gray-100 rounded-full transition-colors ${isAndroid ? 'active:scale-90' : ''}`}>
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="flex-none p-3 sm:p-4 border-b border-gray-200">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索地点、地址..."
            className="w-full pl-10 pr-4 py-2.5 sm:py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#FFC857] focus:ring-2 focus:ring-[#FFC857]/20 text-base"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          {isSearching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-[#FFC857] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {showResults && searchResults.length > 0 && (
            <div
              className="absolute left-0 right-0 top-full mt-2 z-[9999] max-h-[200px] overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
            >
              {searchResults.map((result, index) => (
                <button
                  key={index}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSelectResult(result);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSelectResult(result);
                  }}
                  className="w-full text-left px-3 py-2.5 sm:py-2 hover:bg-gray-50 active:bg-gray-100 border-b border-gray-100 last:border-b-0 transition-colors"
                >
                  <div className="font-medium text-[#5D4037] text-sm">{result.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{result.address}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="relative flex-shrink-0">
        <div ref={mapRef} className="w-full h-[350px] [&_.tmap-zoom-control]:hidden [&_.tmap-scale-control]:hidden" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
            <div className="text-[#5D4037]">加载地图中...</div>
          </div>
        )}
      </div>

      <div className="flex-none p-3 sm:p-4 bg-gray-50 border-t border-gray-200">
        <div className="text-xs sm:text-sm text-gray-600 mb-1">选中位置：</div>
        <div className="text-sm sm:text-base text-[#5D4037] font-medium line-clamp-2">
          {address || '拖动标记或点击地图选择位置'}
        </div>
      </div>

      <div className="flex-none flex gap-3 p-3 sm:p-4 border-t border-gray-200 bg-white">
        <button
          onClick={onClose}
          className="flex-1 px-4 py-3 sm:py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors text-base sm:text-sm font-medium"
        >
          取消
        </button>
        <button
          onClick={handleConfirm}
          disabled={!address}
          className="flex-1 px-4 py-3 sm:py-2 bg-[#FFC857] text-[#5D4037] rounded-lg hover:bg-[#FFB347] active:bg-[#FFB347] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-base sm:text-sm font-medium"
        >
          确认选择
        </button>
      </div>
    </>
  );

  if (isAndroid) {
    return (
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-300"
        onClick={onClose}
      >
        <div
          className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300"
          style={{ maxHeight: '90vh' }}
          onClick={(e) => e.stopPropagation()}
        >
          {MapContent}
        </div>
        {toast && <Toast message={toast} type="info" onClose={() => setToast(null)} />}
      </div>
    );
  }

  return (
    <>
      {toast && <Toast message={toast} type="info" onClose={() => setToast(null)} />}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          style={{ maxHeight: '90vh' }}
          onClick={(e) => e.stopPropagation()}
        >
          {MapContent}
        </motion.div>
      </motion.div>
    </>
  );
}
