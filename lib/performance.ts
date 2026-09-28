/**
 * 性能监控工具
 * 收集 Web Vitals 指标和自定义性能数据
 */

interface PerformanceMetrics {
  lcp?: number; // Largest Contentful Paint
  fid?: number; // First Input Delay
  cls?: number; // Cumulative Layout Shift
  fcp?: number; // First Contentful Paint
  ttfb?: number; // Time to First Byte
}

const CLIENT_TELEMETRY_ENDPOINT = '/api/client-telemetry';

function isBrowserEnvironment() {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined';
}

/**
 * 收集 Web Vitals 指标
 */
export function collectWebVitals(callback: (metrics: PerformanceMetrics) => void) {
  if (!isBrowserEnvironment()) {
    return;
  }

  const metrics: PerformanceMetrics = {};

  // LCP - Largest Contentful Paint
  if ('PerformanceObserver' in window) {
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1] as any;
        metrics.lcp = lastEntry.renderTime || lastEntry.loadTime;
        callback(metrics);
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
    } catch (e) {
      console.warn('LCP observation failed:', e);
    }

    // FID - First Input Delay
    try {
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry: any) => {
          metrics.fid = entry.processingStart - entry.startTime;
          callback(metrics);
        });
      });
      fidObserver.observe({ entryTypes: ['first-input'] });
    } catch (e) {
      console.warn('FID observation failed:', e);
    }

    // CLS - Cumulative Layout Shift
    try {
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as any[]) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
            metrics.cls = clsValue;
            callback(metrics);
          }
        }
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });
    } catch (e) {
      console.warn('CLS observation failed:', e);
    }
  }

  // FCP & TTFB - 使用 Navigation Timing API
  if ('performance' in window && 'getEntriesByType' in performance) {
    const navEntry = performance.getEntriesByType('navigation')[0] as any;
    if (navEntry) {
      metrics.fcp = navEntry.responseStart - navEntry.fetchStart;
      metrics.ttfb = navEntry.responseStart - navEntry.requestStart;
      callback(metrics);
    }
  }
}

/**
 * 性能标记和测量
 */
export function markPerformance(name: string) {
  if (isBrowserEnvironment() && 'performance' in window && 'mark' in performance) {
    performance.mark(name);
  }
}

export function measurePerformance(name: string, startMark: string, endMark: string): number {
  if (isBrowserEnvironment() && 'performance' in window && 'measure' in performance) {
    try {
      performance.measure(name, startMark, endMark);
      const measure = performance.getEntriesByName(name)[0];
      return measure.duration;
    } catch (e) {
      console.warn('Performance measurement failed:', e);
      return 0;
    }
  }
  return 0;
}

/**
 * 上报性能数据
 */
export function reportPerformance(metrics: PerformanceMetrics) {
  // 这里可以集成第三方分析服务（如 Google Analytics, Sentry 等）
  console.log('Performance Metrics:', metrics);

  if (!isBrowserEnvironment()) {
    return;
  }

  const data = JSON.stringify({
    type: 'performance',
    timestamp: Date.now(),
    metrics,
  });

  if (typeof navigator.sendBeacon === 'function') {
    navigator.sendBeacon(CLIENT_TELEMETRY_ENDPOINT, data);
    return;
  }

  fetch(CLIENT_TELEMETRY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: data,
    keepalive: true,
  }).catch(console.error);
}

/**
 * 初始化性能监控
 */
export function initPerformanceMonitoring() {
  collectWebVitals((metrics) => {
    reportPerformance(metrics);
  });
}
