/**
 * 骨架屏组件 - 摆姿卡片
 * 纯 CSS 实现，零 JS 开销
 */

export default function SkeletonPose() {
  return (
    <div className="flex-1 min-h-0 relative w-full mb-4">
      {/* 胶带效果 */}
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-20 h-6 bg-[#FFC857]/20 rounded-sm rotate-[-2deg] z-10 animate-pulse" />

      {/* 卡片容器 */}
      <div className="bg-white p-3 pb-5 rounded-2xl shadow-[0_8px_30px_rgba(93,64,55,0.12)] h-full flex flex-col relative">
        {/* 装饰图标 */}
        <div className="absolute top-1 right-1 text-xl opacity-10">📷</div>

        {/* 图片骨架 */}
        <div className="relative flex-1 bg-gradient-to-br from-[#FFFBF0] to-[#FFF4E0] overflow-hidden rounded-sm">
          <div className="absolute inset-0 shimmer" />
        </div>

        {/* 标签骨架 */}
        <div className="mt-3 flex-none">
          <div className="flex flex-wrap gap-2 justify-center">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-7 w-16 bg-gradient-to-r from-[#FFE5E5]/40 to-[#FFF4E0]/40 rounded-2xl animate-pulse"
                style={{ animationDelay: `${i * 0.1}s` }}
              />
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }

        .shimmer::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent 0%,
            rgba(255, 255, 255, 0.6) 50%,
            transparent 100%
          );
          animation: shimmer 2s infinite;
        }
      `}</style>
    </div>
  );
}
