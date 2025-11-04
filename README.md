# SH Proxy

🚀 基于 Cloudflare Workers 的脚本镜像加速代理服务

[![Deploy to Cloudflare Workers](https://img.shields.io/badge/Deploy%20to-Cloudflare%20Workers-F38020?logo=cloudflare)](https://sh-proxy.nestjs.workers.dev)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

**在线演示：** https://sh-proxy.nestjs.workers.dev

## 简介

SH Proxy 是一个运行在 Cloudflare Workers 上的轻量级代理服务，专门用于加速各种安装脚本的访问。本服务**只处理脚本文件**，自动替换脚本中的镜像链接，确保安装过程流畅无阻。利用 Cloudflare 的全球边缘网络，为用户提供快速、稳定的访问体验。

## 功能特性

- ✅ **纯域名格式支持**：支持 \`bun.sh/install\` 等简洁格式，无需输入完整 URL
- ✅ **脚本专用处理**：只处理 Shell、Python、JavaScript 等脚本文件
- ✅ **双模式代理**：支持完整 URL 代理和域名替换两种模式
  - \`full-url-proxy\`：适用于 gh-proxy.net 等需要完整 URL 的代理服务
  - \`domain-replace\`：适用于直接域名替换的镜像服务
- ✅ **智能镜像替换**：自动将脚本中的链接替换为可用镜像源
- ✅ **自动故障切换**：主镜像不可用时自动切换到备用镜像
- ✅ **域名健康检查**：实时检测镜像域名可用性
- ✅ **边缘加速**：利用 Cloudflare 全球 CDN 网络
- ✅ **CORS 支持**：完整的跨域资源共享支持
- ✅ **智能缓存**：自动缓存内容，提升访问速度
- ⏱️ **超时控制**：防止长时间等待
- ✅ **循环检测**：防止代理循环

## 快速开始

### 前置要求

- **Node.js 20.x 或更高版本** （Wrangler 要求）
- Cloudflare 账号
- Wrangler CLI 工具

### 安装

1. **克隆项目**

\`\`\`bash
git clone https://github.com/zuohuadong/sh-proxy.git
cd sh-proxy
\`\`\`

2. **安装依赖**

\`\`\`bash
npm install
\`\`\`

3. **配置 Wrangler**

编辑 \`wrangler.toml\` 文件，配置您的 Cloudflare 账号信息：

\`\`\`toml
name = "sh-proxy"
main = "src/worker.js"
compatibility_date = "2024-01-01"

# 如果需要绑定自定义域名
[env.production]
routes = [
  "proxy.yourdomain.com/*"
]
\`\`\`

### 本地开发

启动本地开发服务器：

\`\`\`bash
npm run dev
\`\`\`

访问 \`http://localhost:8787\` 查看服务是否正常运行。

### 部署

部署到 Cloudflare Workers：

\`\`\`bash
npm run deploy
\`\`\`

部署成功后，您将获得一个 \`*.workers.dev\` 域名。

## 使用方法

### 基本用法

本服务支持两种 URL 格式：

#### 1. 纯域名格式（推荐）

直接使用域名和路径，无需添加协议前缀：

\`\`\`bash
https://sh-proxy.nestjs.workers.dev/域名/路径
\`\`\`

#### 2. 完整 URL 格式

使用完整的 URL（包含 https://）：

\`\`\`bash
https://sh-proxy.nestjs.workers.dev/https://目标网址
\`\`\`

### 实际示例

#### Shell 脚本代理

**1. 代理 NVM 安装脚本**

\`\`\`bash
# 加速安装 NVM (Node Version Manager)
curl -fsSL https://sh-proxy.nestjs.workers.dev/raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash

# 或使用完整 URL 格式
curl -fsSL https://sh-proxy.nestjs.workers.dev/https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
\`\`\`

**2. 代理 Bun 安装脚本**

\`\`\`bash
# 纯域名格式（推荐）
curl -fsSL https://sh-proxy.nestjs.workers.dev/bun.sh/install | bash

# 完整 URL 格式
curl -fsSL https://sh-proxy.nestjs.workers.dev/https://bun.sh/install | bash
\`\`\`

**3. 代理 GitHub Raw 文件**

\`\`\`bash
# 纯域名格式
curl -fsSL https://sh-proxy.nestjs.workers.dev/raw.githubusercontent.com/user/repo/main/install.sh | bash

# 完整 URL 格式
curl -fsSL https://sh-proxy.nestjs.workers.dev/https://raw.githubusercontent.com/user/repo/main/install.sh | bash
\`\`\`

**4. 代理 GitHub 下载文件（自动使用 gh-proxy.net）**

\`\`\`bash
# 下载 GitHub Releases 文件
# 脚本中的 github.com 链接会自动转换为 gh-proxy.net 完整 URL 代理
curl -fsSL https://sh-proxy.nestjs.workers.dev/https://github.com/oven-sh/bun/releases/latest/download/bun-linux-x64.zip -o bun.zip

# 实际代理后的 URL 格式：https://gh-proxy.net/https://github.com/oven-sh/bun/releases/...
\`\`\`

**5. 下载并执行脚本**

\`\`\`bash
# 使用 wget
wget -qO- https://sh-proxy.nestjs.workers.dev/example.com/setup.sh | sh

# 使用 curl
curl -sSL https://sh-proxy.nestjs.workers.dev/get.docker.com | sh
\`\`\`

#### Python 脚本代理

\`\`\`bash
# 代理 Python 安装脚本
curl -fsSL https://sh-proxy.nestjs.workers.dev/pyenv.run | bash

# 或者使用 wget
wget -qO- https://sh-proxy.nestjs.workers.dev/get.poetry.io | python3 -
\`\`\`

### 支持的脚本类型

本服务专门处理以下类型的脚本文件：

- ✅ Shell 脚本 (\`.sh\`, \`text/x-shellscript\`)
- ✅ Python 脚本 (\`.py\`, \`text/x-python\`)
- ✅ JavaScript 脚本 (\`.js\`, \`application/javascript\`)
- ✅ 纯文本脚本 (\`text/plain\`)

**注意**：本服务不处理以下内容：
- ❌ HTML 页面
- ❌ 图片、视频等二进制文件
- ❌ CSS 样式文件
- ❌ JSON/XML 数据文件

## 配置说明

### 镜像域名配置 (src/worker.js)

配置文件中的 \`MIRRORS\` 对象定义了所有镜像域名的映射关系，支持两种代理类型：

\`\`\`javascript
const CONFIG = {
  MIRRORS: {
    // 完整 URL 代理类型（适用于 gh-proxy.net 等服务）
    'github.com': {
      primary: 'gh-proxy.net',
      fallback: ['ghproxy.com', 'mirror.ghproxy.com'],
      type: 'full-url-proxy'  // 完整 URL 代理
    },

    // 域名替换类型（适用于直接镜像服务）
    'raw.githubusercontent.com': {
      primary: 'raw.gitmirror.com',
      fallback: ['raw.githubusercontent.com'],
      type: 'domain-replace'  // 简单域名替换
    },

    'www.npmjs.com': {
      primary: 'npmmirror.com',
      fallback: ['npm.taobao.org']
      // 不指定 type 时，默认为 domain-replace
    },
    // ... 更多镜像配置
  },

  // 可处理的内容类型（仅处理脚本文件）
  PROCESSABLE_CONTENT_TYPES: [
    'text/plain',              // 纯文本脚本
    'text/x-shellscript',      // Shell 脚本
    'application/x-sh',        // Shell 脚本
    'application/javascript',  // JavaScript 脚本
    'text/x-python',           // Python 脚本
  ],

  // 缓存时间（秒）
  CACHE_MAX_AGE: 300,

  // 请求超时时间（毫秒）
  REQUEST_TIMEOUT: 30000,

  // 域名健康检查超时（毫秒）
  HEALTH_CHECK_TIMEOUT: 5000,

  // 域名健康检查结果缓存时间（秒）
  HEALTH_CHECK_CACHE: 3600,
};
\`\`\`

### 代理类型说明

#### 1. full-url-proxy（完整 URL 代理）

用于需要完整原始 URL 的代理服务，如 gh-proxy.net。

**原始链接：**
\`\`\`
https://github.com/oven-sh/bun/releases/latest/download/bun-linux-x64.zip
\`\`\`

**转换后：**
\`\`\`
https://gh-proxy.net/https://github.com/oven-sh/bun/releases/latest/download/bun-linux-x64.zip
\`\`\`

#### 2. domain-replace（域名替换，默认）

用于直接替换域名的镜像服务，如 raw.gitmirror.com。

**原始链接：**
\`\`\`
https://raw.githubusercontent.com/user/repo/main/file.sh
\`\`\`

**转换后：**
\`\`\`
https://raw.gitmirror.com/user/repo/main/file.sh
\`\`\`

### 配置项说明

- **primary**: 优先使用的主镜像域名
- **fallback**: 备用镜像域名列表，当主镜像不可用时依次尝试
- **type**: 代理类型，可选值：
  - \`full-url-proxy\`：完整 URL 代理模式
  - \`domain-replace\`：域名替换模式（默认）
- **HEALTH_CHECK_TIMEOUT**: 健康检查的超时时间，默认 5 秒
- **HEALTH_CHECK_CACHE**: 健康检查结果缓存时间，默认 1 小时

您可以根据实际情况添加或修改镜像配置。

## 工作原理

1. **接收请求**：Worker 接收用户的代理请求
2. **URL 解析**：支持纯域名格式和完整 URL 格式，自动添加 https:// 前缀
3. **安全检查**：验证 URL 合法性，检测代理循环
4. **获取内容**：从目标服务器获取脚本文件
5. **内容过滤**：只处理脚本类型的文件（Shell、Python、JavaScript 等）
6. **智能替换**：检测镜像域名健康状态，根据代理类型选择最佳镜像进行链接替换
   - **full-url-proxy**: 生成完整 URL 代理格式（如 \`https://gh-proxy.net/https://github.com/...\`）
   - **domain-replace**: 直接替换域名（如 \`https://raw.gitmirror.com/...\`）
7. **返回响应**：返回处理后的脚本内容给用户

### 脚本专用处理

本项目专注于脚本文件的加速，具有以下特点：

1. **白名单机制**：只处理明确的脚本内容类型
2. **透明传输**：对于非脚本文件（如图片、页面），直接透传不做处理
3. **性能优化**：避免对大型二进制文件进行不必要的文本处理
4. **安全可控**：减少潜在的内容篡改风险

### 智能镜像切换机制

本项目实现了智能的镜像域名切换机制：

1. **健康检查**：自动检测镜像域名的可用性
2. **优先级选择**：优先使用配置的主镜像（primary）
3. **自动降级**：主镜像不可用时，自动切换到备用镜像（fallback）
4. **结果缓存**：健康检查结果会缓存 1 小时，避免频繁检测
5. **双模式支持**：根据配置的 type 自动选择代理模式

## 故障排除

### 部署失败

- **检查 Node.js 版本**：确保使用 Node.js 20.x 或更高版本
- 检查 Cloudflare 账号是否正确配置
- 确认 wrangler 已正确登录：\`wrangler whoami\`

### 代理无法访问

- 检查目标 URL 格式是否正确（支持纯域名和完整 URL）
- 查看 Worker 日志：\`npm run tail\`
- 确认目标网站没有封禁 Cloudflare IP

### 脚本未被处理

- 确认文件的 Content-Type 是否为脚本类型
- 查看响应头中的 \`Content-Type\`，确保在支持列表中
- 非脚本文件会被直接透传，不会进行链接替换

### 性能问题

- 调整 \`CACHE_MAX_AGE\` 增加缓存时间
- 使用自定义域名而非 workers.dev
- 考虑升级到 Cloudflare Workers 付费版

## 开发

### 添加新的镜像配置

在 \`src/worker.js\` 的 \`CONFIG.MIRRORS\` 中添加新的镜像映射：

\`\`\`javascript
MIRRORS: {
  // 现有配置...

  // 添加新的完整 URL 代理
  'example.com': {
    primary: 'proxy.example.net',
    fallback: ['proxy2.example.net'],
    type: 'full-url-proxy'  // 完整 URL 代理模式
  },

  // 添加新的域名替换镜像
  'another.com': {
    primary: 'mirror.another.com',
    fallback: ['mirror2.another.com'],
    type: 'domain-replace'  // 或不指定，默认为 domain-replace
  }
}
\`\`\`

镜像配置会自动生效，系统会：
1. 优先使用 \`primary\` 镜像
2. 如果 \`primary\` 不可用，依次尝试 \`fallback\` 中的镜像
3. 根据 \`type\` 选择合适的代理模式
4. 健康检查结果会缓存 1 小时

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

Apache License 2.0

## 相关资源

- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [Wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/)
- [Cloudflare Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)
- [GitHub 仓库](https://github.com/zuohuadong/sh-proxy)

## 致谢

感谢 Cloudflare 提供的强大边缘计算平台。
