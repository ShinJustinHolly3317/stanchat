// 發送好友邀請 Edge Function
// 發送好友邀請給目標使用者

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

    // 解析請求 body
    const { target_user_id } = await req.json();

    if (!target_user_id) {
      return jsonErr('1100', 'target_user_id is required', 400);
    }

    // 不能邀請自己
    if (target_user_id === currentUserId) {
      return jsonErr('1100', 'Cannot send invitation to yourself', 400);
    }

    // 檢查目標使用者是否存在
    const { data: targetProfile, error: profileError } = await supabase
      .from('user_profile')
      .select('uid')
      .eq('uid', target_user_id)
      .single();

    if (profileError || !targetProfile) {
      return jsonErr('1404', 'Target user not found', 404);
    }

    // 檢查是否已有關係
    // friendships 表使用 user_one_id 和 user_two_id，需要檢查兩個方向
    // 為了保持一致性，總是將較小的 user_id 放在 user_one_id
    const userId1 = currentUserId;
    const userId2 = target_user_id;

    const { data: existingFriendship, error: friendshipError } = await supabase
      .from('friendships')
      .select('id, status, user_one_id, user_two_id')
      .eq('user_one_id', userId1)
      .eq('user_two_id', userId2)
      .maybeSingle();

    if (friendshipError) {
      return jsonErr('9000', 'Failed to check existing friendship', 500);
    }

    // 如果已經有關係，檢查狀態
    if (existingFriendship) {
      if (existingFriendship.status === 'friend') {
        return jsonErr('1200', 'Already friends', 400);
      }

      if (existingFriendship.status === 'pending') {
        // 檢查是誰發送的邀請
        if (existingFriendship.user_one_id === currentUserId) {
          return jsonErr('1200', 'Invitation already sent', 400);
        } else {
          return jsonErr('1200', 'You have a pending invitation from this user', 400);
        }
      }

      if (existingFriendship.status === 'blocked') {
        return jsonErr('1200', 'Cannot send invitation to blocked user', 400);
      }
    }

    // 建立或更新 friendship 記錄
    const now = Date.now();

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
        .eq('user_two_id', userId2)
        .select('id')
        .maybeSingle();
    } else {
      // 建立新記錄
      result = await supabase
        .from('friendships')
        .insert({
          user_one_id: userId1,
          user_two_id: userId2,
          status: 'pending',
          created_at: now,
          updated_at: now,
        })
        .select('id')
        .single();
    }

    if (result.error) {
      return jsonErr('9000', 'Failed to send invitation', 500);
    }

    // 發送 Realtime 通知給目標使用者
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: senderProfile } = await serviceClient
      .from('user_profile')
      .select('uid, name, custom_user_id, image_url')
      .eq('uid', currentUserId)
      .maybeSingle();

    const requestId = existingFriendship?.id ?? result?.data?.id ?? result?.id;

    await serviceClient.channel(`user:${target_user_id}`).send({
      type: 'broadcast',
      event: 'friend_invitation',
      payload: {
        request_id: requestId,
        sender: {
          id: currentUserId,
          nickname: senderProfile?.name || senderProfile?.custom_user_id || 'Unknown',
          avatar_url: senderProfile?.image_url || null,
        },
        sent_at: now,
      },
    });

    return jsonOk({ status: 'success' });
  } catch (error) {
    return jsonErr('9000', error instanceof Error ? error.message : 'Unknown error', 500);
  }
});
