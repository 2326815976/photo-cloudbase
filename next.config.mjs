/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    // 使用Vercel Image Optimization进行图片压缩
    // 免费版：1000张图片/月
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
