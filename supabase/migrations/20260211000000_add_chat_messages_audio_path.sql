-- 新增音檔網址欄位
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS audio_url text;
