/**
 * Cloudflare Worker - GitHub & npm Proxy Accelerator
 *
 * This worker acts as a reverse proxy to accelerate access to GitHub and npm
 * by routing requests and replacing links with mirror services.
 */

// 镜像配置 - 支持多个镜像源和自动切换
const CONFIG = {
  // 镜像映射配置
  MIRRORS: {
    // GitHub 生态
    'github.com': {
      primary: 'gh-proxy.net',
      fallback: ['ghproxy.com', 'mirror.ghproxy.com'],
      type: 'full-url-proxy'  // 需要完整 URL 的代理类型
    },
    'raw.githubusercontent.com': {
      primary: 'raw.gitmirror.com',
      fallback: ['raw.githubusercontent.com'],
      type: 'domain-replace'  // 简单域名替换
    },
    'gist.github.com': {
      primary: 'gist.fastgit.org',
      fallback: []
    },
    'github.githubassets.com': {
      primary: 'github.githubassets.com',
      fallback: []
    },

    // npm 生态
    'www.npmjs.com': {
      primary: 'npmmirror.com',
      fallback: ['npm.taobao.org']
    },
    'npmjs.com': {
      primary: 'npmmirror.com',
      fallback: ['npm.taobao.org']
    },
    'registry.npmjs.org': {
      primary: 'registry.npmmirror.com',
      fallback: ['registry.npm.taobao.org']
    },
    'unpkg.com': {
      primary: 'unpkg.zhimg.com',
      fallback: []
    },

    // Python
    'pypi.org': {
      primary: 'pypi.tuna.tsinghua.edu.cn',
      fallback: ['mirrors.aliyun.com/pypi/web']
    },
    'files.pythonhosted.org': {
      primary: 'pypi.tuna.tsinghua.edu.cn/packages',
      fallback: []
    },

    // Go
    'proxy.golang.org': {
      primary: 'goproxy.cn',
      fallback: ['goproxy.io']
    },
    'golang.org': {
      primary: 'golang.google.cn',
      fallback: []
    },
    'pkg.go.dev': {
      primary: 'pkg.go.dev',
      fallback: []
    },

    // 容器镜像
    'gcr.io': {
      primary: 'gcr.mirrors.ustc.edu.cn',
      fallback: []
    },
    'k8s.gcr.io': {
      primary: 'registry.cn-hangzhou.aliyuncs.com/google_containers',
      fallback: []
    },
    'quay.io': {
      primary: 'quay.mirrors.ustc.edu.cn',
      fallback: []
    },

    // CDN 服务
    'cdn.jsdelivr.net': {
      primary: 'jsd.cdn.zzko.cn',
      fallback: ['fastly.jsdelivr.net']
    },
    'fonts.googleapis.com': {
      primary: 'fonts.googleapis.cn',
      fallback: ['fonts.loli.net']
    },
    'fonts.gstatic.com': {
      primary: 'fonts.gstatic.cn',
      fallback: ['gstatic.loli.net']
    },
    'ajax.googleapis.com': {
      primary: 'ajax.googleapis.cn',
      fallback: ['ajax.loli.net']
    },

    // Maven
    'repo1.maven.org': {
      primary: 'maven.aliyun.com/repository/central',
      fallback: []
    },

    // Ruby
    'rubygems.org': {
      primary: 'gems.ruby-china.com',
      fallback: []
    },

    // Rust
    'crates.io': {
      primary: 'rsproxy.cn',
      fallback: []
    }
  },

  // 可处理的内容类型（仅处理脚本文件）
  PROCESSABLE_CONTENT_TYPES: [
    'text/plain',              // 纯文本脚本
    'text/x-shellscript',      // Shell 脚本
    'application/x-sh',        // Shell 脚本
    'application/x-shellscript', // Shell 脚本
    'application/javascript',  // JavaScript 脚本
    'text/x-python',           // Python 脚本
    'application/x-python-code' // Python 脚本
  ],

  // 缓存配置（秒）
  CACHE_MAX_AGE: 300,

  // 请求超时（毫秒）
  REQUEST_TIMEOUT: 30000,

  // 域名健康检查超时（毫秒）
  HEALTH_CHECK_TIMEOUT: 5000,

  // 域名健康检查缓存时间（秒）
  HEALTH_CHECK_CACHE: 3600,
};

// 域名健康状态缓存（内存缓存，Worker 重启后重置）
const domainHealthCache = new Map();

/**
 * Main event listener for fetch requests
 */
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

/**
 * Handle incoming requests
 * @param {Request} request - The incoming request
 * @returns {Promise<Response>} - The response to send back
 */
async function handleRequest(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Root path - show usage instructions
  if (pathname === '/' || pathname === '') {
    return getUsageResponse();
  }

  // Extract target URL from path (remove leading slash)
  let targetUrl = pathname.substring(1);

  // 支持纯域名格式：如果不以 http:// 或 https:// 开头，则自动添加 https://
  if (targetUrl && !targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  // Validate target URL
  if (!targetUrl) {
    return new Response(
      '请提供有效的目标 URL\n\n用法示例:\n' +
      '  /https://raw.githubusercontent.com/oven-sh/bun/main/src/install.sh\n' +
      '  /raw.githubusercontent.com/oven-sh/bun/main/src/install.sh\n' +
      '  /bun.sh/install',
      {
        status: 400,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }

  try {
    // Validate and parse target URL
    const target = new URL(targetUrl);

    // Security check - prevent proxy loop
    if (isProxyLoop(target, request)) {
      return new Response('检测到代理循环，请求被拒绝', {
        status: 400,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    // Fetch target content
    const response = await fetchWithTimeout(targetUrl, {
      method: request.method,
      headers: getProxyHeaders(request.headers),
      redirect: 'follow'
    });

    if (!response.ok) {
      return new Response(
        `无法获取目标页面: ${response.status} ${response.statusText}`,
        {
          status: response.status,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        }
      );
    }

    // Process response
    return await processResponse(response, target);

  } catch (error) {
    console.error('Error handling request:', error);
    return new Response(
      `错误: ${error.message}`,
      {
        status: 500,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        }
      }
    );
  }
}

/**
 * Process the response from the target server
 * @param {Response} response - The response from target server
 * @param {URL} targetUrl - The target URL object
 * @returns {Promise<Response>} - The processed response
 */
async function processResponse(response, targetUrl) {
  const contentType = response.headers.get('content-type') || '';
  let content;

  // Check if content should be processed for link replacement
  const shouldProcess = CONFIG.PROCESSABLE_CONTENT_TYPES.some(type =>
    contentType.includes(type)
  );

  if (shouldProcess) {
    // Get text content and replace links
    const text = await response.text();
    content = await replaceLinkss(text);
  } else {
    // For binary content (images, downloads, etc.), pass through as-is
    content = response.body;
  }

  // Build response headers
  const headers = new Headers();

  // Copy relevant headers from original response
  const headersToKeep = [
    'content-type',
    'content-encoding',
    'content-language',
    'last-modified',
    'etag'
  ];

  headersToKeep.forEach(header => {
    const value = response.headers.get(header);
    if (value) {
      headers.set(header, value);
    }
  });

  // Add CORS and caching headers
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', '*');
  headers.set('Cache-Control', `public, max-age=${CONFIG.CACHE_MAX_AGE}`);

  // Add custom header to identify proxy
  headers.set('X-Proxy-By', 'sh-proxy');

  return new Response(content, {
    status: response.status,
    statusText: response.statusText,
    headers: headers
  });
}

/**
 * 检查域名健康状态
 * @param {string} domain - 要检查的域名
 * @returns {Promise<boolean>} - 域名是否可访问
 */
async function checkDomainHealth(domain) {
  // 检查缓存
  const cached = domainHealthCache.get(domain);
  if (cached && (Date.now() - cached.timestamp) < CONFIG.HEALTH_CHECK_CACHE * 1000) {
    return cached.healthy;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.HEALTH_CHECK_TIMEOUT);

    const response = await fetch(`https://${domain}`, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    clearTimeout(timeoutId);
    const healthy = response.status < 500;

    // 缓存结果
    domainHealthCache.set(domain, {
      healthy,
      timestamp: Date.now()
    });

    return healthy;
  } catch (error) {
    // 请求失败，认为域名不健康
    domainHealthCache.set(domain, {
      healthy: false,
      timestamp: Date.now()
    });
    return false;
  }
}

/**
 * 获取最佳可用镜像域名
 * @param {string} originalDomain - 原始域名
 * @returns {Promise<string>} - 最佳镜像域名
 */
async function getBestMirror(originalDomain) {
  const config = CONFIG.MIRRORS[originalDomain];
  if (!config) {
    return originalDomain;
  }

  // 首先尝试 primary
  const primaryHealthy = await checkDomainHealth(config.primary);
  if (primaryHealthy) {
    return config.primary;
  }

  // primary 不可用，尝试 fallback
  if (config.fallback && config.fallback.length > 0) {
    for (const fallbackDomain of config.fallback) {
      const fallbackHealthy = await checkDomainHealth(fallbackDomain);
      if (fallbackHealthy) {
        return fallbackDomain;
      }
    }
  }

  // 所有镜像都不可用，返回 primary（让请求继续尝试）
  return config.primary;
}

/**
 * Replace links in content with mirror URLs
 * @param {string} content - The content to process
 * @returns {Promise<string>} - The content with replaced links
 */
async function replaceLinkss(content) {
  let result = content;

  // 遍历所有镜像配置
  for (const [domain, config] of Object.entries(CONFIG.MIRRORS)) {
    // 获取最佳镜像（优先使用 primary，如果不可用则使用 fallback）
    const mirror = await getBestMirror(domain);

    // 获取镜像类型，默认为 domain-replace
    const type = config.type || 'domain-replace';

    if (type === 'full-url-proxy') {
      // 需要完整 URL 的代理类型（如 gh-proxy.net）
      // 格式: https://gh-proxy.net/https://github.com/xxx

      // 替换 https:// 协议
      const httpsRegex = new RegExp(`https://${escapeRegExp(domain)}`, 'g');
      result = result.replace(httpsRegex, `https://${mirror}/https://${domain}`);

      // 替换 http:// 协议
      const httpRegex = new RegExp(`http://${escapeRegExp(domain)}`, 'g');
      result = result.replace(httpRegex, `https://${mirror}/http://${domain}`);
    } else {
      // 简单域名替换类型（默认）
      // 格式: https://raw.gitmirror.com/xxx

      // 替换 https:// 协议
      const httpsRegex = new RegExp(`https://${escapeRegExp(domain)}`, 'g');
      result = result.replace(httpsRegex, `https://${mirror}`);

      // 替换 http:// 协议
      const httpRegex = new RegExp(`http://${escapeRegExp(domain)}`, 'g');
      result = result.replace(httpRegex, `https://${mirror}`);

      // 替换纯域名（不带协议）
      const plainRegex = new RegExp(`(?<!https?://)${escapeRegExp(domain)}`, 'g');
      result = result.replace(plainRegex, mirror);
    }
  }

  return result;
}

/**
 * Escape special characters in string for use in RegExp
 * @param {string} string - The string to escape
 * @returns {string} - Escaped string
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Get headers for proxying request
 * @param {Headers} originalHeaders - Original request headers
 * @returns {Object} - Headers object for fetch
 */
function getProxyHeaders(originalHeaders) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
  };

  // Copy certain headers from original request
  const headersToCopy = ['accept-encoding', 'referer'];
  headersToCopy.forEach(header => {
    const value = originalHeaders.get(header);
    if (value) {
      headers[header] = value;
    }
  });

  return headers;
}

/**
 * Fetch with timeout support
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} - Response promise
 */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('请求超时');
    }
    throw error;
  }
}

/**
 * Check if request would create a proxy loop
 * @param {URL} targetUrl - Target URL
 * @param {Request} request - Current request
 * @returns {boolean} - True if loop detected
 */
function isProxyLoop(targetUrl, request) {
  const requestUrl = new URL(request.url);

  // Check if target is same as current host
  if (targetUrl.hostname === requestUrl.hostname) {
    return true;
  }

  // Check for X-Proxy-By header (from our own proxy)
  if (request.headers.get('X-Proxy-By') === 'sh-proxy') {
    return true;
  }

  return false;
}

/**
 * Get usage instructions response
 * @returns {Response} - Response with usage instructions
 */
function getUsageResponse() {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SH Proxy - 脚本镜像加速代理</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #333;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 800px;
            width: 100%;
            padding: 40px;
        }
        h1 {
            color: #667eea;
            margin-bottom: 10px;
            font-size: 2.5em;
        }
        .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 1.1em;
        }
        .section {
            margin: 30px 0;
        }
        h2 {
            color: #444;
            margin-bottom: 15px;
            font-size: 1.5em;
            border-left: 4px solid #667eea;
            padding-left: 12px;
        }
        .usage {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            margin: 15px 0;
        }
        code {
            background: #2d2d2d;
            color: #f8f8f2;
            padding: 2px 8px;
            border-radius: 4px;
            font-family: 'Courier New', monospace;
            font-size: 0.9em;
        }
        .example {
            margin: 10px 0;
            padding: 12px;
            background: #e9ecef;
            border-radius: 6px;
        }
        .example-title {
            font-weight: bold;
            color: #667eea;
            margin-bottom: 8px;
        }
        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 20px;
        }
        .feature {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 8px;
            border-left: 3px solid #667eea;
        }
        .feature-title {
            font-weight: bold;
            color: #667eea;
            margin-bottom: 5px;
        }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px solid #e9ecef;
            text-align: center;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 SH Proxy</h1>
        <div class="subtitle">脚本镜像加速代理服务</div>

        <div class="section">
            <h2>📖 使用方法</h2>
            <div class="usage">
                <p>在您的域名后添加 <code>/</code> 和目标 URL（支持纯域名格式）：</p>
                <div class="example">
                    <div class="example-title">完整 URL 格式：</div>
                    <code>https://your-worker.dev/https://raw.githubusercontent.com/user/repo/main/install.sh</code>
                </div>
                <div class="example">
                    <div class="example-title">纯域名格式（推荐）：</div>
                    <code>https://your-worker.dev/raw.githubusercontent.com/user/repo/main/install.sh</code>
                </div>
            </div>
        </div>

        <div class="section">
            <h2>💡 示例</h2>
            <div class="example">
                <div class="example-title">代理 Bun 安装脚本：</div>
                <code>curl -fsSL https://your-worker.dev/bun.sh/install | bash</code>
            </div>
            <div class="example">
                <div class="example-title">代理 GitHub Raw 文件：</div>
                <code>https://your-worker.dev/raw.githubusercontent.com/user/repo/main/script.sh</code>
            </div>
            <div class="example">
                <div class="example-title">使用完整 URL：</div>
                <code>https://your-worker.dev/https://example.com/install.py</code>
            </div>
        </div>

        <div class="section">
            <h2>✨ 功能特性</h2>
            <div class="features">
                <div class="feature">
                    <div class="feature-title">📝 脚本专用</div>
                    <div>只处理脚本文件，不加速页面和二进制文件</div>
                </div>
                <div class="feature">
                    <div class="feature-title">🔗 智能替换</div>
                    <div>自动替换脚本中的镜像域名链接</div>
                </div>
                <div class="feature">
                    <div class="feature-title">⚡ 边缘加速</div>
                    <div>利用 Cloudflare 全球网络加速访问</div>
                </div>
                <div class="feature">
                    <div class="feature-title">🔄 自动切换</div>
                    <div>镜像不可用时自动切换到备用域名</div>
                </div>
            </div>
        </div>

        <div class="section">
            <h2>🛠️ 支持的脚本类型</h2>
            <div class="usage">
                <p>本服务专门处理以下脚本文件：</p>
                <ul style="margin-left: 20px; margin-top: 10px; line-height: 1.8;">
                    <li>Shell 脚本 (.sh)</li>
                    <li>Python 脚本 (.py)</li>
                    <li>JavaScript 脚本 (.js)</li>
                    <li>其他纯文本安装脚本</li>
                </ul>
                <p style="margin-top: 10px; color: #666; font-size: 0.9em;">
                    注意：不处理 HTML 页面、图片等非脚本文件
                </p>
            </div>
        </div>

        <div class="footer">
            Powered by Cloudflare Workers | Built with ❤️
        </div>
    </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
