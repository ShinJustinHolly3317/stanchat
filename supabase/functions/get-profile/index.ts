// get-profile Edge Function
// - By default returns the current user's profile (uid from JWT)
// - Optionally supports `?uid=<uuid>` to view another user's profile (for clicking others' avatars)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { jsonErr, jsonOk } from '../_shared/responses.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
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

    const url = new URL(req.url);
    const targetUid = url.searchParams.get('uid') || user.id;

    const { data: profile, error: profileError } = await supabase
      .from('user_profile')
      .select('uid, name, custom_user_id, image_url')
      .eq('uid', targetUid)
      .maybeSingle();

    if (profileError) {
      return jsonErr('9000', `Failed to fetch profile: ${profileError.message}`, 500);
    }

    if (!profile) {
      return jsonErr('1404', 'Profile not found', 404);
    }

    return jsonOk({
      id: profile.uid,
      nickname: profile.name || profile.custom_user_id || 'Unknown',
      image_url: profile.image_url || null,
    });
  } catch (error) {
    return jsonErr('9000', error instanceof Error ? error.message : 'Unknown error', 500);
  }
});

