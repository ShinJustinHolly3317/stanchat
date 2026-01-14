// Friends API 模組
// 封裝所有好友相關的 API 呼叫

import { SUPABASE_CONFIG } from './config.js';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

class FriendsAPI {
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

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Search failed');
    }

    return await response.json();
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

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send invitation');
    }

    return await response.json();
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

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to process invitation');
    }

    return await response.json();
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

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch friends');
    }

    return await response.json();
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

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch invitations');
    }

    const result = await response.json();
    return result;
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

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch channels');
    }

    return await response.json();
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

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create pending message');
    }

    return await response.json();
  }

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
