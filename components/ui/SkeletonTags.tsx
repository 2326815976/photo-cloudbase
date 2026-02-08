/**
 * 骨架屏组件 - 标签栏
 * 纯 CSS 实现，零 JS 开销
 */

export default function SkeletonTags() {
  return (
    <div className="flex-none mb-4">
      <div className="flex items-center gap-2">
        <div className="flex-1 overflow-x-auto scrollbar-hidden">
          <div className="flex gap-2 pb-1">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div
                key={i}
                className="flex-shrink-0 h-7 bg-white/40 rounded-full animate-pulse"
                style={{
                  width: `${60 + (i % 3) * 20}px`,
                  animationDelay: `${i * 0.05}s`,
                }}
              />
            ))}
          </div>
        </div>

        {/* "全部"按钮骨架 */}
        <div className="flex-shrink-0 w-16 h-7 bg-[#5D4037]/10 rounded-full animate-pulse" />
      </div>
    </div>
  );
}
