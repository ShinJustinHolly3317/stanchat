// 接受/拒絕好友邀請 Edge Function
// 處理好友邀請的接受或拒絕

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.8';
import { corsHeaders } from '../_shared/cors.ts';
import { jsonErr, jsonOk } from '../_shared/responses.ts';

serve(async (req) => {
  // 處理 CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 取得認證資訊
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonErr('1001', 'Missing authorization header', 401);
    }

    // 建立 Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // 取得當前使用者
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return jsonErr('1002', 'Unauthorized', 401);
    }

    const currentUserId = user.id;

    // 解析請求 body
    const { request_id, action } = await req.json();

    if (!request_id) {
      return jsonErr('1100', 'request_id is required', 400);
    }

    if (!action || (action !== 'accept' && action !== 'decline')) {
      return jsonErr('1100', 'action must be "accept" or "decline"', 400);
    }

    // 查詢邀請記錄 (request_id = friendships.id)
    const friendshipId = request_id;

    /**
     * @typedef {Object} FriendshipRow
     * @property {number} id - 關係記錄 ID (friendships.id)
     * @property {string} status - 關係狀態 (friendships.status: 'pending' | 'friend' | 'blocked')
     * @property {string} user_one_id - 使用者一 UUID (friendships.user_one_id)
     * @property {string} user_two_id - 使用者二 UUID (friendships.user_two_id)
     */
    /** @type {{ data: FriendshipRow | null, error: any }} */
    const { data: friendship, error: friendshipError } = await supabase
      .from('friendships')
      .select('id, status, user_one_id, user_two_id')
      .eq('id', friendshipId)
      .maybeSingle();

    if (friendshipError) {
      return jsonErr('9000', 'Failed to check friendship', 500);
    }

    if (!friendship) {
      return jsonErr('1404', 'Invitation not found', 404);
    }

    // 驗證這是待處理的邀請，且當前使用者是接收方
    if (friendship.status !== 'pending') {
      return jsonErr('1200', 'Invitation is not pending', 400);
    }

    // 確認當前使用者是接收方
    // send-invitation 使用 user_one_id=sender, user_two_id=receiver
    const isCurrentUserReceiver = String(friendship.user_two_id) === String(currentUserId);

    if (!isCurrentUserReceiver) {
      return jsonErr('1004', 'You are not the recipient of this invitation', 403);
    }

    const now = Date.now();
    let channelId = null;
    const targetUserId = friendship.user_one_id;

    if (action === 'accept') {
      // 接受邀請：更新狀態為 friend
      // 使用 friendship 記錄中的實際 ID 來更新（確保匹配）
      console.log('Updating friendship:', {
        friendship_user_one: friendship.user_one_id,
        friendship_user_two: friendship.user_two_id,
        friendship_status: friendship.status,
        currentUserId,
        targetUserId,
      });

      /**
       * @typedef {Object} VerifyFriendshipRow
       * @property {number} id - 關係記錄 ID (friendships.id)
       * @property {string} status - 關係狀態 (friendships.status)
       */
      /** @type {{ data: VerifyFriendshipRow | null, error: any }} */
      // 先確認記錄仍然存在且狀態為 pending
      const { data: verifyFriendship, error: verifyError } = await supabase
        .from('friendships')
        .select('id, status')
        .eq('id', friendship.id)
        .eq('status', 'pending')
        .maybeSingle();

      if (verifyError) {
        console.error('Verify error:', verifyError);
        return jsonErr('9000', `Failed to verify invitation: ${verifyError.message}`, 500);
      }

      if (!verifyFriendship) {
        console.log('Friendship not found or status changed');
        return jsonErr('1404', 'Invitation not found or already processed', 404);
      }

      /**
       * @typedef {Object} UpdatedFriendshipRow
       * @property {number} id - 關係記錄 ID (friendships.id)
       * @property {string} status - 關係狀態 (friendships.status)
       * @property {string} user_one_id - 使用者一 UUID (friendships.user_one_id)
       * @property {string} user_two_id - 使用者二 UUID (friendships.user_two_id)
       * @property {number} created_at - 建立時間戳（毫秒）(friendships.created_at)
       * @property {number} updated_at - 更新時間戳（毫秒）(friendships.updated_at)
       */
      /** @type {{ data: UpdatedFriendshipRow | null, error: any }} */
      // 執行更新 - 使用 anon key (RLS 政策已更新)
      const { data: updatedFriendship, error: updateError } = await supabase
        .from('friendships')
        .update({
          status: 'friend',
          updated_at: now,
        })
        .eq('id', friendship.id)
        .eq('status', 'pending') // 確保只更新 pending 狀態的記錄
        .select()
        .maybeSingle();

      if (updateError) {
        console.error('Update error:', updateError);
        return jsonErr('9000', `Failed to accept invitation: ${updateError.message}`, 500);
      }

      // 確認更新是否成功（有資料被更新）
      if (!updatedFriendship) {
        console.log('No rows updated - status might have changed');
        return jsonErr('1404', 'Invitation not found or already processed', 404);
      }

      console.log('Friendship updated successfully:', updatedFriendship);

      // 建立聊天室 (如果需要)
      // 這裡假設 chat_channels 表存在，且 channel_type 有 'direct' 選項
      // 使用 service role key 來建立 channel (可能需要 bypass RLS)
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

      /**
       * @typedef {Object} ChatChannelRow
       * @property {number} id - 頻道 ID (chat_channels.id)
       */
      /** @type {{ data: ChatChannelRow | null, error: any }} */
      // 建立 direct message channel
      const { data: channel, error: channelError } = await serviceClient
        .from('chat_channels')
        .insert({
          channel_type: 'direct',
        })
        .select('id')
        .single();

      if (!channelError && channel) {
        channelId = channel.id;

        // 將兩個使用者加入 channel
        await serviceClient.from('channel_users').insert([
          { channel_id: channel.id, uid: currentUserId },
          { channel_id: channel.id, uid: targetUserId },
        ]);

        /**
         * @typedef {Object} UserProfileRow
         * @property {string} uid - 使用者 UUID (user_profile.uid)
         * @property {string|null} name - 使用者名稱 (user_profile.name)
         * @property {string|null} custom_user_id - 自訂使用者 ID (user_profile.custom_user_id)
         * @property {string|null} image_url - 頭像 URL (user_profile.image_url)
         */
        /** @type {{ data: UserProfileRow | null, error: any }} */
        // 發送通知給發送邀請的使用者
        const { data: currentProfile } = await serviceClient
          .from('user_profile')
          .select('uid, name, custom_user_id, image_url')
          .eq('uid', currentUserId)
          .maybeSingle();

        await serviceClient.channel(`user:${targetUserId}`).send({
          type: 'broadcast',
          event: 'friend_request_accepted',
          payload: {
            request_id: friendship.id,
            sender: {
              id: currentUserId,
              nickname: currentProfile?.name || currentProfile?.custom_user_id || 'Unknown',
              avatar_url: currentProfile?.image_url || null,
            },
            sent_at: now,
            channel_id: channelId,
          },
        });
      }
    } else {
      // 拒絕邀請：刪除記錄或更新狀態
      // 使用 anon key (RLS 政策已更新)
      const { error: deleteError } = await supabase
        .from('friendships')
        .delete()
        .eq('id', friendship.id);

      if (deleteError) {
        return jsonErr('9000', 'Failed to decline invitation', 500);
      }

      /**
       * @typedef {Object} UserProfileRow
       * @property {string} uid - 使用者 UUID (user_profile.uid)
       * @property {string|null} name - 使用者名稱 (user_profile.name)
       * @property {string|null} custom_user_id - 自訂使用者 ID (user_profile.custom_user_id)
       * @property {string|null} image_url - 頭像 URL (user_profile.image_url)
       */
      /** @type {{ data: UserProfileRow | null, error: any }} */
      // 發送通知給發送邀請的使用者
      // 使用 service role key 來發送 Realtime 通知
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

      const { data: currentProfile } = await serviceClient
        .from('user_profile')
        .select('uid, name, custom_user_id, image_url')
        .eq('uid', currentUserId)
        .maybeSingle();

      await serviceClient.channel(`user:${targetUserId}`).send({
        type: 'broadcast',
        event: 'friend_request_declined',
        payload: {
          request_id: friendship.id,
          sender: {
            id: currentUserId,
            nickname: currentProfile?.name || currentProfile?.custom_user_id || 'Unknown',
            avatar_url: currentProfile?.image_url || null,
          },
          sent_at: now,
        },
      });
    }

    return jsonOk(
      channelId
        ? {
            status: 'success',
            channel_id: channelId,
          }
        : { status: 'success' }
    );
  } catch (error) {
    return jsonErr('9000', error instanceof Error ? error.message : 'Unknown error', 500);
  }
});
