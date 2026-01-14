// 建立 pending message（攔截送訊息）並回傳題目給前端
// - 不直接寫入 chat_messages
// - 寫入 pending_messages，status = 'waiting_answer'
// - 從 questions 隨機抽一題（目前先用隨機；之後可依使用者程度調整）
// - 設定 expires_at（預設 10 分鐘）

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const DEFAULT_TTL_MINUTES = 10;

/** @param {number} minutes */
function addMinutesToNowIso(minutes: number) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 405,
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
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
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const body = await req.json();
    const roomId = body?.room_id;
    const content = body?.content;

    if (!roomId || typeof roomId !== 'string') {
      return new Response(JSON.stringify({ error: 'room_id is required (string)' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'content is required (non-empty string)' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // 抽題：prototype 先隨機取 1 題
    // NOTE: 不用 order('random()') 是因為 postgrest 對 random 支援不穩；先用全量取再 random（資料少 OK）
    const { data: questions, error: questionError } = await supabase
      .from('between_chat_questions')
      .select('id, category, title, content, options')
      .limit(1000);

    if (questionError) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch questions: ${questionError.message}` }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    if (!questions || questions.length === 0) {
      return new Response(JSON.stringify({ error: 'No questions available' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    const picked = questions[Math.floor(Math.random() * questions.length)];

    const now = new Date().toISOString();
    const expiresAt = addMinutesToNowIso(DEFAULT_TTL_MINUTES);

    const { data: pending, error: pendingError } = await supabase
      .from('pending_messages')
      .insert({
        channel_id: roomId,
        sender_uid: user.id,
        content: content,
        status: 'waiting_answer',
        question_id: picked.id,
        expires_at: expiresAt,
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single();

    if (pendingError) {
      return new Response(
        JSON.stringify({ error: `Failed to create pending message: ${pendingError.message}` }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    // 回傳給前端：pending_id + question
    return new Response(
      JSON.stringify({
        pending_id: pending.id,
        question: {
          id: picked.id,
          category: picked.category,
          title: picked.title,
          content: picked.content,
          ...(picked.options ? { options: picked.options } : {}),
        },
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
