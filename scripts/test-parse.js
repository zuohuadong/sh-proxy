const fs = require('fs');

function parseMirrorConfig(workerContent) {
  const mirrorMatch = workerContent.match(/MIRRORS:\s*{([\s\S]*?)},\s*\/\/ 可处理的内容类型/);
  if (!mirrorMatch) {
    throw new Error('Could not find MIRRORS configuration');
  }
  
  const mirrorsText = mirrorMatch[1];
  console.log('MIRRORS text found, length:', mirrorsText.length);
  
  const configs = {};
  const domainRegex = /'([^']+)':\s*{([\s\S]*?)}/g;
  let match;
  
  while ((match = domainRegex.exec(mirrorsText)) !== null) {
    const domain = match[1];
    const configText = match[2];
    
    const primaryMatch = configText.match(/primary:\s*'([^']+)'/);
    if (!primaryMatch) continue;
    
    const primary = primaryMatch[1];
    
    let fallback = [];
    const fallbackMatch = configText.match(/fallback:\s*\[([^\]]*)\]/);
    if (fallbackMatch && fallbackMatch[1].trim()) {
      fallback = fallbackMatch[1]
        .split(',')
        .map(s => s.trim().replace(/['"]/g, ''))
        .filter(s => s.length > 0);
    }
    
    const typeMatch = configText.match(/type:\s*'([^']+)'/);
    const type = typeMatch ? typeMatch[1] : 'domain-replace';
    
    configs[domain] = { primary, fallback, type };
    console.log(`${domain}: ${primary} (${fallback.length} fallbacks)`);
  }
  
  return configs;
}

try {
  const workerContent = fs.readFileSync('src/worker.js', 'utf8');
  const configs = parseMirrorConfig(workerContent);
  console.log(`\nTotal configurations: ${Object.keys(configs).length}`);
} catch (error) {
  console.error('Error:', error.message);
}