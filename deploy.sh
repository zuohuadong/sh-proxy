#!/bin/bash

# Cloudflare Workers 部署脚本
# 使用环境变量中的 API Token 进行部署

# 检查 .env 文件是否存在
if [ ! -f .env ]; then
    echo "❌ 错误: .env 文件不存在"
    echo "请复制 .env.example 为 .env 并填入你的配置"
    exit 1
fi

# 加载环境变量
export $(cat .env | grep -v '^#' | xargs)

# 检查必需的环境变量
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    echo "❌ 错误: CLOUDFLARE_API_TOKEN 未设置"
    exit 1
fi

echo "🚀 开始部署 Cloudflare Worker..."

# 安装依赖（如果需要）
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
fi

# 部署到生产环境
echo "📤 部署到生产环境..."
npx wrangler deploy --env production

if [ $? -eq 0 ]; then
    echo "✅ 部署成功！"
else
    echo "❌ 部署失败"
    exit 1
fi
