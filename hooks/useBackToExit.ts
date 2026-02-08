'use client';

import { useEffect, useState } from 'react';

interface UseBackToExitOptions {
  enabled?: boolean;
  onShowDialog?: (show: boolean) => void;
}

/**
 * 返回键退出应用的Hook
 * 在移动端浏览器中监听返回键，显示退出确认弹窗
 *
 * @param options 配置选项
 * @param options.enabled 是否启用（默认true）
 * @param options.onShowDialog 显示/隐藏弹窗的回调
 */
export function useBackToExit(options: UseBackToExitOptions = {}) {
  const {
    enabled = true,
    onShowDialog
  } = options;

  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    // 添加一个历史记录，防止直接退出
    window.history.pushState(null, '', window.location.href);

    const handlePopState = () => {
      // 显示退出确认弹窗
      setShowDialog(true);
      if (onShowDialog) {
        onShowDialog(true);
      }

      // 重新添加历史记录，防止直接退出
      window.history.pushState(null, '', window.location.href);
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [enabled, onShowDialog]);

  const handleConfirm = () => {
    setShowDialog(false);
    if (onShowDialog) {
      onShowDialog(false);
    }
    closeApp();
  };

  const handleCancel = () => {
    setShowDialog(false);
    if (onShowDialog) {
      onShowDialog(false);
    }
  };

  return {
    showDialog,
    handleConfirm,
    handleCancel
  };
}

/**
 * 尝试关闭应用
 * 按优先级尝试不同的关闭方法
 */
function closeApp() {
  const win = window as any;

  // 方案1: 尝试各种可能的JSBridge命名
  const jsBridgeAttempts = [
    { obj: 'JSBridge', method: 'closeApp' },
    { obj: 'JSBridge', method: 'close' },
    { obj: 'Android', method: 'closeApp' },
    { obj: 'Android', method: 'close' },
    { obj: 'AndroidInterface', method: 'closeApp' },
    { obj: 'AndroidInterface', method: 'close' },
    { obj: 'NativeApp', method: 'closeApp' },
    { obj: 'NativeApp', method: 'close' },
  ];

  for (const { obj, method } of jsBridgeAttempts) {
    if (typeof win[obj] !== 'undefined' && typeof win[obj][method] === 'function') {
      try {
        win[obj][method]();
        return;
      } catch (e) {
        console.warn(`${obj}.${method} failed:`, e);
      }
    }
  }

  // 方案2: 如果是微信环境，使用微信的关闭方法
  if (typeof win.WeixinJSBridge !== 'undefined') {
    try {
      win.WeixinJSBridge.call('closeWindow');
      return;
    } catch (e) {
      console.warn('WeixinJSBridge.closeWindow failed:', e);
    }
  }

  // 方案3: 尝试使用 window.close()
  window.close();

  // 注意：如果以上方法都失败，用户需要手动关闭应用
  // 不使用 window.location.href = 'about:blank' 因为会触发浏览器选择器
}
