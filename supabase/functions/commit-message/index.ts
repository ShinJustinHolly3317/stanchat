// commit-message Edge Function
// - Read pending message from pending_messages
// - Write final message into chat_messages
// - Delete pending row
// - For now: always returns success with is_correct=true (no evaluation, no audio validation)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { jsonErr, jsonOk } from '../_shared/responses.ts';

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
    const pendingId = body?.pending_id;
    const category = body?.category;
    // accepted but unused for now
    const audioPath = body?.audio_path;

    if (!pendingId) {
      return jsonErr('1100', 'pending_id is required (string)', 400);
    }

    if (!category) {
      return jsonErr('1100', 'category is required (string)', 400);
    }

    // Fetch pending message (ensure it belongs to current user)
    const { data: pending, error: pendingError } = await supabase
      .from('pending_messages')
      .select('id, channel_id, sender_uid, content, created_at')
      .eq('id', pendingId)
      .maybeSingle();

    if (pendingError) {
      return jsonErr('9000', `Failed to fetch pending message: ${pendingError.message}`, 500);
    }

    if (!pending) {
      return jsonErr('1404', 'Pending message not found', 404);
    }

    if (pending.sender_uid !== user.id) {
      return jsonErr('1004', 'Forbidden', 403);
    }

    // Write final message
    // NOTE: We only insert the minimal fields we know from the project docs/code.
    // If your DB schema has additional required fields, we can adjust later.
    const now = new Date().toISOString();
    const { data: inserted, error: insertError } = await supabase
      .from('chat_messages')
      .insert({
        channel_id: pending.channel_id,
        message_content: pending.content,
        uid: pending.sender_uid,
        created_at: now,
        updated_at: now,
        // audioPath is accepted but not persisted yet (per your requirement)
        // audio_path: audioPath,
      })
      .select('id, channel_id, message_content, uid, created_at')
      .maybeSingle();

    if (insertError) {
      return jsonErr('9000', `Failed to commit message: ${insertError.message}`, 500);
    }

    // Delete pending row (cleanup)
    const { error: deleteError } = await supabase
      .from('pending_messages')
      .delete()
      .eq('id', pendingId);
    if (deleteError) {
      // For now, still return success (message was committed); cleanup can be retried later.
      // But include a hint in server logs.
      console.warn('Failed to delete pending_messages row:', deleteError);
    }

    // Broadcast last message update to inbox:{user_id} for channel members
    try {
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
      const { data: members, error: membersError } = await serviceClient
        .from('channel_users')
        .select('uid')
        .eq('channel_id', pending.channel_id);

      if (!membersError && members) {
        const payload = {
          room_id: pending.channel_id,
          last_message: {
            text: inserted?.message_content ?? pending.content,
            created_at: inserted?.created_at ?? now,
          },
          unread_total: 0,
        };

        await Promise.all(
          members.map((m) =>
            serviceClient.channel(`inbox:${m.uid}`).send({
              type: 'broadcast',
              event: 'channel_lst_msg_update',
              payload,
            })
          )
        );
      }
    } catch (broadcastError) {
      console.warn('Failed to broadcast channel last message:', broadcastError);
    }

    return jsonOk({
      status: 'success',
      is_correct: true,
      // accepted but not validated/persisted yet
      ...(audioPath ? { audio_path: audioPath } : {}),
      message_record: {
        id: inserted?.id ?? null,
        channel_id: inserted?.channel_id ?? pending.channel_id,
        content: inserted?.message_content ?? pending.content,
        created_at: inserted?.created_at ?? now,
      },
    });
  } catch (error) {
    return jsonErr('9000', error instanceof Error ? error.message : 'Unknown error', 500);
  }
});
