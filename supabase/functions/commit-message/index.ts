// commit-message Edge Function
// - Read pending message from pending_messages
// - Write final message into chat_messages
// - Delete pending row
// - For now: always returns success with is_correct=true (no evaluation, no audio validation)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.8';
import { corsHeaders } from '../_shared/cors.ts';
import { jsonErr, jsonOk } from '../_shared/responses.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonErr('1001', 'Missing authorization header', 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return jsonErr('1002', 'Unauthorized', 401);
    }

    const body = await req.json();
    const pendingId = body?.pending_id;
    const category = body?.category;
    // accepted but unused for now
    const audioPath = body?.audio_path;

    if (!pendingId) {
      return jsonErr('1100', 'pending_id is required (string)', 400);
    }

    if (!category) {
      return jsonErr('1100', 'category is required (string)', 400);
    }

    /**
     * @typedef {Object} PendingMessageRow
     * @property {number} id - Pending message ID (pending_messages.id)
     * @property {number} channel_id - 頻道 ID (pending_messages.channel_id)
     * @property {string} sender_uid - 發送者 UUID (pending_messages.sender_uid)
     * @property {string} content - 訊息內容 (pending_messages.content)
     * @property {number} created_at - 建立時間戳（毫秒）(pending_messages.created_at)
     */
    /** @type {{ data: PendingMessageRow | null, error: any }} */
    // Fetch pending message (ensure it belongs to current user)
    const { data: pending, error: pendingError } = await supabase
      .from('pending_messages')
      .select('id, channel_id, sender_uid, content, created_at')
      .eq('id', pendingId)
      .maybeSingle();

    if (pendingError) {
      return jsonErr('9000', `Failed to fetch pending message: ${pendingError.message}`, 500);
    }

    if (!pending) {
      return jsonErr('1404', 'Pending message not found', 404);
    }

    if (pending.sender_uid !== user.id) {
      return jsonErr('1004', 'Forbidden', 403);
    }

    /**
     * @typedef {Object} ChatMessageRow
     * @property {number} id - 訊息 ID (chat_messages.id)
     * @property {number} channel_id - 頻道 ID (chat_messages.channel_id)
     * @property {string} message_content - 訊息內容 (chat_messages.message_content)
     * @property {string} uid - 發送者 UUID (chat_messages.uid)
     * @property {number} created_at - 建立時間戳（毫秒）(chat_messages.created_at)
     */
    /** @type {{ data: ChatMessageRow | null, error: any }} */
    // Write final message
    // NOTE: We only insert the minimal fields we know from the project docs/code.
    // If your DB schema has additional required fields, we can adjust later.
    const now = Date.now();
    const { data: inserted, error: insertError } = await supabase
      .from('chat_messages')
      .insert({
        channel_id: pending.channel_id,
        message_content: pending.content,
        uid: pending.sender_uid,
        created_at: now,
        updated_at: now,
        // audioPath is accepted but not persisted yet (per your requirement)
        // audio_path: audioPath,
      })
      .select('id, channel_id, message_content, uid, created_at')
      .maybeSingle();

    if (insertError) {
      return jsonErr('9000', `Failed to commit message: ${insertError.message}`, 500);
    }

    // Delete pending row (cleanup)
    const { error: deleteError } = await supabase
      .from('pending_messages')
      .delete()
      .eq('id', pendingId);
    if (deleteError) {
      // For now, still return success (message was committed); cleanup can be retried later.
      // But include a hint in server logs.
      console.warn('Failed to delete pending_messages row:', deleteError);
    }

    // Broadcast last message update to inbox:{user_id} for channel members
    try {
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

      /**
       * @typedef {Object} ChatChannelRow
       * @property {number} id - 頻道 ID (chat_channels.id)
       * @property {string} channel_type - 頻道類型 (chat_channels.channel_type)
       */
      /** @type {{ data: ChatChannelRow | null, error: any }} */
      // 取得頻道資訊
      const { data: channel, error: channelError } = await serviceClient
        .from('chat_channels')
        .select('id, channel_type')
        .eq('id', pending.channel_id)
        .maybeSingle();

      if (channelError || !channel) {
        console.warn('Failed to fetch channel info for broadcast:', channelError);
        return;
      }

      /**
       * @typedef {Object} ChannelUserRow
       * @property {string} uid - 使用者 UUID (channel_users.uid)
       */
      /** @type {{ data: ChannelUserRow[] | null, error: any }} */
      // 取得頻道中的所有使用者
      const { data: channelUsers, error: usersError } = await serviceClient
        .from('channel_users')
        .select('uid')
        .eq('channel_id', pending.channel_id);

      if (usersError || !channelUsers) {
        console.warn('Failed to fetch channel users for broadcast:', usersError);
        return;
      }

      /**
       * @typedef {Object} UserProfileRow
       * @property {string} uid - 使用者 UUID (user_profile.uid)
       * @property {string|null} name - 使用者名稱 (user_profile.name)
       * @property {string|null} custom_user_id - 自訂使用者 ID (user_profile.custom_user_id)
       * @property {string|null} image_url - 頭像 URL (user_profile.image_url)
       */
      /** @type {{ data: UserProfileRow[] | null, error: any }} */
      // 取得使用者詳細資訊
      const userIds = channelUsers.map((cu) => cu.uid);
      const { data: userProfiles } = await serviceClient
        .from('user_profile')
        .select('uid, name, custom_user_id, image_url')
        .in('uid', userIds);

      const users =
        userProfiles?.map((profile) => ({
          id: profile.uid,
          nickname: profile.name || profile.custom_user_id || 'Unknown User',
          avatar_url: profile.image_url || null,
        })) || [];

      const payload = {
        id: channel.id,
        channel_type: channel.channel_type,
        users: users,
        last_message: inserted
          ? {
              id: inserted.id,
              uid: inserted.uid,
              message_content: inserted.message_content,
              created_at: inserted.created_at,
            }
          : null,
        unread_count: 0,
      };

      await Promise.all(
        channelUsers.map((m) =>
          serviceClient.channel(`inbox:${m.uid}`).send({
            type: 'broadcast',
            event: 'channel_lst_msg_update',
            payload,
          })
        )
      );
    } catch (broadcastError) {
      console.warn('Failed to broadcast channel last message:', broadcastError);
    }

    return jsonOk({
      status: 'success',
      is_correct: true,
      // accepted but not validated/persisted yet
      ...(audioPath ? { audio_path: audioPath } : {}),
      message_record: {
        id: inserted?.id ?? null,
        channel_id: inserted?.channel_id ?? pending.channel_id,
        content: inserted?.message_content ?? pending.content,
        created_at: inserted?.created_at ?? now,
      },
    });
  } catch (error) {
    return jsonErr('9000', error instanceof Error ? error.message : 'Unknown error', 500);
  }
});
