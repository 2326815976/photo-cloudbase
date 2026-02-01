'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, MapPin } from 'lucide-react';

interface MapPickerProps {
  onSelect: (location: string, lat: number, lng: number) => void;
  onClose: () => void;
}

export default function MapPicker({ onSelect, onClose }: MapPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  const [marker, setMarker] = useState<any>(null);
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!mapRef.current || !(window as any).AMap) return;

    // 获取当前位置
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        initMap(latitude, longitude);
      },
      () => {
        // 定位失败，使用默认位置（广西南宁）
        initMap(22.8170, 108.3665);
      }
    );
  }, []);

  const initMap = (lat: number, lng: number) => {
    const AMap = (window as any).AMap;

    // 创建地图
    const mapInstance = new AMap.Map(mapRef.current, {
      zoom: 15,
      center: [lng, lat],
      viewMode: '3D',
    });

    // 创建可拖动的标记
    const markerInstance = new AMap.Marker({
      position: [lng, lat],
      draggable: true,
      cursor: 'move',
    });

    markerInstance.setMap(mapInstance);

    // 标记拖动结束事件
    markerInstance.on('dragend', (e: any) => {
      const position = markerInstance.getPosition();
      getAddress(position.lat, position.lng);
    });

    // 地图点击事件
    mapInstance.on('click', (e: any) => {
      const { lng, lat } = e.lnglat;
      markerInstance.setPosition([lng, lat]);
      getAddress(lat, lng);
    });

    setMap(mapInstance);
    setMarker(markerInstance);

    // 获取初始位置地址
    getAddress(lat, lng);
    setLoading(false);
  };

  const getAddress = (lat: number, lng: number) => {
    const AMap = (window as any).AMap;
    AMap.plugin('AMap.Geocoder', () => {
      const geocoder = new AMap.Geocoder();
      geocoder.getAddress([lng, lat], (status: string, result: any) => {
        if (status === 'complete' && result.info === 'OK') {
          setAddress(result.regeocode.formattedAddress);
        }
      });
    });
  };

  const handleConfirm = () => {
    if (marker && address) {
      const position = marker.getPosition();
      onSelect(address, position.lat, position.lng);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[#FFC857]" />
            <h3 className="text-lg font-semibold text-[#5D4037]">选择位置</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* 地图容器 */}
        <div className="relative">
          <div ref={mapRef} className="w-full h-[400px]" />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80">
              <div className="text-[#5D4037]">加载地图中...</div>
            </div>
          )}
        </div>

        {/* 地址显示 */}
        <div className="p-4 bg-gray-50">
          <div className="text-sm text-gray-600 mb-1">选中位置：</div>
          <div className="text-base text-[#5D4037] font-medium">
            {address || '拖动标记或点击地图选择位置'}
          </div>
        </div>

        {/* 底部按钮 */}
        <div className="flex gap-3 p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!address}
            className="flex-1 px-4 py-2 bg-[#FFC857] text-[#5D4037] rounded-lg hover:bg-[#FFB347] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            确认选择
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
