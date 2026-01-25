// 取得所有好友 Edge Function
// 回傳當前使用者的所有好友列表

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

    /**
     * @typedef {Object} FriendshipRow
     * @property {string} user_one_id - 使用者一 UUID (friendships.user_one_id)
     * @property {string} user_two_id - 使用者二 UUID (friendships.user_two_id)
     * @property {number} created_at - 建立時間戳（毫秒）(friendships.created_at)
     * @property {number} updated_at - 更新時間戳（毫秒）(friendships.updated_at)
     */
    /** @type {{ data: FriendshipRow[] | null, error: any }} */
    // 查詢所有好友關係
    // friendships 表中，status = 'friend' 且 (user_one_id = currentUserId OR user_two_id = currentUserId)
    const { data: friendships, error: friendshipsError } = await supabase
      .from('friendships')
      .select('user_one_id, user_two_id, created_at, updated_at')
      .eq('status', 'friend')
      .or(`user_one_id.eq.${currentUserId},user_two_id.eq.${currentUserId}`)
      .order('updated_at', { ascending: false });

    if (friendshipsError) {
      return jsonErr('9000', 'Failed to fetch friends', 500);
    }

    if (!friendships || friendships.length === 0) {
      return jsonOk({ friends: [] });
    }

    // 取得所有好友的 user_id（排除當前使用者）
    const friendIds = friendships.map((friendship) => {
      return friendship.user_one_id === currentUserId
        ? friendship.user_two_id
        : friendship.user_one_id;
    });

    /**
     * @typedef {Object} UserProfileRow
     * @property {string} uid - 使用者 UUID (user_profile.uid)
     * @property {string|null} name - 使用者名稱 (user_profile.name)
     * @property {string|null} custom_user_id - 自訂使用者 ID (user_profile.custom_user_id)
     * @property {string|null} image_url - 頭像 URL (user_profile.image_url)
     */
    /** @type {{ data: UserProfileRow[] | null, error: any }} */
    // 取得好友的使用者資訊
    const { data: userProfiles, error: profilesError } = await supabase
      .from('user_profile')
      .select('uid, name, custom_user_id, image_url')
      .in('uid', friendIds);

    if (profilesError) {
      return jsonErr('9000', 'Failed to fetch user profiles', 500);
    }

    // 建立 user_id 到 friendship 的映射（用於取得建立時間）
    const friendshipMap = new Map();
    friendships.forEach((friendship) => {
      const friendId =
        friendship.user_one_id === currentUserId ? friendship.user_two_id : friendship.user_one_id;
      friendshipMap.set(friendId, friendship);
    });

    // 組合好友資料
    const friends =
      userProfiles?.map((profile) => {
        const friendship = friendshipMap.get(profile.uid);
        return {
          user_id: profile.uid,
          nickname: profile.name || profile.custom_user_id || 'Unknown User',
          avatar_url: profile.image_url || null,
          friendship_created_at: friendship?.created_at || null,
          friendship_updated_at: friendship?.updated_at || null,
        };
      }) || [];

    return jsonOk({ friends: friends });
  } catch (error) {
    return jsonErr('9000', error instanceof Error ? error.message : 'Unknown error', 500);
  }
});
