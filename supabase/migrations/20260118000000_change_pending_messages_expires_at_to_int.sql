-- 将 pending_messages 表格的 expires_at 欄位從 timestamp 轉換為 bigint (毫秒)

ALTER TABLE "public"."pending_messages" 
  ALTER COLUMN "expires_at" TYPE bigint USING (extract(epoch from "expires_at") * 1000)::bigint;
