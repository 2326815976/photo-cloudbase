// Service Worker - 优化Android端性能
const CACHE_VERSION = 'slogan-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const FONT_CACHE = `${CACHE_VERSION}-fonts`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

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

// 请求拦截：实施缓存策略
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 只处理GET请求
  if (request.method !== 'GET') return;

  // 策略1：字体文件 - 缓存优先
  if (url.pathname.startsWith('/fonts/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          console.log('[SW] 字体缓存命中:', url.pathname);
          return cached;
        }
        return fetch(request).then((response) => {
          return caches.open(FONT_CACHE).then((cache) => {
            cache.put(request, response.clone());
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
            // 限制图片缓存数量为50张
            cache.keys().then((keys) => {
              if (keys.length >= 50) {
                cache.delete(keys[0]); // 删除最旧的
              }
            });
            cache.put(request, response.clone());
            console.log('[SW] 图片已缓存:', url.pathname);
            return response;
          });
        });
      })
    );
    return;
  }

  // 策略3：静态资源（JS, CSS, 图标等）- 缓存优先
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|ico|woff2|woff|ttf)$/)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          console.log('[SW] 静态资源缓存命中:', url.pathname);
          return cached;
        }
        return fetch(request).then((response) => {
          return caches.open(STATIC_CACHE).then((cache) => {
            cache.put(request, response.clone());
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

  // 策略5：其他请求 - 网络优先
  event.respondWith(
    fetch(request).catch(() => {
      return caches.match(request).then((cached) => {
        if (cached) {
          console.log('[SW] 缓存命中（离线）:', url.pathname);
          return cached;
        }
        return new Response('离线状态，资源不可用', { status: 503 });
      });
    })
  );
});
