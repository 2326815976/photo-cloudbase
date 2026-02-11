# ========== 腾讯云云托管优化版 Dockerfile ==========
# 使用多阶段构建 + standalone 模式,大幅减小镜像体积

# ========== 阶段1: 依赖安装 ==========
FROM node:20-alpine AS deps
RUN npm install -g pnpm
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ========== 阶段2: 构建应用 ==========
FROM node:20-alpine AS builder
RUN npm install -g pnpm
WORKDIR /app

# 复制依赖
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 构建应用（standalone 模式）
# 注意：NEXT_PUBLIC_ 变量通过运行时配置注入（见 app/layout.tsx）
# 不需要在构建时提供这些变量
RUN pnpm build

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

# 设置文件权限
RUN chown -R nextjs:nodejs /app
USER nextjs

# 使用 3000 端口（非 root 用户无法监听 80 端口）
# 腾讯云云托管会自动将外部流量映射到此端口
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
EXPOSE 3000

# 启动应用（standalone 模式使用 server.js）
CMD ["node", "server.js"]
