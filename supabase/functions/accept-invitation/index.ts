// 接受/拒絕好友邀請 Edge Function
// 處理好友邀請的接受或拒絕

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
    const { request_id, action } = await req.json();

    if (!request_id) {
      return new Response(JSON.stringify({ error: 'request_id is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    if (!action || (action !== 'accept' && action !== 'decline')) {
      return new Response(JSON.stringify({ error: 'action must be "accept" or "decline"' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // 查詢邀請記錄
    // request_id 可能是 friendship 的 id 或其他識別碼
    // 這裡假設 request_id 是發送邀請的使用者 ID
    // 或者可以建立一個 friend_requests 表來追蹤邀請
    // 目前使用 friendships 表，request_id 應該是對方的 user_id

    const targetUserId = request_id;

    // 檢查目標使用者是否存在
    const { data: targetProfile, error: profileError } = await supabase
      .from('user_profile')
      .select('uid')
      .eq('uid', targetUserId)
      .single();

    if (profileError || !targetProfile) {
      return new Response(JSON.stringify({ error: 'Target user not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      });
    }

    // 查詢 friendship 記錄
    // 確保 currentUserId 是接收方 (user_two_id)
    const userId1 = targetUserId < currentUserId ? targetUserId : currentUserId;
    const userId2 = targetUserId < currentUserId ? currentUserId : targetUserId;

    const { data: friendship, error: friendshipError } = await supabase
      .from('friendships')
      .select('status, user_one_id, user_two_id')
      .eq('user_one_id', userId1)
      .eq('user_two_id', userId2)
      .maybeSingle();

    if (friendshipError) {
      return new Response(JSON.stringify({ error: 'Failed to check friendship' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    if (!friendship) {
      return new Response(JSON.stringify({ error: 'Invitation not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      });
    }

    // 驗證這是待處理的邀請，且當前使用者是接收方
    if (friendship.status !== 'pending') {
      return new Response(JSON.stringify({ error: 'Invitation is not pending' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // 確認當前使用者是接收方 (user_two_id 應該是 currentUserId)
    if (friendship.user_one_id !== targetUserId || friendship.user_two_id !== currentUserId) {
      return new Response(
        JSON.stringify({ error: 'You are not the recipient of this invitation' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        }
      );
    }

    const now = Math.floor(Date.now() / 1000); // Unix timestamp in seconds
    let roomId = null;

    if (action === 'accept') {
      // 接受邀請：更新狀態為 friend
      const { error: updateError } = await supabase
        .from('friendships')
        .update({
          status: 'friend',
          updated_at: now,
        })
        .eq('user_one_id', userId1)
        .eq('user_two_id', userId2);

      if (updateError) {
        return new Response(JSON.stringify({ error: 'Failed to accept invitation' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      // 建立聊天室 (如果需要)
      // 這裡假設 chat_channels 表存在，且 channel_type 有 'direct' 選項
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

      // 建立 direct message channel
      const { data: channel, error: channelError } = await serviceClient
        .from('chat_channels')
        .insert({
          channel_type: 'direct',
        })
        .select('id')
        .single();

      if (!channelError && channel) {
        roomId = channel.id.toString();

        // 將兩個使用者加入 channel
        await serviceClient.from('channel_users').insert([
          { channel_id: channel.id, uid: currentUserId },
          { channel_id: channel.id, uid: targetUserId },
        ]);

        // 發送通知給發送邀請的使用者
        await serviceClient.channel(`user:${targetUserId}`).send({
          type: 'broadcast',
          event: 'friend_request_accepted',
          payload: {
            from_user_id: currentUserId,
            room_id: roomId,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } else {
      // 拒絕邀請：刪除記錄或更新狀態
      const { error: deleteError } = await supabase
        .from('friendships')
        .delete()
        .eq('user_one_id', userId1)
        .eq('user_two_id', userId2);

      if (deleteError) {
        return new Response(JSON.stringify({ error: 'Failed to decline invitation' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      // 發送通知給發送邀請的使用者
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

      await serviceClient.channel(`user:${targetUserId}`).send({
        type: 'broadcast',
        event: 'friend_request_declined',
        payload: {
          from_user_id: currentUserId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    return new Response(
      JSON.stringify({
        status: 'success',
        ...(roomId && { room_id: roomId }),
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
