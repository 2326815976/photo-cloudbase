const isWindows = process.platform === 'win32';

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',

  // standalone 模式在 Windows 下容易因 symlink 导致 EPERM，因此仅在非 Windows 环境启用
  ...(isWindows ? {} : { output: 'standalone' }),

  async headers() {
    return [
      {
        source: '/fonts/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, HEAD, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: '*',
          },
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'cross-origin',
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

  // 配置 API 路由请求体大小限制，支持较大文件上传
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },

  // Webpack 配置：处理仅服务端可用的模块
  webpack: (config, { isServer, dev }) => {
    if (!isServer) {
      // 客户端构建时排除 Node.js 内置模块
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

    // 生产环境移除 console 日志
    if (!dev) {
      config.optimization.minimizer = config.optimization.minimizer || [];

      // 复用 Next.js 内置的 Terser 配置
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
    // CloudBase 云存储常见域名，包含默认域名与自定义域名
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.tcb.qcloud.la',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.cloud.tcb-service.com',
        pathname: '/**',
      },
    ],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    formats: ['image/webp'],
  },
};

export default nextConfig;
