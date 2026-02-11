// Service Worker - 优化Android端性能
const CACHE_VERSION = 'slogan-v2';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const FONT_CACHE = `${CACHE_VERSION}-fonts`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;

const NAVIGATION_PATHS = ['/', '/gallery', '/album', '/booking', '/profile', '/login', '/register', '/signup'];
const IMAGE_CACHE_LIMIT = 80;
const STATIC_CACHE_LIMIT = 200;

// 字体文件预缓存列表
const FONT_ASSETS = [
  '/fonts/ZQKNNY-Medium-2.woff2',
  '/fonts/ZQKNNY-Medium-2.ttf',
  '/fonts/AaZhuNiWoMingMeiXiangChunTian-2.woff2',
];

// 静态资源预缓存列表
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/Slogan_108x108.png',
  '/Slogan_512x512.png',
];

// 安装阶段：预缓存字体和静态资源
self.addEventListener('install', (event) => {
  console.log('[SW] 安装中...');
  event.waitUntil(
    Promise.all([
      caches.open(FONT_CACHE).then((cache) => cache.addAll(FONT_ASSETS)),
      caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)),
      caches.open(PAGE_CACHE).then((cache) => cache.add('/')),
    ]).then(() => {
      console.log('[SW] 字体和静态资源预缓存完成');
      return self.skipWaiting();
    })
  );
});

// 激活阶段：清理旧缓存
self.addEventListener('activate', (event) => {
  console.log('[SW] 激活中...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('slogan-') && !name.startsWith(CACHE_VERSION))
          .map((name) => {
            console.log('[SW] 删除旧缓存:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 请求拦截：实施缓存策略
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  // 只处理GET请求
  if (request.method !== 'GET') return;

  // 仅处理 http / https
  if (!url.protocol.startsWith('http')) return;

  // 策略0：页面导航请求 - 网络优先 + 缓存后备
  if (request.mode === 'navigate' && isSameOrigin) {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response && response.ok && shouldCacheNavigation(url.pathname)) {
            const cache = await caches.open(PAGE_CACHE);
            cache.put(request, response.clone());
          }
          return response;
        } catch (error) {
          const cachedPage = await caches.match(request);
          if (cachedPage) {
            return cachedPage;
          }

          const homePage = await caches.match('/');
          if (homePage) {
            return homePage;
          }

          return new Response('离线状态，页面不可用', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
      })()
    );
    return;
  }

  // 策略1：字体文件 - 缓存优先
  if (isSameOrigin && url.pathname.startsWith('/fonts/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          console.log('[SW] 字体缓存命中:', url.pathname);
          return cached;
        }
        return fetch(request).then((response) => {
          return caches.open(FONT_CACHE).then((cache) => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            console.log('[SW] 字体已缓存:', url.pathname);
            return response;
          });
        });
      })
    );
    return;
  }

  // 策略2：COS CDN图片 - 缓存优先，限制数量
  if (url.hostname.includes('cos.ap-guangzhou.myqcloud.com')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          console.log('[SW] 图片缓存命中:', url.pathname);
          return cached;
        }
        return fetch(request).then((response) => {
          return caches.open(IMAGE_CACHE).then((cache) => {
            // 限制图片缓存数量
            cache.keys().then((keys) => {
              if (keys.length >= IMAGE_CACHE_LIMIT) {
                cache.delete(keys[0]); // 删除最旧的
              }
            });
            if (response.ok) {
              cache.put(request, response.clone());
            }
            console.log('[SW] 图片已缓存:', url.pathname);
            return response;
          });
        });
      })
    );
    return;
  }

  // 策略3：同源静态资源（JS/CSS/图标等）- 缓存优先
  if (isSameOrigin && (url.pathname.startsWith('/_next/static/') || url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff2|woff|ttf)$/))) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          console.log('[SW] 静态资源缓存命中:', url.pathname);
          return cached;
        }
        return fetch(request).then((response) => {
          return caches.open(STATIC_CACHE).then((cache) => {
            cache.keys().then((keys) => {
              if (keys.length >= STATIC_CACHE_LIMIT) {
                cache.delete(keys[0]);
              }
            });
            if (response.ok) {
              cache.put(request, response.clone());
            }
            console.log('[SW] 静态资源已缓存:', url.pathname);
            return response;
          });
        });
      })
    );
    return;
  }

  // 策略4：API请求 - 网络优先，缓存作为后备
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            if (cached) {
              console.log('[SW] API缓存命中（离线）:', url.pathname);
              return cached;
            }
            return new Response('离线状态，无法访问API', { status: 503 });
          });
        })
    );
    return;
  }

  // 策略5：其他请求 - 网络优先 + 缓存后备
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (isSameOrigin && response.ok) {
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, response.clone());
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cached) => {
          if (cached) {
            console.log('[SW] 缓存命中（离线）:', url.pathname);
            return cached;
          }

          return caches.open(DYNAMIC_CACHE).then((cache) => {
            return cache.match(request).then((dynamicCached) => {
              if (dynamicCached) {
                return dynamicCached;
              }
              return new Response('离线状态，资源不可用', { status: 503 });
            });
          });
        });
      })
  );
});

function shouldCacheNavigation(pathname) {
  return NAVIGATION_PATHS.some((route) => {
    if (route === '/') {
      return pathname === '/';
    }
    return pathname === route || pathname.startsWith(`${route}/`);
  });
}
