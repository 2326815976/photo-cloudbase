/**
 * 照片墙组件（简化版）
 *
 * 使用原生双列瀑布流布局 + 懒加载优化
 * 性能优化：只渲染可见区域的图片（通过 Intersection Observer）
 */

'use client';

import { motion } from 'framer-motion';
import { Heart, Eye } from 'lucide-react';
import CuteImage from '@/components/ui/CuteImage';

interface Photo {
  id: string;
  storage_path: string;
  width: number;
  height: number;
  like_count: number;
  view_count: number;
  is_liked: boolean;
}

interface VirtualGalleryProps {
  photos: Photo[];
  onPhotoClick: (photo: Photo) => void;
  onLike: (photoId: string, e: React.MouseEvent) => void;
}

export default function VirtualGallery({
  photos,
  onPhotoClick,
  onLike
}: VirtualGalleryProps) {
  return (
    <div className="columns-2 gap-2">
      {photos.map((photo, index) => (
        <motion.div
          key={photo.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
          className="break-inside-avoid mb-2"
        >
          <div className="bg-white rounded-xl shadow-sm hover:shadow-md overflow-hidden transition-shadow duration-300">
            {/* 图片区域 */}
            <div
              className="relative cursor-pointer"
              onClick={() => onPhotoClick(photo)}
            >
              <CuteImage
                src={photo.storage_path}
                alt="照片"
                size="thumbnail"
                className="w-full h-auto"
              />
            </div>

            {/* 信息区域 */}
            <div className="p-2">
              <div className="flex items-center justify-between">
                {/* 浏览量 */}
                <div className="flex items-center gap-1 text-[#8D6E63]/60">
                  <Eye className="w-3 h-3" />
                  <span className="text-[10px]">{photo.view_count}</span>
                </div>

                {/* 点赞 */}
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={(e) => onLike(photo.id, e)}
                  className="flex items-center gap-0.5"
                >
                  <Heart
                    className={`w-3 h-3 transition-all duration-300 ${
                      photo.is_liked
                        ? 'fill-[#FFC857] text-[#FFC857]'
                        : 'text-[#8D6E63]/60'
                    }`}
                  />
                  <span className="text-[10px] text-[#8D6E63]">
                    {photo.like_count}
                  </span>
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
