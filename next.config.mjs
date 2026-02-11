/** @type {import('next').NextConfig} */
const nextConfig = {
  // 保持 standalone 模式，支持 API 路由和服务器部署
  output: 'standalone',

  async headers() {
    return [
      {
        source: '/fonts/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
    ];
  },

  typescript: {
    ignoreBuildErrors: false,
  },

  // 配置API路由的请求体大小限制（支持大文件上传）
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },

  // Webpack 配置：处理服务器端专用模块
  webpack: (config, { isServer, dev }) => {
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

    // 生产环境移除console日志
    if (!dev) {
      config.optimization.minimizer = config.optimization.minimizer || [];

      // 使用 Next.js 内置的 Terser 配置
      const existingTerser = config.optimization.minimizer.find(
        (plugin) => plugin.constructor.name === 'TerserPlugin'
      );

      if (existingTerser && existingTerser.options) {
        existingTerser.options.terserOptions = {
          ...existingTerser.options.terserOptions,
          compress: {
            ...existingTerser.options.terserOptions?.compress,
            drop_console: true,
          },
        };
      }
    }

    return config;
  },

  images: {
    // 腾讯云COS域名配置
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'slogan-1386452208.cos.ap-guangzhou.myqcloud.com',
        pathname: '/**',
      },
    ],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    formats: ['image/webp'],
  },
}

export default nextConfig
