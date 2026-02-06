'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, Download } from 'lucide-react';

/**
 * 图片预览页面
 * 用于微信浏览器中批量保存图片
 * 用户可以逐个长按保存
 */
export default function PreviewPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [imageUrls, setImageUrls] = useState<string[]>([]);

  useEffect(() => {
    const urls = searchParams.get('urls');
    if (urls) {
      try {
        setImageUrls(JSON.parse(decodeURIComponent(urls)));
      } catch (error) {
        console.error('解析图片URL失败:', error);
      }
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-[#FFFBF0]">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-[#FFFBF0]/95 backdrop-blur-md border-b-2 border-dashed border-[#5D4037]/15 shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-[#5D4037]"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">返回</span>
          </button>
          <div className="text-sm text-[#5D4037]/60">
            共 {imageUrls.length} 张图片
          </div>
        </div>
      </div>

      {/* 提示信息 */}
      <div className="p-4">
        <div className="bg-[#FFC857]/20 border-2 border-[#FFC857]/40 rounded-xl p-4 mb-4">
          <div className="flex items-start gap-3">
            <Download className="w-5 h-5 text-[#5D4037] flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-[#5D4037] mb-1">💡 保存方法</h3>
              <p className="text-sm text-[#5D4037]/70 leading-relaxed">
                <span className="font-bold text-[#FFC857]">长按图片</span>，在弹出菜单中选择<span className="font-bold">「保存图片」</span>，即可保存到相册
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 图片列表 */}
      <div className="px-4 pb-8 space-y-6">
        {imageUrls.map((url, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="bg-white rounded-xl shadow-md overflow-hidden"
          >
            <div className="p-3 bg-[#FFC857]/10 border-b border-[#5D4037]/10">
              <p className="text-sm font-medium text-[#5D4037]">
                图片 {index + 1} / {imageUrls.length}
              </p>
            </div>
            <div className="p-4">
              <img
                src={url}
                alt={`图片 ${index + 1}`}
                className="w-full h-auto rounded-lg"
                loading="lazy"
              />
            </div>
          </motion.div>
        ))}
      </div>

      {/* 底部提示 */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#FFFBF0]/95 backdrop-blur-md border-t border-[#5D4037]/10 p-4">
        <p className="text-xs text-center text-[#5D4037]/60">
          💡 长按图片即可保存到相册
        </p>
      </div>
    </div>
  );
}
