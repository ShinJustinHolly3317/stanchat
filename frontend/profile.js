import { SUPABASE_CONFIG } from './config.js';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import FriendsAPI from './friends-api.js';

const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

const backBtn = document.getElementById('backBtn');
const errorDiv = document.getElementById('error');
const avatarDiv = document.getElementById('avatar');
const nicknameEl = document.getElementById('nickname');
const uidEl = document.getElementById('uid');
const imageUrlEl = document.getElementById('imageUrl');

function showError(message) {
  errorDiv.textContent = message;
  errorDiv.classList.add('show');
}

function clearError() {
  errorDiv.classList.remove('show');
}

function setAvatar({ nickname, image_url }) {
  avatarDiv.innerHTML = '';
  if (image_url) {
    const img = document.createElement('img');
    img.src = image_url;
    img.alt = nickname || 'avatar';
    avatarDiv.appendChild(img);
    return;
  }
  const first = (nickname || 'U')[0]?.toUpperCase() || 'U';
  avatarDiv.textContent = first;
}

async function requireAuth() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }
  return session;
}

async function loadProfile() {
  clearError();
  const session = await requireAuth();
  if (!session) return;

  const url = new URL(window.location.href);
  const uid = url.searchParams.get('uid') || undefined;

  try {
    const profile = await FriendsAPI.getProfile(uid);
    nicknameEl.textContent = profile.nickname || 'Unknown';
    uidEl.textContent = profile.id || '-';
    imageUrlEl.textContent = profile.image_url || '-';
    setAvatar(profile);
  } catch (e) {
    showError(e.message || String(e));
    nicknameEl.textContent = 'Error';
  }
}

backBtn.addEventListener('click', () => {
  // Prefer going back if possible, otherwise go home
  if (history.length > 1) {
    history.back();
  } else {
    window.location.href = 'welcome.html';
  }
});

loadProfile();

