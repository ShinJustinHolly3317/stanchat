// mark-read Edge Function
// - Mark messages as read when user views them in a channel
// - Supports marking specific messages or all messages in a channel

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

    const currentUserId = user.id;
    const body = await req.json();
    const channelId = body?.channel_id;
    const messageIds = body?.message_ids; // optional array of message IDs

    if (!channelId || (typeof channelId !== 'string' && typeof channelId !== 'number')) {
      return jsonErr('1100', 'channel_id is required (string|number)', 400);
    }

    // 驗證使用者是頻道成員
    /**
     * @typedef {Object} ChannelUserRow
     * @property {number} channel_id - 頻道 ID (channel_users.channel_id)
     */
    /** @type {{ data: ChannelUserRow[] | null, error: any }} */
    const { data: channelUser, error: channelUserError } = await supabase
      .from('channel_users')
      .select('channel_id')
      .eq('channel_id', channelId)
      .eq('uid', currentUserId)
      .maybeSingle();

    if (channelUserError) {
      return jsonErr('9000', `Failed to verify channel membership: ${channelUserError.message}`, 500);
    }

    if (!channelUser) {
      return jsonErr('1004', 'Forbidden: User is not a member of this channel', 403);
    }

    const now = Date.now();

    if (messageIds && Array.isArray(messageIds) && messageIds.length > 0) {
      // 標記指定的訊息為已讀
      const validMessageIds = messageIds
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0);

      if (validMessageIds.length === 0) {
        return jsonErr('1100', 'message_ids must be an array of valid numbers', 400);
      }

      // 批次插入，使用 ON CONFLICT DO NOTHING 避免重複
      const readsToInsert = validMessageIds.map((messageId) => ({
        message_id: messageId,
        uid: currentUserId,
        read_at: now,
      }));

      const { error: insertError } = await supabase
        .from('message_reads')
        .insert(readsToInsert)
        .select();

      if (insertError) {
        // 如果是 unique constraint violation，忽略（已經讀過）
        if (insertError.code === '23505') {
          // PostgreSQL unique constraint violation
          return jsonOk({ marked_count: validMessageIds.length });
        }
        return jsonErr('9000', `Failed to mark messages as read: ${insertError.message}`, 500);
      }

      return jsonOk({ marked_count: validMessageIds.length });
    } else {
      // 標記頻道中所有訊息為已讀（排除自己發送的訊息）
      /**
       * @typedef {Object} ChatMessageRow
       * @property {number} id - 訊息 ID (chat_messages.id)
       */
      /** @type {{ data: ChatMessageRow[] | null, error: any }} */
      const { data: messages, error: messagesError } = await supabase
        .from('chat_messages')
        .select('id')
        .eq('channel_id', channelId)
        .neq('uid', currentUserId); // 排除自己發送的訊息

      if (messagesError) {
        return jsonErr('9000', `Failed to fetch messages: ${messagesError.message}`, 500);
      }

      if (!messages || messages.length === 0) {
        return jsonOk({ marked_count: 0 });
      }

      // 取得已經讀過的訊息 ID
      const messageIdsToMark = messages.map((m) => m.id);
      /**
       * @typedef {Object} MessageReadRow
       * @property {number} message_id - 訊息 ID (message_reads.message_id)
       */
      /** @type {{ data: MessageReadRow[] | null, error: any }} */
      const { data: existingReads, error: readsError } = await supabase
        .from('message_reads')
        .select('message_id')
        .eq('uid', currentUserId)
        .in('message_id', messageIdsToMark);

      if (readsError) {
        return jsonErr('9000', `Failed to check existing reads: ${readsError.message}`, 500);
      }

      const existingReadIds = new Set((existingReads || []).map((r) => r.message_id));
      const newReads = messageIdsToMark
        .filter((id) => !existingReadIds.has(id))
        .map((messageId) => ({
          message_id: messageId,
          uid: currentUserId,
          read_at: now,
        }));

      if (newReads.length === 0) {
        return jsonOk({ marked_count: 0 });
      }

      const { error: insertError } = await supabase.from('message_reads').insert(newReads);

      if (insertError) {
        return jsonErr('9000', `Failed to mark messages as read: ${insertError.message}`, 500);
      }

      return jsonOk({ marked_count: newReads.length });
    }
  } catch (error) {
    return jsonErr('9000', error instanceof Error ? error.message : 'Unknown error', 500);
  }
});
