// 取得使用者所有的聊天頻道 Edge Function
// 回傳當前使用者參與的所有頻道列表

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
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

    /**
     * @typedef {Object} ChannelUserRow
     * @property {number} channel_id - 頻道 ID (channel_users.channel_id)
     */
    /** @type {{ data: ChannelUserRow[] | null, error: any }} */
    // 查詢使用者參與的所有頻道
    // 透過 channel_users 表找到所有 channel_id，然後取得頻道資訊
    const { data: userChannels, error: channelUsersError } = await supabase
      .from('channel_users')
      .select('channel_id')
      .eq('uid', currentUserId);

    if (channelUsersError) {
      return jsonErr('9000', 'Failed to fetch user channels', 500);
    }

    if (!userChannels || userChannels.length === 0) {
      return jsonOk({ channels: [] });
    }

    // 取得所有頻道 ID
    const channelIds = userChannels.map((uc) => uc.channel_id);

    /**
     * @typedef {Object} ChatChannelRow
     * @property {number} id - 頻道 ID (chat_channels.id)
     * @property {string} channel_type - 頻道類型 (chat_channels.channel_type)
     */
    /** @type {{ data: ChatChannelRow[] | null, error: any }} */
    // 查詢頻道詳細資訊
    const { data: channels, error: channelsError } = await supabase
      .from('chat_channels')
      .select('id, channel_type')
      .in('id', channelIds)
      .order('id', { ascending: false });

    if (channelsError) {
      return jsonErr('9000', 'Failed to fetch channels', 500);
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
    // 取得每個頻道的最新訊息（一次查回來再做 mapping）
    // NOTE: 這裡假設 chat_messages.created_at 可排序（timestamp 或可比較字串）
    const { data: latestMessages, error: latestError } = await supabase
      .from('chat_messages')
      .select('id, channel_id, uid, message_content, created_at')
      .in('channel_id', channelIds)
      .order('created_at', { ascending: false })
      .limit(5000);

    if (latestError) {
      return jsonErr('9000', `Failed to fetch latest messages: ${latestError.message}`, 500);
    }

    const latestByChannel = new Map();
    (latestMessages || []).forEach((m) => {
      // first one per channel wins because sorted desc
      if (!latestByChannel.has(m.channel_id)) {
        latestByChannel.set(m.channel_id, m);
      }
    });

    // 為每個頻道取得參與的使用者資訊
    const channelsWithUsers = await Promise.all(
      (channels || []).map(async (channel) => {
        /**
         * @typedef {Object} ChannelUserMemberRow
         * @property {string} uid - 使用者 UUID (channel_users.uid)
         */
        /** @type {{ data: ChannelUserMemberRow[] | null, error: any }} */
        // 取得頻道中的所有使用者
        const { data: channelUsers, error: usersError } = await supabase
          .from('channel_users')
          .select('uid')
          .eq('channel_id', channel.id);

        if (usersError || !channelUsers) {
          return {
            id: channel.id,
            channel_type: channel.channel_type,
            users: [],
          };
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
        const { data: userProfiles, error: profilesError } = await supabase
          .from('user_profile')
          .select('uid, name, custom_user_id, image_url')
          .in('uid', userIds);

        const users =
          userProfiles?.map((profile) => ({
            id: profile.uid,
            nickname: profile.name || profile.custom_user_id || 'Unknown User',
            image_url: profile.image_url || null,
          })) || [];

        return {
          id: channel.id,
          channel_type: channel.channel_type,
          users: users,
          last_message: latestByChannel.get(channel.id)
            ? {
                id: latestByChannel.get(channel.id).id,
                uid: latestByChannel.get(channel.id).uid,
                message_content: latestByChannel.get(channel.id).message_content,
                created_at: latestByChannel.get(channel.id).created_at,
              }
            : null,
        };
      })
    );

    return jsonOk({ channels: channelsWithUsers });
  } catch (error) {
    return jsonErr('9000', error instanceof Error ? error.message : 'Unknown error', 500);
  }
});
