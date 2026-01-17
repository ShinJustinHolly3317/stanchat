// 建立 pending message（攔截送訊息）並回傳題目給前端
// - 不直接寫入 chat_messages
// - 寫入 pending_messages，status = 'waiting_answer'
// - 從 questions 隨機抽一題（目前先用隨機；之後可依使用者程度調整）
// - 設定 expires_at（預設 10 分鐘）

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { jsonErr, jsonOk } from '../_shared/responses.ts';

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
    const content = body?.content;

    if (!roomId || typeof roomId !== 'string') {
      return jsonErr('1100', 'room_id is required (string)', 400);
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return jsonErr('1100', 'content is required (non-empty string)', 400);
    }

    // 抽題：prototype 先隨機取 1 題
    // NOTE: 不用 order('random()') 是因為 postgrest 對 random 支援不穩；先用全量取再 random（資料少 OK）
    const { data: questions, error: questionError } = await supabase
      .from('between_chat_questions')
      .select('id, category, title, content, options')
      .limit(1000);

    if (questionError) {
      return jsonErr('9000', `Failed to fetch questions: ${questionError.message}`, 500);
    }

    if (!questions || questions.length === 0) {
      return jsonErr('9000', 'No questions available', 500);
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
      return jsonErr('9000', `Failed to create pending message: ${pendingError.message}`, 500);
    }

    // 回傳給前端：pending_id + question
    return jsonOk({
      pending_id: pending.id,
      question: {
        id: picked.id,
        category: picked.category,
        title: picked.title,
        content: picked.content,
        ...(picked.options ? { options: picked.options } : {}),
      },
    });
  } catch (error) {
    return jsonErr('9000', error instanceof Error ? error.message : 'Unknown error', 500);
  }
});
