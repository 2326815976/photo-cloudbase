'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Lock, Sparkles } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';

export default function AlbumLoginPage() {
  const router = useRouter();
  const [accessKey, setAccessKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!accessKey.trim()) {
      setError('请输入密钥');
      return;
    }

    setIsLoading(true);

    // 模拟验证延迟
    setTimeout(() => {
      // 模拟密钥验证（实际应该调用 API）
      if (accessKey === 'demo123') {
        router.push(`/album/${accessKey}`);
      } else {
        setError('密钥错误，请重试');
        setIsLoading(false);
      }
    }, 800);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="max-w-md w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', delay: 0.2 }}
            className="inline-flex items-center justify-center w-20 h-20 bg-accent/20 rounded-full mb-4"
          >
            <Lock className="w-10 h-10 text-accent" />
          </motion.div>
          <h1 className="text-2xl font-bold mb-2 text-foreground">
            专属返图空间
          </h1>
          <p className="text-foreground/70 text-sm">
            输入摄影师提供的密钥，开启你的专属回忆 ✨
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="relative overflow-hidden">
            {/* 装饰性背景 */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl -z-10" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-secondary/10 rounded-full blur-3xl -z-10" />

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Input
                  type="text"
                  placeholder="输入神秘密钥..."
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                  className="text-center text-lg tracking-wider"
                  disabled={isLoading}
                />
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-red-500 mt-2 text-center"
                  >
                    {error}
                  </motion.p>
                )}
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full flex items-center justify-center gap-2"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    >
                      <Sparkles className="w-5 h-5" />
                    </motion.div>
                    <span>验证中...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    <span>开启回忆</span>
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t border-border-light">
              <p className="text-xs text-foreground/50 text-center">
                💡 提示：密钥由摄影师提供，请妥善保管
              </p>
              <p className="text-xs text-foreground/50 text-center mt-1">
                （演示密钥：demo123）
              </p>
            </div>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-6 text-center"
        >
          <a
            href="/"
            className="text-sm text-secondary hover:text-secondary/80 transition-colors"
          >
            ← 返回首页
          </a>
        </motion.div>
      </div>
    </div>
  );
}
