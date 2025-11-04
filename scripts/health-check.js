#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const { URL } = require('url');

// 健康检查超时时间（毫秒）
const HEALTH_CHECK_TIMEOUT = 5000;

/**
 * 检查域名健康状态
 * @param {string} domain - 要检查的域名
 * @returns {Promise<boolean>} - 域名是否可访问
 */
function checkDomainHealth(domain) {
  return new Promise((resolve) => {
    const url = new URL(`https://${domain}`);
    
    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: '/',
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
 * 获取最佳可用镜像
 * @param {Object} config - 镜像配置
 * @returns {Promise<string>} - 最佳镜像域名
 */
async function getBestMirror(config) {
  // 检查 primary
  console.log(`Checking primary: ${config.primary}`);
  const primaryHealthy = await checkDomainHealth(config.primary);
  
  if (primaryHealthy) {
    console.log(`✓ Primary ${config.primary} is healthy`);
    return config.primary;
  }
  
  console.log(`✗ Primary ${config.primary} is unhealthy`);
  
  // 检查 fallback
  if (config.fallback && config.fallback.length > 0) {
    for (const fallback of config.fallback) {
      console.log(`Checking fallback: ${fallback}`);
      const fallbackHealthy = await checkDomainHealth(fallback);
      
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
 * 主函数
 */
async function main() {
  console.log('Starting domain health check...');
  
  // 读取当前的 worker.js 文件
  const workerContent = fs.readFileSync('src/worker.js', 'utf8');
  
  // 提取 MIRRORS 配置
  const mirrorMatch = workerContent.match(/MIRRORS:\s*{([^}]+(?:{[^}]*}[^}]*)*)}/s);
  if (!mirrorMatch) {
    console.error('Could not find MIRRORS configuration in worker.js');
    process.exit(1);
  }
  
  // 解析镜像配置（简单的字符串解析）
  const mirrorsText = mirrorMatch[1];
  const domainMatches = mirrorsText.match(/'([^']+)':\s*{[^}]*primary:\s*'([^']+)'[^}]*(?:fallback:\s*\[([^\]]*)\])?[^}]*}/g);
  
  if (!domainMatches) {
    console.error('Could not parse mirror configurations');
    process.exit(1);
  }
  
  let hasChanges = false;
  let newWorkerContent = workerContent;
  
  // 检查每个域名配置
  for (const match of domainMatches) {
    const domainMatch = match.match(/'([^']+)':/);
    const primaryMatch = match.match(/primary:\s*'([^']+)'/);
    const fallbackMatch = match.match(/fallback:\s*\[([^\]]*)\]/);
    
    if (!domainMatch || !primaryMatch) continue;
    
    const domain = domainMatch[1];
    const currentPrimary = primaryMatch[1];
    
    // 解析 fallback 数组
    let fallback = [];
    if (fallbackMatch && fallbackMatch[1]) {
      fallback = fallbackMatch[1]
        .split(',')
        .map(s => s.trim().replace(/['"]/g, ''))
        .filter(s => s.length > 0);
    }
    
    console.log(`\nChecking domain: ${domain}`);
    console.log(`Current primary: ${currentPrimary}`);
    console.log(`Fallback options: ${fallback.join(', ') || 'none'}`);
    
    const config = {
      primary: currentPrimary,
      fallback: fallback
    };
    
    const bestMirror = await getBestMirror(config);
    
    // 如果最佳镜像与当前 primary 不同，需要更新
    if (bestMirror !== currentPrimary) {
      console.log(`🔄 Updating ${domain}: ${currentPrimary} -> ${bestMirror}`);
      
      // 更新配置：将最佳镜像设为 primary，原 primary 加入 fallback
      const newFallback = [currentPrimary, ...fallback.filter(f => f !== bestMirror)];
      
      const oldConfig = match;
      const newConfig = oldConfig
        .replace(/primary:\s*'[^']+'/, `primary: '${bestMirror}'`)
        .replace(/fallback:\s*\[[^\]]*\]/, `fallback: [${newFallback.map(f => `'${f}'`).join(', ')}]`);
      
      newWorkerContent = newWorkerContent.replace(oldConfig, newConfig);
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
}

// 运行主函数
main().catch(error => {
  console.error('Error during health check:', error);
  process.exit(1);
});