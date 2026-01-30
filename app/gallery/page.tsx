'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Heart } from 'lucide-react';

// 模拟数据：公开照片
const mockGalleryPhotos = [
  {
    id: 1,
    url: 'https://picsum.photos/seed/gallery1/400/600',
    title: '夏日江边漫步~',
    likeCount: 123,
    isLiked: false,
    user: {
      avatar: 'https://picsum.photos/seed/user1/100/100',
      name: '小光',
    },
  },
  {
    id: 2,
    url: 'https://picsum.photos/seed/gallery2/400/500',
    title: '超美的胶片感！',
    likeCount: 89,
    isLiked: false,
    user: {
      avatar: 'https://picsum.photos/seed/user2/100/100',
      name: '阿谣',
    },
  },
  {
    id: 3,
    url: 'https://picsum.photos/seed/gallery3/400/650',
    title: '定格这一刻的温柔',
    likeCount: 234,
    isLiked: false,
    user: {
      avatar: 'https://picsum.photos/seed/user3/100/100',
      name: '拾光者',
    },
  },
  {
    id: 4,
    url: 'https://picsum.photos/seed/gallery4/400/550',
    title: '城市里的小确幸',
    likeCount: 156,
    isLiked: false,
    user: {
      avatar: 'https://picsum.photos/seed/user4/100/100',
      name: '时光机',
    },
  },
  {
    id: 5,
    url: 'https://picsum.photos/seed/gallery5/400/700',
    title: '记录生活的美好瞬间',
    likeCount: 345,
    isLiked: false,
    user: {
      avatar: 'https://picsum.photos/seed/user5/100/100',
      name: '光影',
    },
  },
  {
    id: 6,
    url: 'https://picsum.photos/seed/gallery6/400/480',
    title: '治愈系的午后时光',
    likeCount: 78,
    isLiked: false,
    user: {
      avatar: 'https://picsum.photos/seed/user6/100/100',
      name: '谣言',
    },
  },
  {
    id: 7,
    url: 'https://picsum.photos/seed/gallery7/400/620',
    title: '不期而遇的惊喜',
    likeCount: 198,
    isLiked: false,
    user: {
      avatar: 'https://picsum.photos/seed/user7/100/100',
      name: '拾光',
    },
  },
  {
    id: 8,
    url: 'https://picsum.photos/seed/gallery8/400/530',
    title: '慢下来，感受生活',
    likeCount: 267,
    isLiked: false,
    user: {
      avatar: 'https://picsum.photos/seed/user8/100/100',
      name: '小确幸',
    },
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
    <div className="flex flex-col h-full w-full">
      {/* 手账风页头 */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-none bg-[#FFFBF0]/80 backdrop-blur-sm"
      >
        <div className="px-6 pt-6 pb-3">
          <h1 className="text-xl font-bold text-[#5D4037] mb-1">照片墙</h1>
          <p className="text-xs text-[#5D4037]/50">分享美好瞬间 ✨</p>
        </div>
        <div className="border-b border-dashed border-[#5D4037]/20"></div>
      </motion.div>

      {/* 滚动区域 */}
      <div className="flex-1 overflow-y-auto px-3 pb-20">
        {/* 双列瀑布流布局 */}
        <div className="columns-2 gap-3">
          {photos.map((photo, index) => (
            <motion.div
              key={photo.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="break-inside-avoid mb-3"
            >
              {/* 小红书风格卡片 */}
              <div className="bg-white rounded-xl shadow-sm border border-[#5D4037]/10 overflow-hidden">
                {/* 图片区域 */}
                <div className="relative">
                  <img
                    src={photo.url}
                    alt={photo.title}
                    className="w-full h-auto object-cover"
                  />
                </div>

                {/* 信息区域 */}
                <div className="p-3">
                  {/* 标题 */}
                  <h3 className="text-sm font-bold text-[#5D4037] line-clamp-2 mb-2">
                    {photo.title}
                  </h3>

                  {/* 用户与互动 */}
                  <div className="flex justify-between items-center">
                    {/* 左侧：用户信息 */}
                    <div className="flex items-center gap-1.5">
                      <img
                        src={photo.user.avatar}
                        alt={photo.user.name}
                        className="w-5 h-5 rounded-full bg-gray-200"
                      />
                      <span className="text-xs text-[#5D4037]/60">{photo.user.name}</span>
                    </div>

                    {/* 右侧：点赞 */}
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleLike(photo.id)}
                      className="flex items-center gap-1"
                    >
                      <Heart
                        className={`w-4 h-4 transition-colors ${
                          photo.isLiked ? 'fill-[#FFC857] text-[#FFC857]' : 'text-[#5D4037]/40'
                        }`}
                      />
                      <span className="text-xs text-[#5D4037]/60">{photo.likeCount}</span>
                    </motion.button>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* 加载更多提示 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center mt-8 text-[#5D4037]/50 text-sm"
        >
          已加载全部照片 🎉
        </motion.div>
      </div>
    </div>
  );
}
