'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import ImagePreview from '@/components/ImagePreview';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

/**
 * ImagePreview 组件演示页面
 * 展示微信原生风格图片查看器的所有功能
 */
export default function ImagePreviewDemoPage() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  // 示例图片数组（使用 Unsplash 的示例图片）
  const demoImages = [
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200',
    'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1200',
    'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1200',
    'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=1200',
    'https://images.unsplash.com/photo-1426604966848-d7adac402bff?w=1200',
  ];

  const openPreview = (index: number) => {
    setCurrentIndex(index);
    setIsOpen(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FFFBF0] via-[#FFF8E8] to-[#FFF4E0]">
      {/* 顶部导航栏 */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm border-b border-[#5D4037]/10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-[#5D4037]/10 flex items-center justify-center hover:bg-[#5D4037]/20 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-[#5D4037]" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-[#5D4037]" style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}>
              ImagePreview 组件演示
            </h1>
            <p className="text-sm text-[#5D4037]/60">微信原生风格图片查看器</p>
          </div>
        </div>
      </div>

      {/* 主内容区域 */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* 功能说明卡片 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-lg p-6 mb-8 border-2 border-[#5D4037]/10"
        >
          <h2 className="text-lg font-bold text-[#5D4037] mb-4">✨ 核心功能</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h3 className="font-semibold text-[#5D4037]">🔍 缩放功能</h3>
              <ul className="text-sm text-[#5D4037]/70 space-y-1">
                <li>• 双指缩放：最小 contain 模式，最大 3 倍</li>
                <li>• 临时缩放回弹：超出范围松手自动回弹</li>
                <li>• 鼠标滚轮缩放（PC 端）</li>
                <li>• 缩放中心为触摸/鼠标位置</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-[#5D4037]">👆 手势交互</h3>
              <ul className="text-sm text-[#5D4037]/70 space-y-1">
                <li>• 左右滑动切换图片（跟随手指）</li>
                <li>• 双击还原/放大</li>
                <li>• 单击退出查看器</li>
                <li>• 长按下载（非微信环境）</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-[#5D4037]">🎨 视觉效果</h3>
              <ul className="text-sm text-[#5D4037]/70 space-y-1">
                <li>• 平滑的 spring 动画</li>
                <li>• 图片序号显示</li>
                <li>• 实时缩放比例显示</li>
                <li>• 长按下载进度环</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold text-[#5D4037]">⚙️ 技术实现</h3>
              <ul className="text-sm text-[#5D4037]/70 space-y-1">
                <li>• @use-gesture/react 手势处理</li>
                <li>• framer-motion 动画引擎</li>
                <li>• TypeScript 类型安全</li>
                <li>• 完全响应式设计</li>
              </ul>
            </div>
          </div>
        </motion.div>

        {/* 使用说明卡片 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl shadow-lg p-6 mb-8 border-2 border-[#5D4037]/10"
        >
          <h2 className="text-lg font-bold text-[#5D4037] mb-4">📖 使用说明</h2>
          <div className="space-y-3 text-sm text-[#5D4037]/70">
            <p><strong>移动端：</strong></p>
            <ul className="space-y-1 ml-4">
              <li>• 单指左右滑动切换图片</li>
              <li>• 双指捏合缩放图片</li>
              <li>• 双击快速还原/放大</li>
              <li>• 长按触发下载（显示进度环）</li>
              <li>• 单击空白处退出</li>
            </ul>
            <p className="mt-3"><strong>PC 端：</strong></p>
            <ul className="space-y-1 ml-4">
              <li>• 鼠标滚轮缩放图片</li>
              <li>• 拖拽移动已缩放的图片</li>
              <li>• 双击快速还原/放大</li>
              <li>• 点击空白处退出</li>
            </ul>
          </div>
        </motion.div>

        {/* 图片网格 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl shadow-lg p-6 border-2 border-[#5D4037]/10"
        >
          <h2 className="text-lg font-bold text-[#5D4037] mb-4">🖼️ 点击图片体验</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {demoImages.map((image, index) => (
              <motion.div
                key={index}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="relative aspect-square rounded-xl overflow-hidden cursor-pointer shadow-md hover:shadow-xl transition-shadow"
                onClick={() => openPreview(index)}
              >
                <img
                  src={image}
                  alt={`示例图片 ${index + 1}`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent flex items-end justify-center pb-3">
                  <span className="text-white text-sm font-medium">图片 {index + 1}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* 代码示例卡片 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-2xl shadow-lg p-6 mt-8 border-2 border-[#5D4037]/10"
        >
          <h2 className="text-lg font-bold text-[#5D4037] mb-4">💻 代码示例</h2>
          <pre className="bg-[#5D4037]/5 rounded-lg p-4 overflow-x-auto text-xs">
            <code>{`import ImagePreview from '@/components/ImagePreview';

function MyComponent() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const images = [
    'https://example.com/image1.jpg',
    'https://example.com/image2.jpg',
  ];

  return (
    <>
      <button onClick={() => setIsOpen(true)}>
        打开图片查看器
      </button>

      <ImagePreview
        images={images}
        currentIndex={currentIndex}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onIndexChange={(index) => setCurrentIndex(index)}
        showCounter={true}
        showScale={true}
        enableLongPressDownload={true}
      />
    </>
  );
}`}</code>
          </pre>
        </motion.div>
      </div>

      {/* ImagePreview 组件 */}
      <ImagePreview
        images={demoImages}
        currentIndex={currentIndex}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onIndexChange={setCurrentIndex}
        showCounter={true}
        showScale={true}
        enableLongPressDownload={true}
      />
    </div>
  );
}
