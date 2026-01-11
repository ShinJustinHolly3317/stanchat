// 取得待處理的好友邀請 Edge Function
// 回傳當前使用者收到的所有待處理邀請

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

    // 查詢所有待處理的邀請
    // friendships 表中，status = 'pending' 且 user_two_id = currentUserId 的記錄
    // 表示當前使用者收到的邀請
    const { data: pendingInvitations, error: queryError } = await supabase
      .from('friendships')
      .select('user_one_id, user_two_id, created_at, updated_at')
      .eq('user_two_id', currentUserId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (queryError) {
      return new Response(JSON.stringify({ error: 'Failed to fetch invitations' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    if (!pendingInvitations || pendingInvitations.length === 0) {
      return new Response(
        JSON.stringify({
          invitations: [],
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // 取得所有發送邀請的使用者資訊
    const senderIds = pendingInvitations.map((inv) => inv.user_one_id);

    const { data: userProfiles, error: profileError } = await supabase
      .from('user_profile')
      .select('uid, name, custom_user_id, image_url')
      .in('uid', senderIds);

    if (profileError) {
      return new Response(JSON.stringify({ error: 'Failed to fetch user profiles' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    // 建立 user_id 到 profile 的映射
    const profileMap = new Map();
    if (userProfiles) {
      userProfiles.forEach((profile) => {
        profileMap.set(profile.uid, profile);
      });
    }

    // 組合邀請資料
    const invitations = pendingInvitations.map((invitation) => {
      const profile = profileMap.get(invitation.user_one_id);
      return {
        request_id: invitation.user_one_id,
        user_id: invitation.user_one_id,
        nickname: profile?.name || profile?.custom_user_id || 'Unknown User',
        image_url: profile?.image_url || null,
        created_at: invitation.created_at, // Already in timestamp format from DB
        updated_at: invitation.updated_at, // Already in timestamp format from DB
      };
    });

    return new Response(
      JSON.stringify({
        invitations: invitations,
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
