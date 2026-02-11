'use client';

import { useEffect } from 'react';

const FONT_CACHE_NAME = 'slogan-font-assets-v1';

type FontEntry = {
  url: string;
  family: string;
  descriptors?: FontFaceDescriptors;
};

const FONT_ENTRIES: FontEntry[] = [
  {
    url: '/fonts/ZQKNNY-Medium-2.woff2',
    family: 'ZQKNNY-Local',
    descriptors: { weight: '500', style: 'normal', display: 'swap' },
  },
  {
    url: '/fonts/AaZhuNiWoMingMeiXiangChunTian-2.woff2',
    family: 'Letter Font Local',
    descriptors: { weight: '400', style: 'normal', display: 'swap' },
  },
];

async function getFontResponse(cache: Cache, url: string): Promise<Response | null> {
  const cached = await cache.match(url);
  if (cached) {
    return cached;
  }

  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) {
    return null;
  }

  await cache.put(url, response.clone());
  return response;
}

export default function FontCacheBootstrap() {
  useEffect(() => {
    let canceled = false;

    const bootstrapFonts = async () => {
      if (!('caches' in window) || !('FontFace' in window) || !document.fonts) {
        return;
      }

      try {
        const cache = await caches.open(FONT_CACHE_NAME);

        const tasks = FONT_ENTRIES.map(async (entry) => {
          const response = await getFontResponse(cache, entry.url);
          if (!response || canceled) {
            return;
          }

          const blob = await response.blob();
          const blobUrl = URL.createObjectURL(blob);

          try {
            const fontFace = new FontFace(
              entry.family,
              `url(${blobUrl}) format('woff2')`,
              entry.descriptors
            );

            await fontFace.load();
            if (!canceled) {
              document.fonts.add(fontFace);
            }
          } finally {
            URL.revokeObjectURL(blobUrl);
          }
        });

        await Promise.allSettled(tasks);
      } catch {
        // Ignore font cache bootstrap failure
      }
    };

    void bootstrapFonts();

    return () => {
      canceled = true;
    };
  }, []);

  return null;
}
