// 取得所有好友 Edge Function
// 回傳當前使用者的所有好友列表

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  // 處理 CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 取得認證資訊
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
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
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const currentUserId = user.id;

    // 查詢所有好友關係
    // friendships 表中，status = 'friend' 且 (user_one_id = currentUserId OR user_two_id = currentUserId)
    const { data: friendships, error: friendshipsError } = await supabase
      .from('friendships')
      .select('user_one_id, user_two_id, created_at, updated_at')
      .eq('status', 'friend')
      .or(`user_one_id.eq.${currentUserId},user_two_id.eq.${currentUserId}`)
      .order('updated_at', { ascending: false });

    if (friendshipsError) {
      return new Response(JSON.stringify({ error: 'Failed to fetch friends' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    if (!friendships || friendships.length === 0) {
      return new Response(
        JSON.stringify({
          friends: [],
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // 取得所有好友的 user_id（排除當前使用者）
    const friendIds = friendships.map((friendship) => {
      return friendship.user_one_id === currentUserId
        ? friendship.user_two_id
        : friendship.user_one_id;
    });

    // 取得好友的使用者資訊
    const { data: userProfiles, error: profilesError } = await supabase
      .from('user_profile')
      .select('uid, name, custom_user_id, image_url')
      .in('uid', friendIds);

    if (profilesError) {
      return new Response(JSON.stringify({ error: 'Failed to fetch user profiles' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
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
          image_url: profile.image_url || null,
          friendship_created_at: friendship?.created_at || null,
          friendship_updated_at: friendship?.updated_at || null,
        };
      }) || [];

    return new Response(
      JSON.stringify({
        friends: friends,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
