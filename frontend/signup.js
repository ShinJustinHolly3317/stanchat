// 從 config.js 載入 Supabase 設定
import { SUPABASE_CONFIG } from './config.js';

// 初始化 Supabase client
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

// DOM 元素
const signupForm = document.getElementById('signupForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirmPassword');
const submitBtn = document.getElementById('submitBtn');
const errorDiv = document.getElementById('error');
const successDiv = document.getElementById('success');

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
  successDiv.classList.remove('show');
  setTimeout(() => {
    errorDiv.classList.remove('show');
  }, 5000);
}

// 顯示成功訊息
function showSuccess(message) {
  successDiv.textContent = message;
  successDiv.classList.add('show');
  errorDiv.classList.remove('show');
}

// 驗證密碼
function validatePassword(password, confirmPassword) {
  if (password.length < 6) {
    return 'Password must be at least 6 characters';
  }

  if (password !== confirmPassword) {
    return 'Passwords do not match';
  }

  return null;
}

// 註冊處理
signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  // 驗證密碼
  const passwordError = validatePassword(password, confirmPassword);
  if (passwordError) {
    showError(passwordError);
    return;
  }

  // 顯示載入狀態
  submitBtn.textContent = 'Creating account...';
  submitBtn.disabled = true;
  signupForm.classList.add('loading');

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/welcome.html`,
      },
    });

    if (error) throw error;

    // 註冊成功
    showSuccess(
      'Account created successfully! Please check your email to confirm your account, or you can sign in now.'
    );

    // 如果 email confirmation 被禁用，直接跳轉
    // 否則等待使用者確認 email
    setTimeout(() => {
      if (data.user && !data.user.email_confirmed_at) {
        // Email confirmation required
        showSuccess('Please check your email to confirm your account before signing in.');
      } else {
        // Auto sign in if email confirmation is disabled
        window.location.href = 'welcome.html';
      }
    }, 2000);
  } catch (error) {
    showError(error.message || 'Sign up failed. Please try again.');
    submitBtn.textContent = 'Sign Up';
    submitBtn.disabled = false;
    signupForm.classList.remove('loading');
  }
});

// 頁面載入時檢查登入狀態
checkAuth();
