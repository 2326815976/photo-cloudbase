/** @type {import('next').NextConfig} */
const nextConfig = {
  // 启用 standalone 模式，用于 Docker 部署
  output: 'standalone',

  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    // 添加腾讯云COS域名支持
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'oyezfcipxbgdkizvndil.supabase.co',
        pathname: '/storage/v1/**',
      },
      {
        protocol: 'https',
        hostname: 'photo-1386452208.cos.ap-guangzhou.myqcloud.com',
        pathname: '/**',
      },
    ],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    formats: ['image/webp'],
  },
}

export default nextConfig
