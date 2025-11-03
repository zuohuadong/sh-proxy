# SH Proxy

🚀 基于 Cloudflare Workers 的 GitHub 和 npm 加速代理服务

## 简介

SH Proxy 是一个运行在 Cloudflare Workers 上的轻量级代理服务，用于加速访问 GitHub 和 npm 等国际服务。利用 Cloudflare 的全球边缘网络，为用户提供快速、稳定的访问体验。

## 功能特性

- ✅ **GitHub 加速**：代理 GitHub 仓库、Release、Raw 文件等
- ✅ **npm 镜像**：自动将 npm 链接替换为国内镜像
- ✅ **智能链接替换**：自动替换页面中的相关链接
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
main = "src/index.js"
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

在您的 Worker 域名后添加 `/` 和目标 URL：

```
https://your-worker.workers.dev/https://目标网址
```

### 示例

1. **代理 GitHub 仓库**

```
https://your-worker.workers.dev/https://github.com/microsoft/vscode
```

2. **下载 GitHub Release**

```
https://your-worker.workers.dev/https://github.com/user/repo/releases/download/v1.0.0/file.zip
```

3. **访问 npm 包**

```
https://your-worker.workers.dev/https://www.npmjs.com/package/react
```

4. **获取 GitHub Raw 文件**

```
https://your-worker.workers.dev/https://raw.githubusercontent.com/user/repo/main/README.md
```

## 配置说明

### src/index.js 配置项

```javascript
const CONFIG = {
  // 代理映射配置
  PROXY_MAPPINGS: {
    github: {
      original: 'https://github.com',
      proxy: 'https://gh-proxy.net/github.com'
    },
    npm: {
      original: /https?:\/\/(www\.)?npmjs\.com/g,
      mirror: 'https://npmmirror.com'
    }
  },

  // 可处理的内容类型
  PROCESSABLE_CONTENT_TYPES: [
    'text/html',
    'text/plain',
    'text/css',
    'application/javascript',
    'application/json'
  ],

  // 缓存时间（秒）
  CACHE_MAX_AGE: 300,

  // 请求超时时间（毫秒）
  REQUEST_TIMEOUT: 30000,
};
```

您可以根据需要修改这些配置项。

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
│   └── index.js          # Worker 主程序
├── .gitignore            # Git 忽略文件
├── package.json          # 项目依赖配置
├── wrangler.toml         # Wrangler 配置
└── README.md            # 项目文档
```

## 工作原理

1. **接收请求**：Worker 接收用户的代理请求
2. **解析 URL**：从路径中提取目标 URL
3. **安全检查**：验证 URL 合法性，检测代理循环
4. **获取内容**：从目标服务器获取内容
5. **链接替换**：替换内容中的相关链接
6. **返回响应**：返回处理后的内容给用户

## 性能优化

- **边缘缓存**：利用 Cloudflare CDN 缓存静态内容
- **智能处理**：只对文本类内容进行链接替换
- **超时控制**：避免长时间等待
- **请求头优化**：模拟真实浏览器请求

## 注意事项

1. **合规使用**：请遵守目标网站的使用条款和相关法律法规
2. **流量限制**：Cloudflare Workers 免费版有每日请求限制
3. **内容类型**：某些二进制文件可能需要特殊处理
4. **缓存策略**：根据实际需求调整缓存时间

## 故障排除

### 部署失败

- 检查 Cloudflare 账号是否正确配置
- 确认 wrangler 已正确登录：`wrangler whoami`

### 代理无法访问

- 检查目标 URL 是否正确
- 查看 Worker 日志：`npm run tail`
- 确认目标网站没有封禁 Cloudflare IP

### 性能问题

- 调整 `CACHE_MAX_AGE` 增加缓存时间
- 使用自定义域名而非 workers.dev
- 考虑升级到 Cloudflare Workers 付费版

## 开发

### 添加新的代理规则

在 `src/index.js` 的 `CONFIG.PROXY_MAPPINGS` 中添加新的映射：

```javascript
PROXY_MAPPINGS: {
  // 现有配置...

  newService: {
    original: 'https://example.com',
    proxy: 'https://mirror.example.com'
  }
}
```

然后在 `replaceLinkss()` 函数中添加替换逻辑。

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
