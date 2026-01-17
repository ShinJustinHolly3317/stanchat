-- 20260117000001_change_timestamp_to_int.sql
-- 將所有表格的 created_at 和 updated_at 欄位從 timestamp 轉換為 bigint (毫秒)

-- 1. between_chat_questions
ALTER TABLE "public"."between_chat_questions" ALTER COLUMN "created_at" DROP DEFAULT;
ALTER TABLE "public"."between_chat_questions" 
  ALTER COLUMN "created_at" TYPE bigint USING (extract(epoch from "created_at") * 1000)::bigint;
ALTER TABLE "public"."between_chat_questions" 
  ALTER COLUMN "created_at" SET DEFAULT (extract(epoch from now()) * 1000)::bigint;

-- 2. chat_channels
ALTER TABLE "public"."chat_channels" ALTER COLUMN "created_at" DROP DEFAULT;
ALTER TABLE "public"."chat_channels" 
  ALTER COLUMN "created_at" TYPE bigint USING (extract(epoch from "created_at") * 1000)::bigint;
ALTER TABLE "public"."chat_channels" 
  ALTER COLUMN "created_at" SET DEFAULT (extract(epoch from now()) * 1000)::bigint;

ALTER TABLE "public"."chat_channels" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "public"."chat_channels" 
  ALTER COLUMN "updated_at" TYPE bigint USING (extract(epoch from "updated_at") * 1000)::bigint;
ALTER TABLE "public"."chat_channels" 
  ALTER COLUMN "updated_at" SET DEFAULT (extract(epoch from now()) * 1000)::bigint;

-- 3. user_fcm_tokens
ALTER TABLE "public"."user_fcm_tokens" ALTER COLUMN "created_at" DROP DEFAULT;
ALTER TABLE "public"."user_fcm_tokens" 
  ALTER COLUMN "created_at" TYPE bigint USING (extract(epoch from "created_at") * 1000)::bigint;
ALTER TABLE "public"."user_fcm_tokens" 
  ALTER COLUMN "created_at" SET DEFAULT (extract(epoch from now()) * 1000)::bigint;

ALTER TABLE "public"."user_fcm_tokens" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "public"."user_fcm_tokens" 
  ALTER COLUMN "updated_at" TYPE bigint USING (extract(epoch from "updated_at") * 1000)::bigint;
ALTER TABLE "public"."user_fcm_tokens" 
  ALTER COLUMN "updated_at" SET DEFAULT (extract(epoch from now()) * 1000)::bigint;

-- 4. user_profile
ALTER TABLE "public"."user_profile" ALTER COLUMN "created_at" DROP DEFAULT;
ALTER TABLE "public"."user_profile" 
  ALTER COLUMN "created_at" TYPE bigint USING (extract(epoch from "created_at") * 1000)::bigint;
ALTER TABLE "public"."user_profile" 
  ALTER COLUMN "created_at" SET DEFAULT (extract(epoch from now()) * 1000)::bigint;

ALTER TABLE "public"."user_profile" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "public"."user_profile" 
  ALTER COLUMN "updated_at" TYPE bigint USING (extract(epoch from "updated_at") * 1000)::bigint;
ALTER TABLE "public"."user_profile" 
  ALTER COLUMN "updated_at" SET DEFAULT (extract(epoch from now()) * 1000)::bigint;

-- 5. friendships
ALTER TABLE "public"."friendships" ALTER COLUMN "created_at" DROP DEFAULT;
ALTER TABLE "public"."friendships" 
  ALTER COLUMN "created_at" TYPE bigint USING (extract(epoch from "created_at") * 1000)::bigint;
ALTER TABLE "public"."friendships" 
  ALTER COLUMN "created_at" SET DEFAULT (extract(epoch from now()) * 1000)::bigint;

ALTER TABLE "public"."friendships" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "public"."friendships" 
  ALTER COLUMN "updated_at" TYPE bigint USING (extract(epoch from "updated_at") * 1000)::bigint;
ALTER TABLE "public"."friendships" 
  ALTER COLUMN "updated_at" SET DEFAULT (extract(epoch from now()) * 1000)::bigint;

-- 6. pending_messages
ALTER TABLE "public"."pending_messages" ALTER COLUMN "created_at" DROP DEFAULT;
ALTER TABLE "public"."pending_messages" 
  ALTER COLUMN "created_at" TYPE bigint USING (extract(epoch from "created_at") * 1000)::bigint;
ALTER TABLE "public"."pending_messages" 
  ALTER COLUMN "created_at" SET DEFAULT (extract(epoch from now()) * 1000)::bigint;

ALTER TABLE "public"."pending_messages" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "public"."pending_messages" 
  ALTER COLUMN "updated_at" TYPE bigint USING (extract(epoch from "updated_at") * 1000)::bigint;
ALTER TABLE "public"."pending_messages" 
  ALTER COLUMN "updated_at" SET DEFAULT (extract(epoch from now()) * 1000)::bigint;

-- 7. channel_users
ALTER TABLE "public"."channel_users" ALTER COLUMN "created_at" DROP DEFAULT;
ALTER TABLE "public"."channel_users" 
  ALTER COLUMN "created_at" TYPE bigint USING (extract(epoch from "created_at") * 1000)::bigint;
ALTER TABLE "public"."channel_users" 
  ALTER COLUMN "created_at" SET DEFAULT (extract(epoch from now()) * 1000)::bigint;

-- 8. chat_messages
ALTER TABLE "public"."chat_messages" ALTER COLUMN "created_at" DROP DEFAULT;
ALTER TABLE "public"."chat_messages" 
  ALTER COLUMN "created_at" TYPE bigint USING (extract(epoch from "created_at") * 1000)::bigint;
ALTER TABLE "public"."chat_messages" 
  ALTER COLUMN "created_at" SET DEFAULT (extract(epoch from now()) * 1000)::bigint;

ALTER TABLE "public"."chat_messages" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "public"."chat_messages" 
  ALTER COLUMN "updated_at" TYPE bigint USING (extract(epoch from "updated_at") * 1000)::bigint;
ALTER TABLE "public"."chat_messages" 
  ALTER COLUMN "updated_at" SET DEFAULT (extract(epoch from now()) * 1000)::bigint;
