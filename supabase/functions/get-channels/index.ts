// 取得使用者所有的聊天頻道 Edge Function
// 回傳當前使用者參與的所有頻道列表

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

    // 查詢使用者參與的所有頻道
    // 透過 channel_users 表找到所有 channel_id，然後取得頻道資訊
    const { data: userChannels, error: channelUsersError } = await supabase
      .from('channel_users')
      .select('channel_id')
      .eq('uid', currentUserId);

    if (channelUsersError) {
      return new Response(JSON.stringify({ error: 'Failed to fetch user channels' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    if (!userChannels || userChannels.length === 0) {
      return new Response(
        JSON.stringify({
          channels: [],
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // 取得所有頻道 ID
    const channelIds = userChannels.map((uc) => uc.channel_id);

    // 查詢頻道詳細資訊
    const { data: channels, error: channelsError } = await supabase
      .from('chat_channels')
      .select('id, channel_type')
      .in('id', channelIds)
      .order('id', { ascending: false });

    if (channelsError) {
      return new Response(JSON.stringify({ error: 'Failed to fetch channels' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    // 為每個頻道取得參與的使用者資訊
    const channelsWithUsers = await Promise.all(
      (channels || []).map(async (channel) => {
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
        };
      })
    );

    return new Response(
      JSON.stringify({
        channels: channelsWithUsers,
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
