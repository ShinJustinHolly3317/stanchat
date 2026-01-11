#!/usr/bin/env node
/**
 * 從 .env 檔案生成 frontend/config.js
 * 執行: node scripts/generate-config.js
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../frontend/.env');
const configPath = path.join(__dirname, '../frontend/config.js');

// 讀取 .env 檔案
function loadEnv() {
  const env = {};
  
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found at:', envPath);
    console.log('💡 Copy frontend/.env.example to frontend/.env and fill in your credentials');
    process.exit(1);
  }
  
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const lines = envContent.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    // 跳過註解和空行
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length > 0) {
      env[key.trim()] = valueParts.join('=').trim();
    }
  }
  
  return env;
}

// 生成 config.js
function generateConfig(env) {
  const url = env.SUPABASE_URL || 'YOUR_SUPABASE_URL';
  const anonKey = env.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY';
  
  const configContent = `// 這個檔案由 scripts/generate-config.js 自動生成
// 請勿手動編輯，請編輯 frontend/.env 檔案

export const SUPABASE_CONFIG = {
  url: '${url}',
  anonKey: '${anonKey}',
};
`;

  fs.writeFileSync(configPath, configContent, 'utf-8');
  console.log('✅ Generated frontend/config.js from .env');
}

// 主程式
try {
  const env = loadEnv();
  
  // 驗證必要的環境變數
  if (!env.SUPABASE_URL || env.SUPABASE_URL === 'YOUR_SUPABASE_URL') {
    console.warn('⚠️  SUPABASE_URL not set in .env');
  }
  
  if (!env.SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
    console.warn('⚠️  SUPABASE_ANON_KEY not set in .env');
  }
  
  generateConfig(env);
} catch (error) {
  console.error('❌ Error generating config:', error.message);
  process.exit(1);
}
