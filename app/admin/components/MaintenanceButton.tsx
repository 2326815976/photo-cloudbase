'use client';

import { useState } from 'react';
import { Settings, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function MaintenanceButton() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const runMaintenance = async () => {
    setRunning(true);
    setResult(null);

    try {
      const response = await fetch('/api/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (response.ok) {
        const cleanup = data.result?.cleanup_result || {};
        setResult({
          success: true,
          message: `维护任务执行成功！清理了 ${cleanup.deleted_photos || 0} 张照片、${cleanup.deleted_folders || 0} 个文件夹、${cleanup.deleted_albums || 0} 个相册`
        });
      } else {
        setResult({
          success: false,
          message: `执行失败：${data.error || '未知错误'}${data.details ? ` - ${data.details}` : ''}`
        });
      }
    } catch (error: any) {
      setResult({
        success: false,
        message: `执行失败：${error.message}`
      });
    } finally {
      setRunning(false);
      setTimeout(() => setResult(null), 5000);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={runMaintenance}
        disabled={running}
        className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        title="执行数据库维护任务"
      >
        {running ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Settings className="w-4 h-4" />
        )}
        <span>{running ? '执行中...' : '维护任务'}</span>
      </button>

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`absolute top-full mt-2 right-0 min-w-[300px] p-3 rounded-lg shadow-lg ${
              result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
            }`}
          >
            <div className="flex items-start gap-2">
              {result.success ? (
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <p className={`text-sm ${result.success ? 'text-green-800' : 'text-red-800'}`}>
                {result.message}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
