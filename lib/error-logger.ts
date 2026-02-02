/**
 * 错误日志收集系统
 */

interface ErrorLog {
  message: string;
  stack?: string;
  timestamp: number;
  userAgent: string;
  url: string;
  platform: string;
}

/**
 * 收集并上报错误日志
 */
export function logError(error: Error, context?: Record<string, any>) {
  const errorLog: ErrorLog = {
    message: error.message,
    stack: error.stack,
    timestamp: Date.now(),
    userAgent: navigator.userAgent,
    url: window.location.href,
    platform: getPlatform(),
    ...context
  };

  console.error('Error logged:', errorLog);

  // 发送到后端
  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/logs/error', JSON.stringify(errorLog));
  } else {
    fetch('/api/logs/error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(errorLog)
    }).catch(console.error);
  }

  // Android原生日志
  if ((window as any).AndroidLogger) {
    (window as any).AndroidLogger.logError(JSON.stringify(errorLog));
  }
}

/**
 * 获取平台信息
 */
function getPlatform(): string {
  if (typeof window === 'undefined') return 'server';
  if ((window as any).AndroidBridge) return 'android';
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return 'ios';
  return 'web';
}

/**
 * 初始化全局错误监听
 */
export function initErrorLogger() {
  if (typeof window === 'undefined') return;

  // 捕获未处理的错误
  window.addEventListener('error', (event) => {
    logError(new Error(event.message), {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
  });

  // 捕获未处理的Promise拒绝
  window.addEventListener('unhandledrejection', (event) => {
    logError(new Error(event.reason), {
      type: 'unhandledrejection'
    });
  });
}
