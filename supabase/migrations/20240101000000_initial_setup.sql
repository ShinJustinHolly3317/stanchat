-- 初始 migration 範例
-- 這個檔案示範如何建立基本的資料表

-- 啟用必要的 extensions
create extension if not exists "uuid-ossp";

-- 範例: 建立一個 users 資料表 (如果需要的話)
-- 注意: Supabase Auth 已經有 auth.users 了，這裡只是示範
-- create table if not exists public.profiles (
--   id uuid references auth.users on delete cascade primary key,
--   username text unique,
--   created_at timestamp with time zone default timezone('utc'::text, now()) not null,
--   updated_at timestamp with time zone default timezone('utc'::text, now()) not null
-- );

-- 設定 RLS (Row Level Security) 政策範例
-- alter table public.profiles enable row level security;

-- create policy "Public profiles are viewable by everyone"
--   on public.profiles for select
--   using (true);

-- create policy "Users can insert their own profile"
--   on public.profiles for insert
--   with check (auth.uid() = id);

-- create policy "Users can update own profile"
--   on public.profiles for update
--   using (auth.uid() = id);
