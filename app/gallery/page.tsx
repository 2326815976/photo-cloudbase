'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, Eye } from 'lucide-react';
import Card from '@/components/ui/Card';

// 模拟数据：公开作品
const mockGalleryPhotos = [
  {
    id: 1,
    url: 'https://picsum.photos/seed/gallery1/400/600',
    likeCount: 123,
    viewCount: 456,
    isLiked: false,
  },
  {
    id: 2,
    url: 'https://picsum.photos/seed/gallery2/400/500',
    likeCount: 89,
    viewCount: 234,
    isLiked: false,
  },
  {
    id: 3,
    url: 'https://picsum.photos/seed/gallery3/400/650',
    likeCount: 234,
    viewCount: 789,
    isLiked: false,
  },
  {
    id: 4,
    url: 'https://picsum.photos/seed/gallery4/400/550',
    likeCount: 156,
    viewCount: 567,
    isLiked: false,
  },
  {
    id: 5,
    url: 'https://picsum.photos/seed/gallery5/400/700',
    likeCount: 345,
    viewCount: 890,
    isLiked: false,
  },
  {
    id: 6,
    url: 'https://picsum.photos/seed/gallery6/400/480',
    likeCount: 78,
    viewCount: 234,
    isLiked: false,
  },
  {
    id: 7,
    url: 'https://picsum.photos/seed/gallery7/400/620',
    likeCount: 198,
    viewCount: 678,
    isLiked: false,
  },
  {
    id: 8,
    url: 'https://picsum.photos/seed/gallery8/400/530',
    likeCount: 267,
    viewCount: 901,
    isLiked: false,
  },
];

export default function GalleryPage() {
  const [photos, setPhotos] = useState(mockGalleryPhotos);

  const handleLike = (photoId: number) => {
    setPhotos((prev) =>
      prev.map((photo) =>
        photo.id === photoId
          ? {
              ...photo,
              isLiked: !photo.isLiked,
              likeCount: photo.isLiked ? photo.likeCount - 1 : photo.likeCount + 1,
            }
          : photo
      )
    );
  };

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* 标题 */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-2xl font-bold text-foreground mb-2">
            作品墙
          </h1>
          <p className="text-sm text-foreground/60">
            分享美好瞬间 ✨
          </p>
        </motion.div>

        {/* 双列瀑布流布局 */}
        <div className="columns-2 gap-4 space-y-4">
          {photos.map((photo, index) => (
            <motion.div
              key={photo.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="break-inside-avoid mb-4"
            >
              <Card className="overflow-hidden p-0">
                {/* 照片 */}
                <div className="relative bg-accent/10">
                  <img
                    src={photo.url}
                    alt={`作品 ${photo.id}`}
                    className="w-full h-auto object-cover"
                  />
                </div>

                {/* 拍立得效果的留白区域 */}
                <div className="p-4 bg-card">
                  <div className="flex items-center justify-between">
                    {/* 点赞 */}
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleLike(photo.id)}
                      className="flex items-center gap-1 text-foreground/70 hover:text-accent transition-colors"
                    >
                      <Heart
                        className={`w-5 h-5 ${
                          photo.isLiked ? 'fill-accent text-accent' : ''
                        }`}
                      />
                      <span className="text-sm">{photo.likeCount}</span>
                    </motion.button>

                    {/* 浏览量 */}
                    <div className="flex items-center gap-1 text-foreground/70">
                      <Eye className="w-5 h-5" />
                      <span className="text-sm">{photo.viewCount}</span>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* 加载更多提示 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center mt-8 text-foreground/50 text-sm"
        >
          已加载全部作品 🎉
        </motion.div>
      </div>
    </div>
  );
}
