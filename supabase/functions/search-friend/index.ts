// 搜尋好友 Edge Function
// 根據 user_id 或 email 搜尋使用者，並回傳關係狀態

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
    const { query } = await req.json();

    if (!query) {
      return jsonErr('1100', 'query is required', 400);
    }

    // 搜尋使用者 (根據 uid 或 email)
    // 先嘗試從 auth.users 搜尋 email
    /** @type {{ id: string; nickname: string } | null} */
    let targetUser: { id: string; nickname: string } | null = null;
    /** @type {string | null} */
    let targetUserId: string | null = null;

    // 檢查是否為 UUID (可能是 user_id)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(query)) {
      /**
       * @typedef {Object} UserProfileRow
       * @property {string} uid - 使用者 UUID (user_profile.uid)
       * @property {string|null} name - 使用者名稱 (user_profile.name)
       * @property {string|null} custom_user_id - 自訂使用者 ID (user_profile.custom_user_id)
       * @property {string|null} image_url - 頭像 URL (user_profile.image_url)
       */
      /** @type {{ data: UserProfileRow | null, error: any }} */
      // 可能是 UUID，直接查詢 user_profile
      const { data: profile, error: profileError } = await supabase
        .from('user_profile')
        .select('uid, name, custom_user_id, image_url')
        .eq('uid', query)
        .single();

      if (!profileError && profile) {
        targetUserId = profile.uid;
        targetUser = {
          id: profile.uid,
          nickname: profile.name || profile.custom_user_id || 'Unknown',
        };
      }
    } else {
      /**
       * @typedef {Object} UserProfileRow
       * @property {string} uid - 使用者 UUID (user_profile.uid)
       * @property {string|null} name - 使用者名稱 (user_profile.name)
       * @property {string|null} custom_user_id - 自訂使用者 ID (user_profile.custom_user_id)
       * @property {string|null} image_url - 頭像 URL (user_profile.image_url)
       */
      /** @type {{ data: UserProfileRow[] | null, error: any }} */
      // 可能是 email，從 auth.users 查詢
      // 注意: Supabase 不直接提供查詢 auth.users 的 API，需要透過 user_profile 的 email 欄位
      // 假設 user_profile 有 email 欄位，或需要透過其他方式查詢
      // 這裡先假設可以透過 custom_user_id 或 name 搜尋
      const { data: profiles, error: profileError } = await supabase
        .from('user_profile')
        .select('uid, name, custom_user_id, image_url')
        .or(`name.ilike.%${query}%,custom_user_id.ilike.%${query}%`)
        .limit(1);

      if (!profileError && profiles && profiles.length > 0) {
        const profile = profiles[0];
        targetUserId = profile.uid;
        targetUser = {
          id: profile.uid,
          nickname: profile.name || profile.custom_user_id || 'Unknown',
        };
      }
    }

    if (!targetUser || !targetUserId) {
      return jsonErr('1404', 'User not found', 404);
    }

    // 不能搜尋自己
    if (targetUserId === currentUserId) {
      return jsonErr('1100', 'Cannot search yourself', 400);
    }

    // 查詢關係狀態
    // friendships 表使用 user_one_id 和 user_two_id，需要檢查兩個方向
    // 為了保持一致性，總是將較小的 user_id 放在 user_one_id
    const userId1 = currentUserId < targetUserId ? currentUserId : targetUserId;
    const userId2 = currentUserId < targetUserId ? targetUserId : currentUserId;

    /**
     * @typedef {Object} FriendshipRow
     * @property {string} status - 關係狀態 (friendships.status: 'pending' | 'friend' | 'blocked')
     * @property {string} user_one_id - 使用者一 UUID (friendships.user_one_id)
     * @property {string} user_two_id - 使用者二 UUID (friendships.user_two_id)
     */
    /** @type {{ data: FriendshipRow | null, error: any }} */
    const { data: friendship, error: friendshipError } = await supabase
      .from('friendships')
      .select('status, user_one_id, user_two_id')
      .eq('user_one_id', userId1)
      .eq('user_two_id', userId2)
      .maybeSingle();

    let relationshipStatus = 'none';

    if (!friendshipError && friendship) {
      const status = friendship.status;

      // 判斷關係狀態
      if (status === 'blocked') {
        relationshipStatus = 'blocked';
      } else if (status === 'friend') {
        relationshipStatus = 'friend';
      } else if (status === 'pending') {
        // 判斷是 pending_sent 還是 pending_received
        // 由於我們已經排序了 user_one_id 和 user_two_id，需要檢查原始順序
        const originalUserOne = currentUserId < targetUserId ? currentUserId : targetUserId;
        if (originalUserOne === currentUserId) {
          relationshipStatus = 'pending_sent';
        } else {
          relationshipStatus = 'pending_received';
        }
      }
    }

    return jsonOk({
      user: targetUser,
      relationship_status: relationshipStatus,
    });
  } catch (error) {
    return jsonErr('9000', error instanceof Error ? error.message : 'Unknown error', 500);
  }
});
