// Friends API 模組
// 封裝所有好友相關的 API 呼叫

import { SUPABASE_CONFIG } from './config.js';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

class FriendsAPI {
  /**
   * 解析 Edge Function 的標準回應格式
   * - success: { code: '0000', data: ... }
   * - error:   { code: 'xxxx', message: '...' }
   */
  async parseEnvelope(response) {
    let body = null;
    try {
      body = await response.json();
    } catch {
      // ignore
    }

    if (!body) {
      if (response.ok) {
        return null;
      }
      throw new Error(`Request failed (${response.status})`);
    }

    if (body.code) {
      if (body.code === '0000') {
        return body.data;
      }
      const err = new Error(body.message || 'Request failed');
      err.code = body.code;
      throw err;
    }

    // fallback (old format)
    if (!response.ok) {
      throw new Error(body.error || body.message || 'Request failed');
    }
    return body;
  }

  /**
   * 取得認證 token
   */
  async getAuthToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }
    return session.access_token;
  }

  /**
   * 取得使用者 profile
   * - 預設取自己（token uid）
   * - 可選: 傳入 uid 取他人 profile
   */
  async getProfile(uid) {
    const token = await this.getAuthToken();
    const qs = uid ? `?uid=${encodeURIComponent(uid)}` : '';

    const response = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/get-profile${qs}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    return await this.parseEnvelope(response);
  }

  /**
   * 更新自己的 profile (nickname)
   */
  async updateProfile(nickname) {
    const token = await this.getAuthToken();

    const response = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/update-profile`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ nickname }),
    });

    return await this.parseEnvelope(response);
  }

  /**
   * 搜尋使用者
   */
  async searchFriend(query) {
    const token = await this.getAuthToken();

    const response = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/search-friend`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    return await this.parseEnvelope(response);
  }

  /**
   * 發送好友邀請
   */
  async sendInvitation(targetUserId) {
    const token = await this.getAuthToken();

    const response = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/send-invitation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ target_user_id: targetUserId }),
    });

    return await this.parseEnvelope(response);
  }

  /**
   * 接受或拒絕邀請
   */
  async acceptInvitation(senderUserId, action) {
    if (action !== 'accept' && action !== 'decline') {
      throw new Error('Action must be "accept" or "decline"');
    }

    const token = await this.getAuthToken();

    const response = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/accept-invitation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        request_id: senderUserId,
        action: action,
      }),
    });

    return await this.parseEnvelope(response);
  }

  /**
   * 取得所有好友列表
   */
  async getFriends() {
    const token = await this.getAuthToken();

    const response = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/get-friends`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    return await this.parseEnvelope(response);
  }

  /**
   * 取得待處理的邀請列表
   */
  async getInvitations() {
    const token = await this.getAuthToken();

    const response = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/get-invitations`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    return await this.parseEnvelope(response);
  }

  /**
   * 取得使用者所有的聊天頻道
   */
  async getChannels() {
    const token = await this.getAuthToken();

    const response = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/get-channels`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    return await this.parseEnvelope(response);
  }

  /**
   * 建立 pending message 並取得問題
   */
  async createPendingMessage(roomId, content) {
    const token = await this.getAuthToken();

    const response = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/create-pending-message`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        room_id: roomId,
        content: content,
      }),
    });

    return await this.parseEnvelope(response);
  }

  /**
   * 提交 pending message（寫入正式 chat_messages）
   * - for now: always success on backend (no evaluation)
   */
  async commitMessage(pendingId, category, audioPath) {
    const token = await this.getAuthToken();

    const body = {
      pending_id: pendingId,
      category: category,
      ...(audioPath ? { audio_path: audioPath } : {}),
    };

    const response = await fetch(`${SUPABASE_CONFIG.url}/functions/v1/commit-message`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    return await this.parseEnvelope(response);
  }

  /** @deprecated duplicated; kept for backward compatibility during refactor */
  async createPendingMessage_duplicated(roomId, content) {
    return await this.createPendingMessage(roomId, content);
  }

  // (removed duplicate createPendingMessage implementation; use the envelope version above)

  /**
   * 設定 Realtime 監聽
   */
  setupRealtimeListeners(userId, callbacks) {
    // 監聽 inbox 事件（收到邀請）
    const inboxChannel = supabase
      .channel(`inbox:${userId}`)
      .on('broadcast', { event: 'friend_invitation' }, (payload) => {
        if (callbacks.onInvitationReceived) {
          callbacks.onInvitationReceived(payload.payload);
        }
      })
      .subscribe();

    // 監聽 user 事件（邀請狀態更新）
    const userChannel = supabase
      .channel(`user:${userId}`)
      .on('broadcast', { event: 'friend_request_accepted' }, (payload) => {
        if (callbacks.onInvitationAccepted) {
          callbacks.onInvitationAccepted(payload.payload);
        }
      })
      .on('broadcast', { event: 'friend_request_declined' }, (payload) => {
        if (callbacks.onInvitationDeclined) {
          callbacks.onInvitationDeclined(payload.payload);
        }
      })
      .subscribe();

    return { inboxChannel, userChannel };
  }
}

export default new FriendsAPI();
