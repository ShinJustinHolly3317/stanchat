// 發送好友邀請 Edge Function
// 發送好友邀請給目標使用者

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

    // 解析請求 body
    const { target_user_id } = await req.json();

    if (!target_user_id) {
      return new Response(JSON.stringify({ error: 'target_user_id is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // 不能邀請自己
    if (target_user_id === currentUserId) {
      return new Response(JSON.stringify({ error: 'Cannot send invitation to yourself' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // 檢查目標使用者是否存在
    const { data: targetProfile, error: profileError } = await supabase
      .from('user_profile')
      .select('uid')
      .eq('uid', target_user_id)
      .single();

    if (profileError || !targetProfile) {
      return new Response(JSON.stringify({ error: 'Target user not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      });
    }

    // 檢查是否已有關係
    // friendships 表使用 user_one_id 和 user_two_id，需要檢查兩個方向
    // 為了保持一致性，總是將較小的 user_id 放在 user_one_id
    const userId1 = currentUserId < target_user_id ? currentUserId : target_user_id;
    const userId2 = currentUserId < target_user_id ? target_user_id : currentUserId;

    const { data: existingFriendship, error: friendshipError } = await supabase
      .from('friendships')
      .select('status, user_one_id, user_two_id')
      .eq('user_one_id', userId1)
      .eq('user_two_id', userId2)
      .maybeSingle();

    if (friendshipError) {
      return new Response(JSON.stringify({ error: 'Failed to check existing friendship' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    // 如果已經有關係，檢查狀態
    if (existingFriendship) {
      if (existingFriendship.status === 'friend') {
        return new Response(JSON.stringify({ error: 'Already friends' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      if (existingFriendship.status === 'pending') {
        // 檢查是誰發送的邀請
        if (existingFriendship.user_one_id === currentUserId) {
          return new Response(JSON.stringify({ error: 'Invitation already sent' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          });
        } else {
          return new Response(JSON.stringify({ error: 'You have a pending invitation from this user' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          });
        }
      }

      if (existingFriendship.status === 'blocked') {
        return new Response(JSON.stringify({ error: 'Cannot send invitation to blocked user' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }
    }

    // 建立或更新 friendship 記錄
    const now = Math.floor(Date.now() / 1000); // Unix timestamp in seconds

    let result;
    if (existingFriendship) {
      // 更新現有記錄
      result = await supabase
        .from('friendships')
        .update({
          status: 'pending',
          user_one_id: userId1, // 確保順序一致
          user_two_id: userId2,
          updated_at: now,
        })
        .eq('user_one_id', userId1)
        .eq('user_two_id', userId2);
    } else {
      // 建立新記錄
      result = await supabase.from('friendships').insert({
        user_one_id: userId1,
        user_two_id: userId2,
        status: 'pending',
        created_at: now,
        updated_at: now,
      });
    }

    if (result.error) {
      return new Response(JSON.stringify({ error: 'Failed to send invitation' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    // 發送 Realtime 通知給目標使用者
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    await serviceClient.channel(`inbox:${target_user_id}`).send({
      type: 'broadcast',
      event: 'friend_invitation',
      payload: {
        from_user_id: currentUserId,
        timestamp: new Date().toISOString(),
      },
    });

    return new Response(
      JSON.stringify({
        status: 'success',
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
