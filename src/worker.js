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
    // DockerHub 官方镜像仓库
    'docker.io': {
      primary: 'dockerproxy.net',
      fallback: [
        'docker.1ms.run',
        'docker.1panel.live',
        'hub.rat.dev',
        'docker.xuanyuan.me',
        'dockerproxy.cool',
        'docker.hlmirror.com',
        'hub.amingg.com',
        'docker.amingg.com',
        'docker-registry.nmqu.com',
        'docker.apiba.cn',
        'docker.367231.xyz',
        'hub.1panel.dev',
        'proxy.vvvv.ee',
        'docker.m.ixdev.cn',
        'hub1.nat.tf',
        'hub2.nat.tf',
        'hub3.nat.tf',
        'hub4.nat.tf'
      ]
    },
    'registry-1.docker.io': {
      primary: 'dockerproxy.net',
      fallback: [
        'docker.1ms.run',
        'docker.1panel.live',
        'hub.rat.dev',
        'docker.xuanyuan.me',
        'dockerproxy.cool',
        'docker.hlmirror.com',
        'hub.amingg.com',
        'docker.apiba.cn'
      ]
    },
    'index.docker.io': {
      primary: 'dockerproxy.net',
      fallback: [
        'docker.1ms.run',
        'docker.1panel.live',
        'dockerproxy.cool',
        'docker.hlmirror.com'
      ]
    },
    'registry.hub.docker.com': {
      primary: 'dockerproxy.net',
      fallback: [
        'docker.1ms.run',
        'dockerproxy.cool'
      ]
    },
    // 其他容器镜像源
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
    },

    // Dokploy
    'dokploy.com': {
      primary: 'dokploy.com',
      fallback: [],
      type: 'domain-replace'
    },


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


};



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
    return getUsageResponse(request);
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

    // 替换 URL 中的域名为镜像域名
    let currentUrl = targetUrl;
    let redirectCount = 0;
    const maxRedirects = 10;

    while (redirectCount < maxRedirects) {
      const mirroredUrl = replaceUrlWithMirror(currentUrl);

      // Fetch target content with manual redirect handling
      const response = await fetchWithTimeout(mirroredUrl, {
        method: request.method,
        headers: getProxyHeaders(request.headers, currentUrl),
        redirect: 'manual'
      });

      // 检查是否是 HTTP 重定向
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location) {
          // 解析重定向目标 URL
          const redirectTarget = resolveUrl(location, new URL(currentUrl));
          console.log(`HTTP 重定向: ${currentUrl} -> ${redirectTarget}`);
          currentUrl = redirectTarget;
          redirectCount++;
          continue;
        }
      }

      // 不是重定向，检查响应状态
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
      return await processResponse(response, new URL(currentUrl));
    }

    // 重定向次数过多
    return new Response(
      '重定向次数过多',
      {
        status: 310,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      }
    );

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
    content = replaceLinkss(text);

    // Special handling for Dokploy install script
    if (targetUrl.hostname.includes('dokploy.com') && targetUrl.pathname.includes('install.sh')) {
      content = optimizeDokployScript(content);
    }
  } else if (contentType.includes('text/html')) {
    // 处理 HTML 响应，检查是否包含跳转逻辑
    const html = await response.text();
    const redirectUrl = await handleHtmlRedirect(html, targetUrl);

    if (redirectUrl) {
      // 如果检测到跳转，递归获取真正的脚本内容
      console.log(`检测到 HTML 跳转: ${targetUrl.href} -> ${redirectUrl}`);

      try {
        // 将跳转 URL 也通过镜像来访问，并禁用自动重定向
        let currentUrl = redirectUrl;
        let redirectCount = 0;
        const maxRedirects = 5;

        while (redirectCount < maxRedirects) {
          const mirroredUrl = replaceUrlWithMirror(currentUrl);
          console.log(`尝试获取: ${currentUrl} -> ${mirroredUrl}`);

          const redirectResponse = await fetchWithTimeout(mirroredUrl, {
            headers: getProxyHeaders(new Headers(), currentUrl),
            redirect: 'manual' // 禁用自动重定向
          });

          // 检查是否是重定向响应
          if (redirectResponse.status >= 300 && redirectResponse.status < 400) {
            const location = redirectResponse.headers.get('location');
            if (location) {
              // 解析重定向目标 URL
              currentUrl = resolveUrl(location, new URL(currentUrl));
              console.log(`检测到 HTTP 重定向: ${location} -> ${currentUrl}`);
              redirectCount++;
              continue;
            }
          }

          // 不是重定向或没有 location，处理响应
          if (redirectResponse.ok) {
            return await processResponse(redirectResponse, new URL(currentUrl));
          } else {
            console.error(`请求失败: ${redirectResponse.status}`);
            break;
          }
        }

        if (redirectCount >= maxRedirects) {
          console.error('重定向次数过多');
        }
      } catch (error) {
        console.error('跳转请求失败:', error);
        // 跳转失败时返回原始 HTML
      }
    }

    // 如果没有跳转或跳转失败，返回原始 HTML
    content = html;
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
 * 替换请求 URL 中的域名为镜像域名
 * @param {string} targetUrl - 目标 URL
 * @returns {Promise<string>} - 替换后的 URL
 */
function replaceUrlWithMirror(targetUrl) {
  try {
    const url = new URL(targetUrl);
    const domain = url.hostname;

    // 检查是否有镜像配置
    const config = CONFIG.MIRRORS[domain];
    if (!config) {
      return targetUrl;
    }

    // 获取镜像域名（由 CI 保证可用性）
    const mirror = getBestMirror(domain);

    // 获取镜像类型，默认为 domain-replace
    const type = config.type || 'domain-replace';

    if (type === 'full-url-proxy') {
      // 完整 URL 代理模式：https://gh-proxy.net/https://github.com/...
      return `https://${mirror}/${targetUrl}`;
    } else {
      // 域名替换模式：直接替换域名
      url.hostname = mirror;
      return url.toString();
    }
  } catch (error) {
    // URL 解析失败，返回原始 URL
    return targetUrl;
  }
}

/**
 * 获取最佳可用镜像域名
 * @param {string} originalDomain - 原始域名
 * @returns {Promise<string>} - 最佳镜像域名
 */
function getBestMirror(originalDomain) {
  const config = CONFIG.MIRRORS[originalDomain];
  if (!config) {
    return originalDomain;
  }

  // 直接返回 primary 镜像，由 CI 保证其可用性
  return config.primary;
}

/**
 * Handle HTML redirect logic
 * @param {string} html - HTML content
 * @param {URL} baseUrl - Base URL for resolving relative URLs
 * @returns {Promise<string|null>} - Redirect URL or null if no redirect found
 */
async function handleHtmlRedirect(html, baseUrl) {
  try {
    // 检查 meta refresh 跳转
    const metaRefreshMatch = html.match(/<meta[^>]*http-equiv=["']refresh["'][^>]*content=["'](\d+);?\s*url=([^"']+)["'][^>]*>/i);
    if (metaRefreshMatch) {
      const redirectUrl = metaRefreshMatch[2];
      return resolveUrl(redirectUrl, baseUrl);
    }

    // 检查 JavaScript 跳转逻辑
    const jsRedirectPatterns = [
      // window.location.href = "url"
      /window\.location\.href\s*=\s*["'`]([^"'`]+)["'`]/i,
      // window.location = "url"
      /window\.location\s*=\s*["'`]([^"'`]+)["'`]/i,
      // location.href = "url"
      /location\.href\s*=\s*["'`]([^"'`]+)["'`]/i,
      // 模板字符串跳转: `${targetLang}.html`
      /window\.location\.href\s*=\s*`([^`]+)`/i,
    ];

    for (const pattern of jsRedirectPatterns) {
      const match = html.match(pattern);
      if (match) {
        let redirectUrl = match[1];

        // 处理模板字符串中的变量替换
        if (redirectUrl.includes('${')) {
          redirectUrl = await evaluateJsRedirect(html, baseUrl);
          if (redirectUrl) {
            return redirectUrl;
          }
        } else {
          return resolveUrl(redirectUrl, baseUrl);
        }
      }
    }

    // 检查特定的跳转逻辑（如 bench.sh 的语言检测）
    if (html.includes('targetLang') && html.includes('.html')) {
      // 模拟浏览器语言检测，默认使用中文
      const targetLang = 'zh'; // 可以根据 Accept-Language 头部动态设置
      const redirectUrl = `${targetLang}.html`;
      return resolveUrl(redirectUrl, baseUrl);
    }

    return null;
  } catch (error) {
    console.error('解析 HTML 跳转失败:', error);
    return null;
  }
}

/**
 * Evaluate JavaScript redirect logic
 * @param {string} html - HTML content with JavaScript
 * @param {URL} baseUrl - Base URL
 * @returns {Promise<string|null>} - Evaluated redirect URL
 */
async function evaluateJsRedirect(html, baseUrl) {
  try {
    // 提取 JavaScript 代码
    const scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    if (!scriptMatch) return null;

    const scriptContent = scriptMatch[1];

    // 模拟浏览器环境变量
    const mockNavigator = {
      language: 'zh-CN',
      userLanguage: 'zh-CN'
    };

    // 简单的 JavaScript 执行模拟
    // 检查语言检测逻辑
    if (scriptContent.includes('browserLang') && scriptContent.includes('targetLang')) {
      let targetLang = 'en'; // 默认英文

      // 模拟语言匹配逻辑
      const browserLang = mockNavigator.language || mockNavigator.userLanguage;
      if (/^ja/.test(browserLang)) {
        targetLang = 'ja';
      } else if (/^zh/.test(browserLang)) {
        targetLang = 'zh';
      }

      // 构建跳转 URL
      const redirectUrl = `${targetLang}.html`;
      return resolveUrl(redirectUrl, baseUrl);
    }

    return null;
  } catch (error) {
    console.error('执行 JavaScript 跳转逻辑失败:', error);
    return null;
  }
}

/**
 * Resolve relative URL against base URL
 * @param {string} url - URL to resolve
 * @param {URL} baseUrl - Base URL
 * @returns {string} - Resolved absolute URL
 */
function resolveUrl(url, baseUrl) {
  try {
    // 如果已经是绝对 URL，直接返回
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    // 解析相对 URL
    const resolved = new URL(url, baseUrl.href);
    return resolved.href;
  } catch (error) {
    console.error('解析 URL 失败:', error);
    return url;
  }
}

/**
 * Replace links in content with mirror URLs
 * @param {string} content - The content to process
 * @returns {Promise<string>} - The content with replaced links
 */
function replaceLinkss(content) {
  let result = content;

  // 遍历所有镜像配置
  for (const [domain, config] of Object.entries(CONFIG.MIRRORS)) {
    // 获取镜像域名（由 CI 保证可用性）
    const mirror = getBestMirror(domain);

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
/**
 * Get headers for proxy requests
 * @param {Headers} originalHeaders - Original request headers
 * @param {string} targetUrl - Target URL being requested
 * @returns {Object} - Headers object for the proxy request
 */
function getProxyHeaders(originalHeaders, targetUrl = '') {
  // 对于脚本文件，使用 curl UA 以触发正确的服务器响应
  // 某些脚本托管服务（如 bench.sh）会根据 UA 返回不同内容：
  // - 浏览器 UA -> HTML 页面
  // - curl/wget UA -> 重定向到真正的脚本
  const isScriptFile = /\.(sh|bash|py|rb|pl)$/.test(targetUrl);

  const headers = {
    'User-Agent': isScriptFile
      ? 'curl/8.0.0'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
 * Optimize Dokploy installation script for China environment
 * @param {string} scriptContent - Original script content
 * @returns {string} - Optimized script content
 */
function optimizeDokployScript(scriptContent) {
  // Extract versions from original script to ensure compatibility
  // Fallback to known versions if regex fails (though unlikely for official script)
  const postgresImage = (scriptContent.match(/postgres:[\w.-]+/) || ['postgres:16'])[0];
  const redisImage = (scriptContent.match(/redis:[\w.-]+/) || ['redis:7'])[0];
  const traefikImage = (scriptContent.match(/traefik:[\w.-]+/) || ['traefik:v3.6.1'])[0]; // Default from recent check

  const optimizationLogic = `
# --- Dokploy Optimization Start ---
echo "Configuring Docker mirrors for China..."
if [ ! -d "/etc/docker" ]; then mkdir -p /etc/docker; fi
if [ -f "/etc/docker/daemon.json" ]; then cp /etc/docker/daemon.json /etc/docker/daemon.json.bak; fi
cat > /etc/docker/daemon.json <<EOF
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "100m" },
  "registry-mirrors": [
    "https://docker.m.daocloud.io",
    "https://docker.1panel.live",
    "https://hub.rat.dev"
  ]
}
EOF
if command -v docker >/dev/null 2>&1; then systemctl daemon-reload && systemctl restart docker; fi

# Function to pull from mirror and retag
pull_and_tag() {
    MIRROR_PREFIX="swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io"
    FULL_IMAGE=$1
    echo "Pulling $FULL_IMAGE from mirror..."
    docker pull $MIRROR_PREFIX/$FULL_IMAGE
    docker tag $MIRROR_PREFIX/$FULL_IMAGE $FULL_IMAGE
}

echo "Pre-pulling images..."
pull_and_tag "${postgresImage}"
pull_and_tag "${redisImage}"
pull_and_tag "${traefikImage}"
# Pull dokploy image defined in script variable
if [ -n "$DOCKER_IMAGE" ]; then
    pull_and_tag "$DOCKER_IMAGE"
fi
# --- Dokploy Optimization End ---
`;

  let optimized = scriptContent;

  // 1. Inject optimization logic AFTER DOCKER_IMAGE is defined so we can use it
  // Look for: DOCKER_IMAGE="dokploy/dokploy:${VERSION_TAG}"
  const imageVarDef = 'DOCKER_IMAGE="dokploy/dokploy:${VERSION_TAG}"';
  if (optimized.includes(imageVarDef)) {
    optimized = optimized.replace(imageVarDef, `${imageVarDef}\n${optimizationLogic}`);
  } else {
    // Fallback: inject at start of function if pattern not found (matches old logic but less safe for variable)
    optimized = optimized.replace('install_dokploy() {', `install_dokploy() {\n${optimizationLogic}`);
  }

  // 2. Replace docker install with Aliyun mirror version
  optimized = optimized.replace(
    'curl -sSL https://get.docker.com | sh -s -- --version 28.5.0',
    'curl -fsSL https://get.docker.com | bash -s docker --mirror Aliyun --version 28.5.0'
  );

  return optimized;
}

/**
 * Get usage instructions response
 * @param {Request} request - The incoming request
 * @returns {Response} - Response with usage instructions
 */
/**
 * Get usage instructions response
 * @param {Request} request - The incoming request
 * @returns {Response} - Response with usage instructions
 */
function getUsageResponse(request) {
  // Get current domain from request
  const requestUrl = new URL(request.url);
  const currentDomain = requestUrl.host;

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SH Proxy - 全球脚本镜像加速服务</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #4F46E5;
            --primary-dark: #4338ca;
            --surface: #ffffff;
            --background: #f3f4f6;
            --text-main: #111827;
            --text-secondary: #6b7280;
            --border: #e5e7eb;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            background-color: var(--background);
            color: var(--text-main);
            line-height: 1.5;
            -webkit-font-smoothing: antialiased;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
            padding: 40px 20px;
        }
        .header {
            text-align: center;
            margin-bottom: 60px;
            padding: 40px 0;
            background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);
            border-radius: 24px;
            color: white;
            box-shadow: 0 10px 25px -5px rgba(79, 70, 229, 0.4);
        }
        .header h1 {
            font-size: 3rem;
            font-weight: 800;
            margin-bottom: 16px;
            letter-spacing: -0.025em;
        }
        .header p {
            font-size: 1.25rem;
            color: rgba(255, 255, 255, 0.9);
            max-width: 600px;
            margin: 0 auto;
        }
        
        .card {
            background: var(--surface);
            border-radius: 16px;
            padding: 32px;
            margin-bottom: 32px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            border: 1px solid var(--border);
        }
        .card-header {
            display: flex;
            align-items: center;
            margin-bottom: 24px;
        }
        .card-title {
            font-size: 1.5rem;
            font-weight: 700;
            color: var(--text-main);
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .icon {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            background: #EEF2FF;
            color: var(--primary);
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .code-block {
            background: #1F2937;
            border-radius: 12px;
            padding: 20px;
            margin: 16px 0;
            position: relative;
            group: relative;
        }
        .code-block code {
            font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
            color: #E5E7EB;
            font-size: 0.95rem;
            display: block;
            overflow-x: auto;
            white-space: pre-wrap;
            word-break: break-all;
            padding-right: 40px;
        }
        .copy-btn {
            position: absolute;
            top: 12px;
            right: 12px;
            background: rgba(255, 255, 255, 0.1);
            border: none;
            color: #fff;
            padding: 6px 10px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.8rem;
            transition: all 0.2s;
            opacity: 0;
        }
        .code-block:hover .copy-btn {
            opacity: 1;
        }
        .copy-btn:hover {
            background: rgba(255, 255, 255, 0.2);
        }
        .label {
            font-size: 0.875rem;
            font-weight: 600;
            color: var(--text-secondary);
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 24px;
        }
        .feature-item {
            padding: 24px;
            background: #F9FAFB;
            border-radius: 12px;
            border: 1px solid var(--border);
        }
        .feature-title {
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--text-main);
        }
        .feature-desc {
            color: var(--text-secondary);
            font-size: 0.95rem;
        }

        .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 9999px;
            font-size: 0.8rem;
            font-weight: 600;
            margin-left: 12px;
        }
        .badge-new {
            background: #DCFCE7;
            color: #166534;
        }

        .domains-list {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            margin-top: 16px;
        }
        .domain-tag {
            background: #EEF2FF;
            color: var(--primary);
            padding: 6px 16px;
            border-radius: 8px;
            font-size: 0.9rem;
            font-weight: 500;
        }
        
        footer {
            text-align: center;
            margin-top: 60px;
            color: var(--text-secondary);
            font-size: 0.9rem;
        }
        footer a {
            color: var(--primary);
            text-decoration: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <header class="header">
            <h1>SH Proxy</h1>
            <p>为开发者打造的全球脚本镜像加速服务</p>
        </header>

        <!-- 🚀 快速开始 -->
        <div class="card">
            <div class="card-header">
                <div class="icon">
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                </div>
                <h2 class="card-title">快速开始</h2>
            </div>
            
            <div style="margin-bottom: 24px;">
                <div class="label">通用用法</div>
                <div class="code-block">
                    <code>https://${currentDomain}/<span style="color:#60A5FA">target.com/script.sh</span></code>
                    <button class="copy-btn" onclick="copyText(this)">复制</button>
                </div>
            </div>

            <div class="label">🔥 热门加速示例</div>
            
            <!-- Dokploy Example -->
            <div style="margin-top: 20px;">
                <div class="label" style="columns: #4F46E5;">Dokploy安装 (国内优化版) <span class="badge badge-new">New</span></div>
                <div class="code-block" style="border: 1px solid #4F46E5;">
                    <code>curl -fsSL https://${currentDomain}/dokploy.com/install.sh | sh</code>
                    <button class="copy-btn" onclick="copyText(this)">复制</button>
                </div>
                <p style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 8px;">
                    ✨ 自动配置国内 Docker 镜像源，并使用华为云代理预拉取核心镜像，大幅提升安装成功率。
                </p>
            </div>

            <div style="margin-top: 24px;">
                <div class="label">其他常用脚本</div>
                <div class="code-block">
                    <code># NVM (Node Version Manager)
curl -fsSL https://${currentDomain}/raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Bun
curl -fsSL https://${currentDomain}/bun.sh/install | bash

# GitHub Raw File
wget https://${currentDomain}/raw.githubusercontent.com/user/repo/main/file.sh</code>
                    <button class="copy-btn" onclick="copyText(this)">复制</button>
                </div>
            </div>
        </div>

        <!-- 🛡️ 支持的域名 -->
        <div class="card">
            <div class="card-header">
                <div class="icon">
                    <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                </div>
                <h2 class="card-title">支持的服务</h2>
            </div>
            <p style="color: var(--text-secondary)">我们会自动为以下域名请求选择最佳的国内镜像节点：</p>
            <div class="domains-list">
                <span class="domain-tag">github.com</span>
                <span class="domain-tag">raw.githubusercontent.com</span>
                <span class="domain-tag">dokploy.com</span>
                <span class="domain-tag">docker.io</span>
                <span class="domain-tag">npmjs.com</span>
                <span class="domain-tag">pypi.org</span>
                <span class="domain-tag">golang.org</span>
                <span class="domain-tag">crates.io</span>
            </div>
        </div>

        <!-- ✨ 特性 -->
        <div class="grid">
            <div class="feature-item">
                <div class="feature-title">⚡️ 智能加速</div>
                <div class="feature-desc">自动识别目标域名，动态路由到最快的国内镜像源（如 DaoCloud, SJTU, Aliyun 等）。</div>
            </div>
            <div class="feature-item">
                <div class="feature-title">🛡️ 内容优化</div>
                <div class="feature-desc">针对安装脚本（如 Dokploy），自动注入国内环境适配逻辑，解决网络卡死问题。</div>
            </div>
            <div class="feature-item">
                <div class="feature-title">🔄 失败自动切换</div>
                <div class="feature-desc">内置多个备用镜像源，当主源不可用时毫秒级自动切换，保证高可用性。</div>
            </div>
        </div>

        <footer>
            <p>SH Proxy is an open source project.</p>
            <p style="margin-top: 8px;">
                <a href="https://github.com/orgs/sh-proxy" target="_blank">View on GitHub</a>
            </p>
        </footer>
    </div>

    <script>
        function copyText(btn) {
            const codeBlock = btn.previousElementSibling;
            let text = codeBlock.innerText;
            
            // Remove any prompt annotations if present
            text = text.replace(/^[$%]\s+/gm, '');
            
            navigator.clipboard.writeText(text).then(() => {
                const originalText = btn.innerText;
                btn.innerText = '已复制!';
                btn.style.background = '#10B981';
                setTimeout(() => {
                    btn.innerText = originalText;
                    btn.style.background = '';
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy:', err);
            });
        }
    </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}