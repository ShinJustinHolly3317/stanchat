-- 群組頻道顯示名稱（可選）
ALTER TABLE public.chat_channels
  ADD COLUMN IF NOT EXISTS name text;
