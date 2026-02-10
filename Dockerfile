# ========== 腾讯云云托管优化版 Dockerfile ==========
# 使用多阶段构建 + standalone 模式，大幅减小镜像体积

# ========== 阶段1: 依赖安装 ==========
FROM node:20-alpine AS deps
WORKDIR /app

# 复制依赖文件
COPY package.json package-lock.json ./

# 安装所有依赖（包括 devDependencies，构建时需要）
RUN npm ci

# ========== 阶段2: 构建应用 ==========
FROM node:20-alpine AS builder
WORKDIR /app

# 复制依赖
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 构建时环境变量（占位符，必须通过云托管构建参数传入真实值）
# ⚠️ 重要：NEXT_PUBLIC_* 变量会被编译进客户端代码，必须在构建时传入真实值
ARG NEXT_PUBLIC_APP_URL=https://build-placeholder-app-url.com
ARG NEXT_PUBLIC_SUPABASE_URL=https://build-placeholder.supabase.co
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=build-placeholder-supabase-key
ARG NEXT_PUBLIC_AMAP_KEY=build-placeholder-amap-key
ARG NEXT_PUBLIC_AMAP_SECURITY_CODE=build-placeholder-amap-security
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=build-placeholder-turnstile-key

ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_AMAP_KEY=$NEXT_PUBLIC_AMAP_KEY
ENV NEXT_PUBLIC_AMAP_SECURITY_CODE=$NEXT_PUBLIC_AMAP_SECURITY_CODE
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY

# 构建应用（standalone 模式）
RUN npm run build

# ========== 阶段3: 生产运行 ==========
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 复制 standalone 输出（包含精简的 node_modules）
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# 复制启动脚本
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# 设置文件权限（确保 nextjs 用户可以修改 .next/static）
RUN chown -R nextjs:nodejs /app && chmod -R u+w /app/.next/static
USER nextjs

# 使用 3000 端口（非 root 用户无法监听 80 端口）
# 腾讯云云托管会自动将外部流量映射到此端口
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
EXPOSE 3000

# 使用启动脚本替换占位符后启动应用
CMD ["./docker-entrypoint.sh"]
