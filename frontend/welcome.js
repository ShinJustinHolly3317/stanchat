// 從 config.js 載入 Supabase 設定
import { SUPABASE_CONFIG } from './config.js';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

// DOM 元素
const userIdSpan = document.getElementById('userId');
const userEmailH2 = document.getElementById('userEmail');
const avatarDiv = document.getElementById('avatar');
const logoutBtn = document.getElementById('logoutBtn');
const userEventsDiv = document.getElementById('userEvents');
const inboxEventsDiv = document.getElementById('inboxEvents');

let userChannel = null;
let inboxChannel = null;

// 檢查登入狀態
async function checkAuth() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (!session || error) {
    window.location.href = 'index.html';
    return;
  }

  // 顯示使用者資訊
  const user = session.user;
  userIdSpan.textContent = user.id;
  userEmailH2.textContent = user.email || 'User';
  avatarDiv.textContent = (user.email || 'U')[0].toUpperCase();

  // 設定 Realtime 監聽
  setupRealtime(user.id);
}

// 設定 Realtime 監聽
function setupRealtime(userId) {
  // 監聽 user:userId 事件
  userChannel = supabase
    .channel(`user:${userId}`)
    .on('broadcast', { event: '*' }, (payload) => {
      console.log('User event received:', payload);
      addEvent(userEventsDiv, 'user', payload);
    })
    .subscribe((status) => {
      console.log('User channel status:', status);
    });

  // 監聽 inbox:userId 事件
  inboxChannel = supabase
    .channel(`inbox:${userId}`)
    .on('broadcast', { event: '*' }, (payload) => {
      console.log('Inbox event received:', payload);
      addEvent(inboxEventsDiv, 'inbox', payload);
    })
    .subscribe((status) => {
      console.log('Inbox channel status:', status);
    });

  console.log(`Listening to channels: user:${userId} and inbox:${userId}`);
}

// 新增事件到列表
function addEvent(container, type, payload) {
  // 移除 empty state
  const emptyState = container.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }

  const eventItem = document.createElement('div');
  eventItem.className = 'event-item';

  const now = new Date();
  const timeStr = now.toLocaleTimeString();

  eventItem.innerHTML = `
    <div class="event-header">
      <span class="event-type">${type}:${payload.event || 'event'}</span>
      <span class="event-time">${timeStr}</span>
    </div>
    <div class="event-data">${JSON.stringify(payload.payload || payload, null, 2)}</div>
  `;

  // 插入到最前面
  container.insertBefore(eventItem, container.firstChild);

  // 限制最多顯示 50 個事件
  while (container.children.length > 50) {
    container.removeChild(container.lastChild);
  }
}

// 登出處理
logoutBtn.addEventListener('click', async () => {
  // 取消訂閱 Realtime channels
  if (userChannel) {
    await supabase.removeChannel(userChannel);
  }
  if (inboxChannel) {
    await supabase.removeChannel(inboxChannel);
  }

  // 登出
  await supabase.auth.signOut();
  window.location.href = 'index.html';
});

// 頁面載入時檢查登入狀態
checkAuth();

// 監聽 auth 狀態變化
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || !session) {
    window.location.href = 'index.html';
  }
});
