#!/bin/sh
set -e

echo "🚀 Starting application with environment variable substitution..."

# 替换 .next/static 中的占位符
if [ -d ".next/static" ]; then
  echo "📝 Replacing placeholders in static files..."

  # 查找所有 JS 文件并替换占位符
  find .next/static -type f -name "*.js" -exec sed -i \
    -e "s|https://build-placeholder.supabase.co|${NEXT_PUBLIC_SUPABASE_URL}|g" \
    -e "s|build-placeholder-supabase-key|${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}|g" \
    -e "s|https://build-placeholder-app-url.com|${NEXT_PUBLIC_APP_URL}|g" \
    -e "s|build-placeholder-amap-key|${NEXT_PUBLIC_AMAP_KEY}|g" \
    -e "s|build-placeholder-amap-security|${NEXT_PUBLIC_AMAP_SECURITY_CODE}|g" \
    -e "s|build-placeholder-turnstile-key|${NEXT_PUBLIC_TURNSTILE_SITE_KEY}|g" \
    {} +

  echo "✅ Placeholder replacement completed"
else
  echo "⚠️  .next/static directory not found, skipping replacement"
fi

# 启动 Next.js 应用
echo "🎉 Starting Next.js server..."
exec node server.js
