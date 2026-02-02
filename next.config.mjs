/** @type {import('next').NextConfig} */
const nextConfig = {
  // 启用 standalone 模式，用于 Docker 部署
  output: 'standalone',

  typescript: {
    ignoreBuildErrors: false,
  },

  // Webpack 配置：处理服务器端专用模块
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // 在客户端构建时，排除 Node.js 内置模块
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        http: false,
        https: false,
        zlib: false,
        path: false,
        os: false,
      };
    }
    return config;
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
