'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, ArrowUpRight } from 'lucide-react';

interface WechatDownloadGuideProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl?: string;
  isBatchDownload?: boolean;
  onTryDownload?: () => void;
}

/**
 * 微信浏览器下载引导组件
 * 提示用户长按保存图片或在浏览器中打开
 */
export default function WechatDownloadGuide({ isOpen, onClose, imageUrl, isBatchDownload, onTryDownload }: WechatDownloadGuideProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 遮罩层 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200]"
          />

          {/* 引导弹窗 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[201] max-w-md mx-auto"
          >
            <div className="bg-[#FFFBF0] rounded-2xl shadow-2xl border-2 border-[#5D4037]/10 overflow-hidden">
              {/* 关闭按钮 */}
              <button
                onClick={onClose}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-[#5D4037]/10 flex items-center justify-center hover:bg-[#5D4037]/20 transition-colors z-10"
              >
                <X className="w-5 h-5 text-[#5D4037]" />
              </button>

              {/* 内容区域 */}
              <div className="p-6 pt-8">
                {/* 标题 */}
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-[#FFC857]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Download className="w-8 h-8 text-[#FFC857]" />
                  </div>
                  <h3 className="text-xl font-bold text-[#5D4037] mb-2" style={{ fontFamily: "'ZQKNNY', cursive" }}>
                    💡 微信浏览器下载提示
                  </h3>
                </div>

                {/* 批量下载提示 */}
                {isBatchDownload && (
                  <div className="mb-6">
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                      <p className="text-sm text-[#5D4037] leading-relaxed">
                        ⚠️ 微信浏览器不支持批量下载。请使用以下方法：
                      </p>
                    </div>
                  </div>
                )}


                {/* 批量下载方法 */}
                {isBatchDownload && (
                  <div className="mb-6">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 bg-[#FFC857] rounded-full flex items-center justify-center text-[#5D4037] font-bold text-sm">
                        1
                      </div>
                      <div className="flex-1">
                        <h4 className="text-base font-bold text-[#5D4037] mb-2">点击图片查看并保存</h4>
                        <p className="text-sm text-[#5D4037]/70 leading-relaxed mb-3">
                          点击任意图片进入全屏查看，可以<span className="font-bold text-[#FFC857]">左右滑动</span>浏览所有原图，<span className="font-bold text-[#FFC857]">长按图片</span>保存到相册
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 方法2：浏览器打开 */}
                {isBatchDownload && (
                  <div className="mb-6">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 bg-[#FFC857] rounded-full flex items-center justify-center text-[#5D4037] font-bold text-sm">
                        2
                      </div>
                      <div className="flex-1">
                        <h4 className="text-base font-bold text-[#5D4037] mb-2">在浏览器中打开（推荐）</h4>
                        <p className="text-sm text-[#5D4037]/70 leading-relaxed mb-3">
                          点击右上角 <span className="font-bold">「···」</span> 菜单，选择<span className="font-bold text-[#FFC857]">「在浏览器中打开」</span>，即可使用批量下载功能
                        </p>
                        <div className="flex items-center gap-2 text-xs text-[#5D4037]/50">
                          <ArrowUpRight className="w-4 h-4" />
                          <span>支持批量下载和更多功能</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}


                {/* 单张下载方法 */}
                {!isBatchDownload && (
                  <>
                    <div className="mb-6">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-8 h-8 bg-[#FFC857] rounded-full flex items-center justify-center text-[#5D4037] font-bold text-sm">
                          1
                        </div>
                        <div className="flex-1">
                          <h4 className="text-base font-bold text-[#5D4037] mb-2">长按图片保存（推荐）</h4>
                          <p className="text-sm text-[#5D4037]/70 leading-relaxed">
                            点击查看原图后，<span className="font-bold text-[#FFC857]">长按图片</span>，在弹出菜单中选择<span className="font-bold">「保存图片」</span>即可保存到相册
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mb-6">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-8 h-8 bg-[#FFC857] rounded-full flex items-center justify-center text-[#5D4037] font-bold text-sm">
                          2
                        </div>
                        <div className="flex-1">
                          <h4 className="text-base font-bold text-[#5D4037] mb-2">在浏览器中打开</h4>
                          <p className="text-sm text-[#5D4037]/70 leading-relaxed mb-3">
                            点击右上角 <span className="font-bold">「···」</span> 菜单，选择<span className="font-bold text-[#FFC857]">「在浏览器中打开」</span>，即可使用下载功能
                          </p>
                          <div className="flex items-center gap-2 text-xs text-[#5D4037]/50">
                            <ArrowUpRight className="w-4 h-4" />
                            <span>支持批量下载和更多功能</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* 底部提示 */}
                <div className="bg-[#FFC857]/10 rounded-lg p-3 border border-[#FFC857]/30">
                  <p className="text-xs text-[#5D4037]/60 leading-relaxed text-center">
                    💡 由于微信浏览器的限制，暂时无法直接批量下载。建议使用长按保存或在浏览器中打开以获得更好的体验。
                  </p>
                </div>

                {/* 确认按钮 */}
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={onClose}
                  className="w-full mt-4 px-4 py-3 rounded-full text-sm font-medium bg-[#FFC857] text-[#5D4037] shadow-md hover:shadow-lg transition-all"
                >
                  我知道了
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
