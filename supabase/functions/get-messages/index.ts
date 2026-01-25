// get-messages Edge Function
// - Keyset pagination (DESC): fetch newest -> older by `id` descending
// - cursor is the last seen message `id` from previous page

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { jsonErr, jsonOk } from '../_shared/responses.ts';

const PAGE_SIZE = 10;

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
    const roomId = body?.room_id;
    const cursor = body?.cursor; // last message id (number) from previous page

    if (!roomId || (typeof roomId !== 'string' && typeof roomId !== 'number')) {
      return jsonErr('1100', 'room_id is required (string|number)', 400);
    }

    /**
     * @typedef {Object} ChatMessageRow
     * @property {number} id - 訊息 ID (chat_messages.id)
     * @property {number} channel_id - 頻道 ID (chat_messages.channel_id)
     * @property {string} uid - 發送者 UUID (chat_messages.uid)
     * @property {string} message_content - 訊息內容 (chat_messages.message_content)
     * @property {number} created_at - 建立時間戳（毫秒）(chat_messages.created_at)
     */
    /** @type {{ data: ChatMessageRow[] | null, error: any }} */
    let q = supabase
      .from('chat_messages')
      .select('id, channel_id, uid, message_content, created_at')
      .eq('channel_id', roomId)
      .order('id', { ascending: false })
      .limit(PAGE_SIZE);

    if (cursor !== undefined && cursor !== null && cursor !== '') {
      const cursorNum = Number(cursor);
      if (!Number.isFinite(cursorNum)) {
        return jsonErr('1100', 'cursor must be a number (message id)', 400);
      }
      // Keyset: fetch older than last seen
      q = q.lt('id', cursorNum);
    }

    const { data: rows, error: msgError } = await q;
    if (msgError) {
      return jsonErr('9000', `Failed to fetch messages: ${msgError.message}`, 500);
    }

    const messagesRaw = rows || [];
    if (messagesRaw.length === 0) {
      return jsonOk({ messages: [], cursor: null });
    }

    // 取得頻道類型以判斷是否為一對一聊天
    /**
     * @typedef {Object} ChatChannelRow
     * @property {string} channel_type - 頻道類型 (chat_channels.channel_type)
     */
    /** @type {{ data: ChatChannelRow | null, error: any }} */
    const { data: channel, error: channelError } = await supabase
      .from('chat_channels')
      .select('channel_type')
      .eq('id', roomId)
      .maybeSingle();

    if (channelError) {
      return jsonErr('9000', `Failed to fetch channel info: ${channelError.message}`, 500);
    }

    const isDirectChat = channel?.channel_type === 'direct' || channel?.channel_type === 'personal';

    /**
     * @typedef {Object} UserProfileRow
     * @property {string} uid - 使用者 UUID (user_profile.uid)
     * @property {string|null} name - 使用者名稱 (user_profile.name)
     * @property {string|null} custom_user_id - 自訂使用者 ID (user_profile.custom_user_id)
     * @property {string|null} image_url - 頭像 URL (user_profile.image_url)
     */
    /** @type {{ data: UserProfileRow[] | null, error: any }} */
    // Fetch sender profiles for display
    const senderUids = Array.from(new Set(messagesRaw.map((m) => m.uid).filter(Boolean)));
    const { data: profiles, error: profError } = await supabase
      .from('user_profile')
      .select('uid, name, custom_user_id, image_url')
      .in('uid', senderUids);

    if (profError) {
      return jsonErr('9000', `Failed to fetch sender profiles: ${profError.message}`, 500);
    }

    const profileMap = new Map();
    (profiles || []).forEach((p) => profileMap.set(p.uid, p));

    // 取得所有訊息的已讀數量
    const messageIds = messagesRaw.map((m) => m.id);
    /**
     * @typedef {Object} MessageReadRow
     * @property {number} message_id - 訊息 ID (message_reads.message_id)
     */
     /** @type {{ data: MessageReadRow[] | null, error: any }} */
    const { data: reads, error: readsError } = await supabase
      .from('message_reads')
      .select('message_id')
      .in('message_id', messageIds);

    if (readsError) {
      return jsonErr('9000', `Failed to fetch read counts: ${readsError.message}`, 500);
    }

    // 計算每個訊息的已讀數量
    const readCountMap = new Map<number, number>();
    (reads || []).forEach((r) => {
      const count = readCountMap.get(r.message_id) || 0;
      readCountMap.set(r.message_id, count + 1);
    });

    const messages = messagesRaw.map((m) => {
      const p = profileMap.get(m.uid);
      // 對於一對一聊天，已讀數量固定為 1（對方）
      // 對於群組聊天，顯示實際已讀數量
      const readCount = isDirectChat ? 1 : (readCountMap.get(m.id) || 0);
      
      return {
        id: m.id,
        sender: {
          id: m.uid,
          nickname: p?.name || p?.custom_user_id || 'Unknown',
          avatar_url: p?.image_url || null,
        },
        content: m.message_content || '',
        msg_type: 'text',
        created_at: m.created_at,
        read_count: readCount,
      };
    });

    const nextCursor = messagesRaw[messagesRaw.length - 1]?.id ?? null;
    return jsonOk({ messages, cursor: nextCursor });
  } catch (error) {
    return jsonErr('9000', error instanceof Error ? error.message : 'Unknown error', 500);
  }
});
