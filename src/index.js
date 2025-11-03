/**
 * Cloudflare Worker - GitHub & npm Proxy Accelerator
 *
 * This worker acts as a reverse proxy to accelerate access to GitHub and npm
 * by routing requests and replacing links with mirror services.
 */

// Configuration
const CONFIG = {
  // Proxy mappings for different services
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

  // Content types that should be processed for link replacement
  PROCESSABLE_CONTENT_TYPES: [
    'text/html',
    'text/plain',
    'text/css',
    'application/javascript',
    'application/json'
  ],

  // Cache configuration
  CACHE_MAX_AGE: 300, // 5 minutes

  // Request timeout
  REQUEST_TIMEOUT: 30000, // 30 seconds
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
 * @returns {Response} - The response to send back
 */
async function handleRequest(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Root path - show usage instructions
  if (pathname === '/' || pathname === '') {
    return getUsageResponse();
  }

  // Extract target URL from path (remove leading slash)
  const targetUrl = pathname.substring(1);

  // Validate target URL
  if (!targetUrl || !targetUrl.startsWith('http')) {
    return new Response(
      '请提供有效的目标 URL\n\n用法示例:\n' +
      '  /' + 'https://github.com/user/repo\n' +
      '  /' + 'https://www.npmjs.com/package/name',
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
 * @returns {Response} - The processed response
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
 * Replace links in content with proxy/mirror URLs
 * @param {string} content - The content to process
 * @returns {string} - The content with replaced links
 */
function replaceLinkss(content) {
  let result = content;

  // Replace GitHub links
  result = result.replace(
    /https:\/\/github\.com/g,
    CONFIG.PROXY_MAPPINGS.github.proxy
  );

  // Replace npm links (https and http)
  result = result.replace(
    /https:\/\/(www\.)?npmjs\.com/g,
    CONFIG.PROXY_MAPPINGS.npm.mirror
  );

  result = result.replace(
    /http:\/\/(www\.)?npmjs\.com/g,
    CONFIG.PROXY_MAPPINGS.npm.mirror
  );

  // Replace plain domain references (without protocol)
  // Use lookbehind to avoid replacing already processed URLs
  result = result.replace(
    /(?<!https?:\/\/)(www\.)?npmjs\.com/g,
    'npmmirror.com'
  );

  return result;
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
    <title>SH Proxy - GitHub & npm 加速代理</title>
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
        <div class="subtitle">GitHub & npm 加速代理服务</div>

        <div class="section">
            <h2>📖 使用方法</h2>
            <div class="usage">
                <p>在您的域名后添加 <code>/</code> 和目标 URL：</p>
                <div class="example">
                    <div class="example-title">格式：</div>
                    <code>https://your-worker.dev/https://目标网址</code>
                </div>
            </div>
        </div>

        <div class="section">
            <h2>💡 示例</h2>
            <div class="example">
                <div class="example-title">代理 GitHub 仓库：</div>
                <code>https://your-worker.dev/https://github.com/user/repo</code>
            </div>
            <div class="example">
                <div class="example-title">代理 npm 包页面：</div>
                <code>https://your-worker.dev/https://www.npmjs.com/package/react</code>
            </div>
        </div>

        <div class="section">
            <h2>✨ 功能特性</h2>
            <div class="features">
                <div class="feature">
                    <div class="feature-title">🔗 链接替换</div>
                    <div>自动替换页面中的 GitHub 和 npm 链接</div>
                </div>
                <div class="feature">
                    <div class="feature-title">⚡ 边缘加速</div>
                    <div>利用 Cloudflare 全球网络加速访问</div>
                </div>
                <div class="feature">
                    <div class="feature-title">🔒 CORS 支持</div>
                    <div>完整的跨域资源共享支持</div>
                </div>
                <div class="feature">
                    <div class="feature-title">📦 智能缓存</div>
                    <div>自动缓存内容提升访问速度</div>
                </div>
            </div>
        </div>

        <div class="section">
            <h2>🛠️ 技术支持</h2>
            <div class="usage">
                <p>本服务支持代理以下内容：</p>
                <ul style="margin-left: 20px; margin-top: 10px; line-height: 1.8;">
                    <li>GitHub 仓库、Release、Raw 文件</li>
                    <li>npm 包页面和文档</li>
                    <li>自动链接转换和镜像加速</li>
                </ul>
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
