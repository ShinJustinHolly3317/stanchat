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
    // 由於記錄是排序的（較小的 ID 在 user_one_id），需要檢查兩個方向
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

    // 確認當前使用者是接收方
    // 由於記錄是排序的（較小的 ID 在 user_one_id），接收方可能是 user_one_id 或 user_two_id
    // 發送者是 targetUserId，接收者是 currentUserId
    const isCurrentUserReceiver =
      (friendship.user_one_id === currentUserId && friendship.user_two_id === targetUserId) ||
      (friendship.user_one_id === targetUserId && friendship.user_two_id === currentUserId);

    if (!isCurrentUserReceiver) {
      return new Response(
        JSON.stringify({ error: 'You are not the recipient of this invitation' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        }
      );
    }

    const now = new Date().toISOString(); // ISO 8601 timestamp
    let roomId = null;

    if (action === 'accept') {
      // 接受邀請：更新狀態為 friend
      // 使用 friendship 記錄中的實際 ID 來更新（確保匹配）
      console.log('Updating friendship:', {
        friendship_user_one: friendship.user_one_id,
        friendship_user_two: friendship.user_two_id,
        friendship_status: friendship.status,
        userId1,
        userId2,
        currentUserId,
        targetUserId,
      });

      // 先確認記錄仍然存在且狀態為 pending
      const { data: verifyFriendship, error: verifyError } = await supabase
        .from('friendships')
        .select('user_one_id, user_two_id, status')
        .eq('user_one_id', friendship.user_one_id)
        .eq('user_two_id', friendship.user_two_id)
        .eq('status', 'pending')
        .maybeSingle();

      if (verifyError) {
        console.error('Verify error:', verifyError);
        return new Response(
          JSON.stringify({ error: `Failed to verify invitation: ${verifyError.message}` }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          }
        );
      }

      if (!verifyFriendship) {
        console.log('Friendship not found or status changed');
        return new Response(
          JSON.stringify({ error: 'Invitation not found or already processed' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 404,
          }
        );
      }

      // 執行更新 - 使用 anon key (RLS 政策已更新)
      const { data: updatedFriendship, error: updateError } = await supabase
        .from('friendships')
        .update({
          status: 'friend',
          updated_at: now,
        })
        .eq('user_one_id', friendship.user_one_id)
        .eq('user_two_id', friendship.user_two_id)
        .eq('status', 'pending') // 確保只更新 pending 狀態的記錄
        .select()
        .maybeSingle();

      if (updateError) {
        console.error('Update error:', updateError);
        return new Response(
          JSON.stringify({ error: `Failed to accept invitation: ${updateError.message}` }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          }
        );
      }

      // 確認更新是否成功（有資料被更新）
      if (!updatedFriendship) {
        console.log('No rows updated - status might have changed');
        return new Response(
          JSON.stringify({ error: 'Invitation not found or already processed' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 404,
          }
        );
      }

      console.log('Friendship updated successfully:', updatedFriendship);

      // 建立聊天室 (如果需要)
      // 這裡假設 chat_channels 表存在，且 channel_type 有 'direct' 選項
      // 使用 service role key 來建立 channel (可能需要 bypass RLS)
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
      // 使用 anon key (RLS 政策已更新)
      const { error: deleteError } = await supabase
        .from('friendships')
        .delete()
        .eq('user_one_id', friendship.user_one_id)
        .eq('user_two_id', friendship.user_two_id);

      if (deleteError) {
        return new Response(JSON.stringify({ error: 'Failed to decline invitation' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      // 發送通知給發送邀請的使用者
      // 使用 service role key 來發送 Realtime 通知
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
