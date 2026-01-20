// init-app-session Edge Function
// - First version: return user_profile + rooms snapshot
// - Uses standard {code,data} envelope

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { jsonErr, jsonOk } from '../_shared/responses.ts';

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

    // Parse request (first version: accept but don't persist yet)
    // { fcm_token, app_version, platform }
    await req.json().catch(() => ({}));

    const now = Date.now();

    // Load user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profile')
      .select('uid, name, custom_user_id, image_url')
      .eq('uid', user.id)
      .maybeSingle();

    if (profileError) {
      return jsonErr('9000', `Failed to fetch profile: ${profileError.message}`, 500);
    }

    const userProfile = {
      id: user.id,
      nickname: profile?.name || profile?.custom_user_id || 'Unknown',
      avatar_url: profile?.image_url || null,
    };

    // Load channels for current user
    const { data: channelRows, error: channelUsersError } = await supabase
      .from('channel_users')
      .select('channel_id')
      .eq('uid', user.id);

    if (channelUsersError) {
      return jsonErr('9000', `Failed to fetch channels: ${channelUsersError.message}`, 500);
    }

    const channelIds = (channelRows || []).map((r) => r.channel_id);
    if (channelIds.length === 0) {
      return jsonOk({
        status: 'success',
        timestamp: now,
        user_profile: userProfile,
        rooms: [],
      });
    }

    const { data: channels, error: channelsError } = await supabase
      .from('chat_channels')
      .select('id, channel_type')
      .in('id', channelIds);

    if (channelsError) {
      return jsonErr('9000', `Failed to fetch channel info: ${channelsError.message}`, 500);
    }

    // Latest messages by channel
    const { data: latestMessages, error: latestError } = await supabase
      .from('chat_messages')
      .select('id, channel_id, uid, message_content, created_at')
      .in('channel_id', channelIds)
      .order('created_at', { ascending: false })
      .limit(5000);

    if (latestError) {
      return jsonErr('9000', `Failed to fetch latest messages: ${latestError.message}`, 500);
    }

    const latestByChannel = new Map();
    (latestMessages || []).forEach((m) => {
      if (!latestByChannel.has(m.channel_id)) {
        latestByChannel.set(m.channel_id, m);
      }
    });

    // Load channel members for room names (direct)
    const { data: channelUsers, error: channelUsersListError } = await supabase
      .from('channel_users')
      .select('channel_id, uid')
      .in('channel_id', channelIds);

    if (channelUsersListError) {
      return jsonErr(
        '9000',
        `Failed to fetch channel members: ${channelUsersListError.message}`,
        500
      );
    }

    const memberIds = Array.from(new Set((channelUsers || []).map((cu) => cu.uid)));
    const { data: memberProfiles, error: memberProfilesError } = await supabase
      .from('user_profile')
      .select('uid, name, custom_user_id, image_url')
      .in('uid', memberIds);

    if (memberProfilesError) {
      return jsonErr(
        '9000',
        `Failed to fetch member profiles: ${memberProfilesError.message}`,
        500
      );
    }

    const profileMap = new Map();
    (memberProfiles || []).forEach((p) => profileMap.set(p.uid, p));

    const channelMembersMap = new Map();
    (channelUsers || []).forEach((cu) => {
      if (!channelMembersMap.has(cu.channel_id)) {
        channelMembersMap.set(cu.channel_id, []);
      }
      channelMembersMap.get(cu.channel_id).push(cu.uid);
    });

    const rooms = (channels || []).map((ch) => {
      const members = channelMembersMap.get(ch.id) || [];

      const users = members
        .map((uid) => {
          const p = profileMap.get(uid);
          return {
            id: uid,
            nickname: p?.name || p?.custom_user_id || 'Unknown',
            avatar_url: p?.image_url || null,
          };
        })
        .filter(Boolean);

      const last = latestByChannel.get(ch.id);

      return {
        id: ch.id,
        channel_type: ch.channel_type,
        users,
        last_message: last
          ? {
              id: last.id,
              uid: last.uid,
              message_content: last.message_content,
              created_at: last.created_at,
            }
          : null,
        unread_count: 0,
      };
    });

    return jsonOk({
      status: 'success',
      timestamp: now,
      user_profile: userProfile,
      rooms,
    });
  } catch (error) {
    return jsonErr('9000', error instanceof Error ? error.message : 'Unknown error', 500);
  }
});
