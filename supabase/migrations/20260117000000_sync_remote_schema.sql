-- 20260117000000_sync_remote_schema.sql

-- 1. Create independent tables
CREATE TABLE IF NOT EXISTS public.between_chat_questions (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  title text,
  content text,
  category character varying,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  options text,
  CONSTRAINT between_chat_questions_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.chat_channels (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  channel_type character varying DEFAULT 'personal'::character varying,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT chat_channels_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.user_fcm_tokens (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  uid uuid DEFAULT gen_random_uuid(),
  token text NOT NULL,
  agent character varying,
  version character varying,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT user_fcm_tokens_pkey PRIMARY KEY (id),
  CONSTRAINT user_fcm_tokens_uid_fkey FOREIGN KEY (uid) REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.user_profile (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  uid uuid DEFAULT gen_random_uuid(),
  name character varying,
  image_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  custom_user_id character varying,
  CONSTRAINT user_profile_pkey PRIMARY KEY (id),
  CONSTRAINT user_profile_uid_fkey FOREIGN KEY (uid) REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.friendships (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  user_one_id uuid DEFAULT gen_random_uuid(),
  user_two_id uuid DEFAULT gen_random_uuid(),
  status character varying DEFAULT 'PENDING'::character varying,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT friendships_pkey PRIMARY KEY (id),
  CONSTRAINT friendships_user_one_id_fkey FOREIGN KEY (user_one_id) REFERENCES auth.users(id),
  CONSTRAINT friendships_user_two_id_fkey FOREIGN KEY (user_two_id) REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.pending_messages (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  sender_uid uuid DEFAULT gen_random_uuid(),
  channel_id bigint,
  content text,
  expires_at timestamp without time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  status character varying,
  question_id bigint,
  updated_at timestamp with time zone,
  CONSTRAINT pending_messages_pkey PRIMARY KEY (id)
);

-- 2. Create tables with dependencies
CREATE TABLE IF NOT EXISTS public.channel_users (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  channel_id bigint,
  uid uuid DEFAULT auth.uid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT channel_users_pkey PRIMARY KEY (id),
  CONSTRAINT channel_users_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.chat_channels(id),
  CONSTRAINT channel_users_uid_fkey FOREIGN KEY (uid) REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  message_content text,
  sender_id bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  sender_name character varying,
  uid uuid,
  channel_id bigint,
  CONSTRAINT chat_messages_pkey PRIMARY KEY (id),
  CONSTRAINT chat_messages_uid_fkey FOREIGN KEY (uid) REFERENCES auth.users(id),
  CONSTRAINT chat_messages_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.chat_channels(id)
);
