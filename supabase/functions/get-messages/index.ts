// get-messages Edge Function
// - Keyset pagination (DESC): fetch newest -> older by `id` descending
// - cursor is the last seen message `id` from previous page

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { jsonErr, jsonOk } from '../_shared/responses.ts';

const PAGE_SIZE = 10;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonErr('1003', 'Method not allowed', 405);
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

    const body = await req.json();
    const roomId = body?.room_id;
    const cursor = body?.cursor; // last message id (number) from previous page

    if (!roomId || (typeof roomId !== 'string' && typeof roomId !== 'number')) {
      return jsonErr('1100', 'room_id is required (string|number)', 400);
    }

    let q = supabase
      .from('chat_messages')
      .select('id, channel_id, uid, message_content, created_at')
      .eq('channel_id', roomId)
      .order('id', { ascending: false })
      .limit(PAGE_SIZE);

    if (cursor !== undefined && cursor !== null && cursor !== '') {
      const cursorNum = Number(cursor);
      if (!Number.isFinite(cursorNum)) {
        return jsonErr('1100', 'cursor must be a number (message id)', 400);
      }
      // Keyset: fetch older than last seen
      q = q.lt('id', cursorNum);
    }

    const { data: rows, error: msgError } = await q;
    if (msgError) {
      return jsonErr('9000', `Failed to fetch messages: ${msgError.message}`, 500);
    }

    const messagesRaw = rows || [];
    if (messagesRaw.length === 0) {
      return jsonOk({ messages: [], cursor: null });
    }

    // Fetch sender profiles for display
    const senderUids = Array.from(new Set(messagesRaw.map((m) => m.uid).filter(Boolean)));
    const { data: profiles, error: profError } = await supabase
      .from('user_profile')
      .select('uid, name, custom_user_id, image_url')
      .in('uid', senderUids);

    if (profError) {
      return jsonErr('9000', `Failed to fetch sender profiles: ${profError.message}`, 500);
    }

    const profileMap = new Map();
    (profiles || []).forEach((p) => profileMap.set(p.uid, p));

    const messages = messagesRaw.map((m) => {
      const p = profileMap.get(m.uid);
      return {
        id: m.id,
        sender: {
          id: m.uid,
          nickname: p?.name || p?.custom_user_id || 'Unknown',
          avatar_url: p?.image_url || null,
        },
        content: m.message_content || '',
        msg_type: 'text',
        created_at: m.created_at,
      };
    });

    const nextCursor = messagesRaw[messagesRaw.length - 1]?.id ?? null;
    return jsonOk({ messages, cursor: nextCursor });
  } catch (error) {
    return jsonErr('9000', error instanceof Error ? error.message : 'Unknown error', 500);
  }
});
