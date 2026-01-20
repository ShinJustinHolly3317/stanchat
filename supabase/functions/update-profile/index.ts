// update-profile Edge Function
// - Update current user's nickname (stored in user_profile.name)

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

    const body = await req.json();
    const nickname = body?.nickname;

    if (!nickname || typeof nickname !== 'string' || nickname.trim().length === 0) {
      return jsonErr('1100', 'nickname is required (non-empty string)', 400);
    }

    const now = Date.now();

    // Update profile; if missing, create it (best effort)
    const { data: updated, error: updateError } = await supabase
      .from('user_profile')
      .update({ name: nickname.trim(), updated_at: now })
      .eq('uid', user.id)
      .select('uid')
      .maybeSingle();

    if (updateError) {
      return jsonErr('9000', `Failed to update profile: ${updateError.message}`, 500);
    }

    return jsonOk({
      status: 'success',
      updated_at: now,
    });
  } catch (error) {
    return jsonErr('9000', error instanceof Error ? error.message : 'Unknown error', 500);
  }
});
