-- 建立 message_reads 表格來追蹤訊息已讀狀態
-- 用於記錄哪些使用者已讀哪些訊息

CREATE TABLE IF NOT EXISTS public.message_reads (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  message_id bigint NOT NULL,
  uid uuid NOT NULL,
  read_at bigint NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint,
  CONSTRAINT message_reads_pkey PRIMARY KEY (id),
  CONSTRAINT message_reads_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  CONSTRAINT message_reads_uid_fkey FOREIGN KEY (uid) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT message_reads_unique UNIQUE (message_id, uid)
);

-- 建立索引以提升查詢效能
CREATE INDEX IF NOT EXISTS message_reads_message_id_idx ON public.message_reads(message_id);
CREATE INDEX IF NOT EXISTS message_reads_uid_idx ON public.message_reads(uid);
CREATE INDEX IF NOT EXISTS message_reads_read_at_idx ON public.message_reads(read_at);
