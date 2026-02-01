/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    // 使用自定义 loader，绕过 Vercel Image Optimization
    // 直接使用 Supabase Storage 的图片转换功能
    loader: 'custom',
    loaderFile: './lib/supabase/image-loader.ts',

    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'oyezfcipxbgdkizvndil.supabase.co',
        pathname: '/storage/v1/**',
      },
    ],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    formats: ['image/webp'],
  },
}

export default nextConfig
