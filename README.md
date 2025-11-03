# SH Proxy

🚀 基于 Cloudflare Workers 的脚本镜像加速代理服务

## 简介

SH Proxy 是一个运行在 Cloudflare Workers 上的轻量级代理服务，专门用于加速各种安装脚本的访问。本服务**只处理脚本文件**，自动替换脚本中的镜像链接，确保安装过程流畅无阻。利用 Cloudflare 的全球边缘网络，为用户提供快速、稳定的访问体验。

## 功能特性

- ✅ **纯域名格式支持**：支持 `bun.sh/install` 等简洁格式，无需输入完整 URL
- ✅ **脚本专用处理**：只处理 Shell、Python、JavaScript 等脚本文件
- ✅ **智能镜像替换**：自动将脚本中的链接替换为可用镜像源
- ✅ **自动故障切换**：主镜像不可用时自动切换到备用镜像
- ✅ **域名健康检查**：实时检测镜像域名可用性
- ✅ **CI 自动监控**：每周自动检测镜像域名是否被墙
- ✅ **边缘加速**：利用 Cloudflare 全球 CDN 网络
- ✅ **CORS 支持**：完整的跨域资源共享支持
- ✅ **智能缓存**：自动缓存内容，提升访问速度
- ⏱️ **超时控制**：防止长时间等待
- ✅ **循环检测**：防止代理循环

## 快速开始

### 前置要求

- Node.js 16.x 或更高版本
- Cloudflare 账号
- Wrangler CLI 工具

### 安装

1. **克隆项目**

```bash
git clone <your-repo-url>
cd sh-proxy
```

2. **安装依赖**

```bash
npm install
```

3. **配置 Wrangler**

编辑 `wrangler.toml` 文件，配置您的 Cloudflare 账号信息：

```toml
name = "sh-proxy"
main = "src/worker.js"
compatibility_date = "2024-01-01"

# 如果需要绑定自定义域名
[env.production]
routes = [
  "proxy.yourdomain.com/*"
]
```

### 本地开发

启动本地开发服务器：

```bash
npm run dev
```

访问 `http://localhost:8787` 查看服务是否正常运行。

### 部署

部署到 Cloudflare Workers：

```bash
npm run deploy
```

部署成功后，您将获得一个 `*.workers.dev` 域名。

## 使用方法

### 基本用法

本服务支持两种 URL 格式：

#### 1. 纯域名格式（推荐）

直接使用域名和路径，无需添加协议前缀：

```bash
https://your-worker.workers.dev/域名/路径
```

#### 2. 完整 URL 格式

使用完整的 URL（包含 https://）：

```bash
https://your-worker.workers.dev/https://目标网址
```

### 实际示例

#### Shell 脚本代理

**1. 代理 Bun 安装脚本**

```bash
# 纯域名格式（推荐）
curl -fsSL https://your-worker.workers.dev/bun.sh/install | bash

# 完整 URL 格式
curl -fsSL https://your-worker.workers.dev/https://bun.sh/install | bash
```

**2. 代理 GitHub Raw 文件**

```bash
# 纯域名格式
curl -fsSL https://your-worker.workers.dev/raw.githubusercontent.com/user/repo/main/install.sh | bash

# 完整 URL 格式
curl -fsSL https://your-worker.workers.dev/https://raw.githubusercontent.com/user/repo/main/install.sh | bash
```

**3. 下载并执行脚本**

```bash
# 使用 wget
wget -qO- https://your-worker.workers.dev/example.com/setup.sh | sh

# 使用 curl
curl -sSL https://your-worker.workers.dev/get.docker.com | sh
```

#### Python 脚本代理

```bash
# 代理 Python 安装脚本
curl -fsSL https://your-worker.workers.dev/pyenv.run | bash

# 或者使用 wget
wget -qO- https://your-worker.workers.dev/get.poetry.io | python3 -
```

### 支持的脚本类型

本服务专门处理以下类型的脚本文件：

- ✅ Shell 脚本 (`.sh`, `text/x-shellscript`)
- ✅ Python 脚本 (`.py`, `text/x-python`)
- ✅ JavaScript 脚本 (`.js`, `application/javascript`)
- ✅ 纯文本脚本 (`text/plain`)

**注意**：本服务不处理以下内容：
- ❌ HTML 页面
- ❌ 图片、视频等二进制文件
- ❌ CSS 样式文件
- ❌ JSON/XML 数据文件

## 配置说明

### 镜像域名配置 (src/worker.js)

配置文件中的 `MIRRORS` 对象定义了所有镜像域名的映射关系：

```javascript
const CONFIG = {
  MIRRORS: {
    // 原始域名
    'github.com': {
      primary: 'gh-proxy.net',           // 主镜像
      fallback: ['ghproxy.com', 'mirror.ghproxy.com']  // 备用镜像列表
    },
    'www.npmjs.com': {
      primary: 'npmmirror.com',
      fallback: ['npm.taobao.org']
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
```

### 配置项说明

- **primary**: 优先使用的主镜像域名
- **fallback**: 备用镜像域名列表，当主镜像不可用时依次尝试
- **HEALTH_CHECK_TIMEOUT**: 健康检查的超时时间，默认 5 秒
- **HEALTH_CHECK_CACHE**: 健康检查结果缓存时间，默认 1 小时

您可以根据实际情况添加或修改镜像配置。

## 高级用法

### 绑定自定义域名

1. 在 Cloudflare 中添加您的域名
2. 编辑 `wrangler.toml`：

```toml
[env.production]
name = "sh-proxy"
routes = [
  "proxy.yourdomain.com/*"
]
```

3. 部署：

```bash
npm run deploy --env production
```

### 查看日志

实时查看 Worker 日志：

```bash
npm run tail
```

## 项目结构

```
sh-proxy/
├── src/
│   └── worker.js            # Worker 主程序
├── .github/
│   └── workflows/
│       └── domain-health-check.yml  # 域名健康检查 CI
├── .gitignore              # Git 忽略文件
├── package.json            # 项目依赖配置
├── wrangler.toml           # Wrangler 配置
└── README.md              # 项目文档
```

## 工作原理

1. **接收请求**：Worker 接收用户的代理请求
2. **URL 解析**：支持纯域名格式和完整 URL 格式，自动添加 https:// 前缀
3. **安全检查**：验证 URL 合法性，检测代理循环
4. **获取内容**：从目标服务器获取脚本文件
5. **内容过滤**：只处理脚本类型的文件（Shell、Python、JavaScript 等）
6. **智能替换**：检测镜像域名健康状态，选择最佳镜像进行链接替换
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

### CI 自动监控

项目配置了 GitHub Actions 工作流，实现自动化域名监控：

- **检测频率**：每周一自动运行（也可手动触发）
- **检测工具**：使用 https://mc.fybk.cc/ys/ys2/doc-ck_qiang.html 检测域名是否被墙
- **自动通知**：发现被墙域名时自动创建 GitHub Issue
- **详细报告**：列出所有被墙和可用的域名，便于及时调整配置

要手动触发检测，可以在 GitHub Actions 页面点击 "Run workflow"。

## 性能优化

- **边缘缓存**：利用 Cloudflare CDN 缓存静态内容
- **智能处理**：只对文本类内容进行链接替换
- **超时控制**：避免长时间等待
- **请求头优化**：模拟真实浏览器请求

## 注意事项

1. **使用场景**：本服务专门用于加速脚本安装过程，不适合作为通用代理
2. **文件类型限制**：只处理脚本文件，不处理 HTML 页面、图片等其他类型
3. **合规使用**：请遵守目标网站的使用条款和相关法律法规
4. **流量限制**：Cloudflare Workers 免费版有每日请求限制
5. **安全提醒**：从互联网下载并执行脚本前，请先检查脚本内容
6. **缓存策略**：根据实际需求调整缓存时间

## 故障排除

### 部署失败

- 检查 Cloudflare 账号是否正确配置
- 确认 wrangler 已正确登录：`wrangler whoami`

### 代理无法访问

- 检查目标 URL 格式是否正确（支持纯域名和完整 URL）
- 查看 Worker 日志：`npm run tail`
- 确认目标网站没有封禁 Cloudflare IP

### 脚本未被处理

- 确认文件的 Content-Type 是否为脚本类型
- 查看响应头中的 `Content-Type`，确保在支持列表中
- 非脚本文件会被直接透传，不会进行链接替换

### 性能问题

- 调整 `CACHE_MAX_AGE` 增加缓存时间
- 使用自定义域名而非 workers.dev
- 考虑升级到 Cloudflare Workers 付费版

## 开发

### 添加新的镜像配置

在 `src/worker.js` 的 `CONFIG.MIRRORS` 中添加新的镜像映射：

```javascript
MIRRORS: {
  // 现有配置...

  // 添加新的镜像配置
  'example.com': {
    primary: 'mirror1.example.com',      // 主镜像
    fallback: ['mirror2.example.com', 'mirror3.example.com']  // 备用镜像
  }
}
```

镜像配置会自动生效，系统会：
1. 优先使用 `primary` 镜像
2. 如果 `primary` 不可用，依次尝试 `fallback` 中的镜像
3. 健康检查结果会缓存 1 小时

### 监控域名健康状态

1. **自动监控**：GitHub Actions 会每周一自动检测所有配置的镜像域名
2. **手动触发**：
   - 访问仓库的 Actions 页面
   - 选择 "域名健康检查" workflow
   - 点击 "Run workflow" 按钮
3. **查看结果**：如果发现被墙域名，会自动创建 Issue 通知

### 修改检测频率

编辑 `.github/workflows/domain-health-check.yml` 中的 cron 表达式：

```yaml
schedule:
  # 每周一凌晨 2 点运行（UTC 时间）
  - cron: '0 2 * * 1'
```

常用的 cron 表达式：
- 每天运行：`0 2 * * *`
- 每周运行：`0 2 * * 1`（周一）
- 每月运行：`0 2 1 * *`（每月 1 号）

### 修改可处理的内容类型

编辑 `CONFIG.PROCESSABLE_CONTENT_TYPES` 数组：

```javascript
PROCESSABLE_CONTENT_TYPES: [
  'text/html',
  'text/plain',
  'application/xml',  // 添加新类型
]
```

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License

## 相关资源

- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [Wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/)
- [Cloudflare Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)

## 致谢

感谢 Cloudflare 提供的强大边缘计算平台。
