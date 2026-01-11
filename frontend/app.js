// 從 config.js 載入 Supabase 設定
import { SUPABASE_CONFIG } from './config.js';

// 初始化 Supabase client
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

// DOM 元素
const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const submitBtn = document.getElementById('submitBtn');
const errorDiv = document.getElementById('error');

// 檢查是否已登入
async function checkAuth() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) {
    window.location.href = 'welcome.html';
  }
}

// 顯示錯誤
function showError(message) {
  errorDiv.textContent = message;
  errorDiv.classList.add('show');
  setTimeout(() => {
    errorDiv.classList.remove('show');
  }, 5000);
}

// 登入處理
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  // 顯示載入狀態
  submitBtn.textContent = 'Signing in...';
  submitBtn.disabled = true;
  loginForm.classList.add('loading');

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    // 登入成功，跳轉到歡迎頁面
    window.location.href = 'welcome.html';
  } catch (error) {
    showError(error.message || 'Login failed. Please try again.');
    submitBtn.textContent = 'Sign In';
    submitBtn.disabled = false;
    loginForm.classList.remove('loading');
  }
});

// 註冊連結已經在 HTML 中指向 signup.html，不需要 JavaScript 處理

// 頁面載入時檢查登入狀態
checkAuth();
