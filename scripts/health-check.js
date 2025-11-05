#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const { URL } = require('url');

// 健康检查超时时间（毫秒）
const HEALTH_CHECK_TIMEOUT = 5000;

/**
 * 检查域名健康状态
 * @param {string} domain - 要检查的域名
 * @param {string} checkPath - 检查路径（默认为 '/'）
 * @returns {Promise<boolean>} - 域名是否可访问
 */
function checkDomainHealth(domain, checkPath = '/') {
  return new Promise((resolve) => {
    const url = new URL(`https://${domain}`);

    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: checkPath,
      method: 'HEAD',
      timeout: HEALTH_CHECK_TIMEOUT,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; HealthChecker/1.0)'
      }
    }, (res) => {
      // 状态码 < 500 认为是健康的
      resolve(res.statusCode < 500);
    });

    req.on('error', () => {
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

/**
 * 检查 Docker 镜像源健康状态
 * @param {string} domain - 要检查的域名
 * @returns {Promise<boolean>} - 镜像源是否可访问
 */
function checkDockerMirrorHealth(domain) {
  // Docker 镜像源需要检查 /v2/ 端点
  return checkDomainHealth(domain, '/v2/');
}

/**
 * 获取最佳可用镜像
 * @param {string} sourceDomain - 源域名
 * @param {Object} config - 镜像配置
 * @returns {Promise<string>} - 最佳镜像域名
 */
async function getBestMirror(sourceDomain, config) {
  // 判断是否为 Docker 镜像源
  const isDockerMirror = ['docker.io', 'registry-1.docker.io', 'index.docker.io', 'registry.hub.docker.com'].includes(sourceDomain);
  const healthCheckFunc = isDockerMirror ? checkDockerMirrorHealth : checkDomainHealth;

  // 检查 primary
  console.log(`Checking primary: ${config.primary}${isDockerMirror ? ' (Docker mirror)' : ''}`);
  const primaryHealthy = await healthCheckFunc(config.primary);

  if (primaryHealthy) {
    console.log(`✓ Primary ${config.primary} is healthy`);
    return config.primary;
  }

  console.log(`✗ Primary ${config.primary} is unhealthy`);

  // 检查 fallback
  if (config.fallback && config.fallback.length > 0) {
    for (const fallback of config.fallback) {
      console.log(`Checking fallback: ${fallback}${isDockerMirror ? ' (Docker mirror)' : ''}`);
      const fallbackHealthy = await healthCheckFunc(fallback);

      if (fallbackHealthy) {
        console.log(`✓ Fallback ${fallback} is healthy`);
        return fallback;
      }

      console.log(`✗ Fallback ${fallback} is unhealthy`);
    }
  }

  // 所有镜像都不可用，返回 primary
  console.log(`⚠ All mirrors unhealthy, keeping primary: ${config.primary}`);
  return config.primary;
}

/**
 * 解析 MIRRORS 配置
 * @param {string} workerContent - worker.js 文件内容
 * @returns {Object} - 解析后的镜像配置
 */
function parseMirrorConfig(workerContent) {
  // 提取 MIRRORS 对象的内容
  const mirrorMatch = workerContent.match(/MIRRORS:\s*{([\s\S]*?)},\s*\/\/ 可处理的内容类型/);
  if (!mirrorMatch) {
    throw new Error('Could not find MIRRORS configuration in worker.js');
  }
  
  const mirrorsText = mirrorMatch[1];
  const configs = {};
  
  // 使用更精确的正则表达式匹配每个域名配置
  const domainRegex = /'([^']+)':\s*{([\s\S]*?)}/g;
  let match;
  
  while ((match = domainRegex.exec(mirrorsText)) !== null) {
    const domain = match[1];
    const configText = match[2];
    
    // 解析 primary
    const primaryMatch = configText.match(/primary:\s*'([^']+)'/);
    if (!primaryMatch) continue;
    
    const primary = primaryMatch[1];
    
    // 解析 fallback
    let fallback = [];
    const fallbackMatch = configText.match(/fallback:\s*\[([^\]]*)\]/);
    if (fallbackMatch && fallbackMatch[1].trim()) {
      fallback = fallbackMatch[1]
        .split(',')
        .map(s => s.trim().replace(/['"]/g, ''))
        .filter(s => s.length > 0);
    }
    
    // 解析 type
    const typeMatch = configText.match(/type:\s*'([^']+)'/);
    const type = typeMatch ? typeMatch[1] : 'domain-replace';
    
    configs[domain] = { primary, fallback, type };
  }
  
  return configs;
}

/**
 * 更新 worker.js 中的镜像配置
 * @param {string} workerContent - 原始内容
 * @param {string} domain - 域名
 * @param {Object} oldConfig - 旧配置
 * @param {Object} newConfig - 新配置
 * @returns {string} - 更新后的内容
 */
function updateMirrorConfig(workerContent, domain, oldConfig, newConfig) {
  // 构建新的配置字符串
  let newConfigStr = `    '${domain}': {\n      primary: '${newConfig.primary}',\n      fallback: [${newConfig.fallback.map(f => `'${f}'`).join(', ')}]`;
  
  if (newConfig.type && newConfig.type !== 'domain-replace') {
    newConfigStr += `,\n      type: '${newConfig.type}'`;
  }
  
  newConfigStr += '\n    }';
  
  // 创建匹配旧配置的正则表达式
  const escapedDomain = domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const oldConfigRegex = new RegExp(
    `\\s*'${escapedDomain}':\\s*{[\\s\\S]*?}`,
    'g'
  );
  
  return workerContent.replace(oldConfigRegex, newConfigStr);
}

/**
 * 主函数
 */
async function main() {
  console.log('Starting domain health check...');
  
  try {
    // 读取当前的 worker.js 文件
    const workerContent = fs.readFileSync('src/worker.js', 'utf8');
    
    // 解析镜像配置
    const configs = parseMirrorConfig(workerContent);
    
    if (Object.keys(configs).length === 0) {
      console.error('No mirror configurations found');
      process.exit(1);
    }
    
    console.log(`Found ${Object.keys(configs).length} mirror configurations`);
    
    let hasChanges = false;
    let newWorkerContent = workerContent;
    
    // 检查每个域名配置
    for (const [domain, config] of Object.entries(configs)) {
      console.log(`\nChecking domain: ${domain}`);
      console.log(`Current primary: ${config.primary}`);
      console.log(`Fallback options: ${config.fallback.join(', ') || 'none'}`);
      
      const bestMirror = await getBestMirror(domain, config);
      
      // 如果最佳镜像与当前 primary 不同，需要更新
      if (bestMirror !== config.primary) {
        console.log(`🔄 Updating ${domain}: ${config.primary} -> ${bestMirror}`);
        
        // 更新配置：将最佳镜像设为 primary，原 primary 加入 fallback
        const newFallback = [config.primary, ...config.fallback.filter(f => f !== bestMirror)];
        
        const newConfig = {
          primary: bestMirror,
          fallback: newFallback,
          type: config.type
        };
        
        newWorkerContent = updateMirrorConfig(newWorkerContent, domain, config, newConfig);
        hasChanges = true;
      } else {
        console.log(`✓ ${domain} configuration is optimal`);
      }
    }
    
    // 如果有变化，写入文件
    if (hasChanges) {
      fs.writeFileSync('src/worker.js', newWorkerContent);
      console.log('\n🎉 Updated worker.js with new mirror configurations');
    } else {
      console.log('\n✅ All mirror configurations are optimal, no changes needed');
    }
    
  } catch (error) {
    console.error('Error during health check:', error.message);
    process.exit(1);
  }
}

// 运行主函数
main().catch(error => {
  console.error('Error during health check:', error);
  process.exit(1);
});