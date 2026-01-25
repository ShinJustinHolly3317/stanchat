// 測試用 Edge Function - 發送 Realtime 事件
// 可以用來測試前端的 Realtime 監聽功能

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.8';
import { corsHeaders } from '../_shared/cors.ts';
import { jsonErr, jsonOk } from '../_shared/responses.ts';

serve(async (req) => {
  // 處理 CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userId, eventType, payload } = await req.json();

    if (!userId) {
      return jsonErr('1100', 'userId is required', 400);
    }

    // 建立 Supabase client (使用 service role key 來發送 broadcast)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 決定要發送到哪個 channel
    const channelName = eventType === 'inbox' ? `inbox:${userId}` : `user:${userId}`;

    // 發送 broadcast 事件
    const channel = supabase.channel(channelName);
    const result = await channel.send({
      type: 'broadcast',
      event: eventType === 'inbox' ? 'inbox-event' : 'user-event',
      payload: payload || { message: 'Test event', timestamp: new Date().toISOString() },
    });

    return jsonOk({
      success: true,
      channel: channelName,
      event: eventType === 'inbox' ? 'inbox-event' : 'user-event',
      payload,
      result,
    });
  } catch (error) {
    return jsonErr('9000', error instanceof Error ? error.message : 'Unknown error', 400);
  }
});
