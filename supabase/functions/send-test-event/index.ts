// 測試用 Edge Function - 發送 Realtime 事件
// 可以用來測試前端的 Realtime 監聽功能

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  // 處理 CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userId, eventType, payload } = await req.json();

    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId is required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
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

    return new Response(
      JSON.stringify({
        success: true,
        channel: channelName,
        event: eventType === 'inbox' ? 'inbox-event' : 'user-event',
        payload,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
