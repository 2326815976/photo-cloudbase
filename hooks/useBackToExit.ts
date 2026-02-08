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
  // 方案1: 如果有JSBridge，调用原生方法
  if (typeof (window as any).JSBridge !== 'undefined' && (window as any).JSBridge.closeApp) {
    try {
      (window as any).JSBridge.closeApp();
      return;
    } catch (e) {
      console.warn('JSBridge.closeApp failed:', e);
    }
  }

  // 方案2: 如果是微信环境，使用微信的关闭方法
  if (typeof (window as any).WeixinJSBridge !== 'undefined') {
    try {
      (window as any).WeixinJSBridge.call('closeWindow');
      return;
    } catch (e) {
      console.warn('WeixinJSBridge.closeWindow failed:', e);
    }
  }

  // 方案3: 尝试使用 window.close()
  try {
    window.close();
  } catch (e) {
    console.warn('window.close failed:', e);
  }

  // 方案4: 如果以上都失败，导航到空白页
  window.location.href = 'about:blank';
}
