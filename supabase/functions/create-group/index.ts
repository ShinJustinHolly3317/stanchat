// 建立群組頻道 Edge Function
// 僅建立群組，不處理邀請接受、管理員、退群等

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.8';
import { corsHeaders } from '../_shared/cors.ts';
import { jsonErr, jsonOk } from '../_shared/responses.ts';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(s: string): boolean {
  return typeof s === 'string' && UUID_REGEX.test(s);
}

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

    const body = await req.json().catch(() => ({}));
    const name = body?.channel_name != null ? String(body.channel_name).trim() || null : null;
    const memberIdsRaw = body?.member_ids;

    if (!Array.isArray(memberIdsRaw) || memberIdsRaw.length === 0) {
      return jsonErr('1100', 'member_ids is required (non-empty array of UUIDs)', 400);
    }

    const memberIds = [...new Set(memberIdsRaw)].filter(
      (id): id is string => typeof id === 'string' && isValidUuid(id)
    );

    if (memberIds.length === 0) {
      return jsonErr('1100', 'member_ids must contain at least one valid UUID', 400);
    }

    /**
     * @typedef {Object} FriendshipRow
     * @property {string} user_one_id
     * @property {string} user_two_id
     */
    /** @type {{ data: FriendshipRow[] | null, error: any }} */
    const { data: friendships, error: friendshipsError } = await supabase
      .from('friendships')
      .select('user_one_id, user_two_id')
      .eq('status', 'friend')
      .or(`user_one_id.eq.${currentUserId},user_two_id.eq.${currentUserId}`);

    if (friendshipsError) {
      return jsonErr('9000', `Failed to fetch friends: ${friendshipsError.message}`, 500);
    }

    const friendIds = new Set(
      (friendships || []).map((f) =>
        f.user_one_id === currentUserId ? f.user_two_id : f.user_one_id
      )
    );

    const notFriends = memberIds.filter((id) => !friendIds.has(id));
    if (notFriends.length > 0) {
      return jsonErr('1004', 'All members must be accepted friends', 403);
    }

    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    /**
     * @typedef {Object} ChatChannelRow
     * @property {number} id - 頻道 ID
     */
    /** @type {{ data: ChatChannelRow | null, error: any }} */
    const insertChannelPayload: { channel_type: string; name?: string } = {
      channel_type: 'group',
    };
    if (name != null) {
      insertChannelPayload.name = name || '預設群組名稱';
    } else {
      insertChannelPayload.name = '預設群組名稱';
    }

    const { data: channel, error: channelError } = await serviceClient
      .from('chat_channels')
      .insert(insertChannelPayload)
      .select('id')
      .single();

    if (channelError || !channel) {
      return jsonErr('9000', `Failed to create channel: ${channelError?.message ?? 'unknown'}`, 500);
    }

    const allUids = [currentUserId, ...memberIds];
    const uniqueUids = [...new Set(allUids)];

    const channelUserRows = uniqueUids.map((uid) => ({
      channel_id: channel.id,
      uid,
    }));

    const { error: insertUsersError } = await serviceClient
      .from('channel_users')
      .insert(channelUserRows);

    if (insertUsersError) {
      return jsonErr(
        '9000',
        `Failed to add channel members: ${insertUsersError.message}`,
        500
      );
    }

    // Broadcast channel creation to all members
    try {
      /**
       * @typedef {Object} ChannelUserRow
       * @property {string} uid - 使用者 UUID (channel_users.uid)
       */
      /** @type {{ data: ChannelUserRow[] | null, error: any }} */
      // 取得頻道中的所有使用者
      const { data: channelUsers, error: usersError } = await serviceClient
        .from('channel_users')
        .select('uid')
        .eq('channel_id', channel.id);

      if (usersError || !channelUsers) {
        console.warn('Failed to fetch channel users for broadcast:', usersError);
      } else {
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
          channel_type: 'group',
          channel_name: name || '預設群組名稱',
          users: users,
          last_message: null, // 新建立的頻道沒有訊息
          unread_count: 0,
        };

        await Promise.all(
          channelUsers.map((m) =>
            serviceClient.channel(`channel_lst_msg:${m.uid}`).send({
              type: 'broadcast',
              event: 'channel_lst_msg_update',
              payload,
            })
          )
        );
      }
    } catch (broadcastError) {
      console.warn('Failed to broadcast channel creation:', broadcastError);
    }

    return jsonOk({ channel_id: channel.id });
  } catch (error) {
    return jsonErr('9000', error instanceof Error ? error.message : 'Unknown error', 500);
  }
});
