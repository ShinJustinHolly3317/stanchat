# Frontend - StanChat

簡單的前端應用，使用 Supabase Auth 和 Realtime 功能。

## 設定

### 方式 1: 使用 .env 檔案 (推薦)

1. 複製 `.env.example` 到 `.env`：

```bash
cp frontend/.env.example frontend/.env
```

2. 編輯 `frontend/.env` 並填入你的 Supabase 憑證：

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
```

3. 生成 `config.js`：

```bash
# 使用 Makefile
make config

# 或使用 npm
npm run config
```

### 方式 2: 手動建立 config.js

1. 複製設定檔範本：

```bash
cp frontend/config.example.js frontend/config.js
```

2. 編輯 `frontend/config.js` 並填入你的 Supabase 憑證

**注意**: 
- `config.js` 和 `.env` 都在 `.gitignore` 中，不會被提交到 git
- 使用 `.env` 方式時，每次修改 `.env` 後記得執行 `make config` 重新生成 `config.js`

## 功能

- **登入頁面** (`index.html`): 使用者可以登入或註冊
- **歡迎頁面** (`welcome.html`): 登入後顯示，監聽兩個 Realtime 事件：
  - `user:userId` - 使用者相關事件
  - `inbox:userId` - 收件匣事件

## 本地開發

### 方式 1: 使用簡單 HTTP 伺服器

```bash
# 使用 Python
cd frontend
python3 -m http.server 3000

# 或使用 Node.js http-server
npx http-server -p 3000
```

然後在瀏覽器開啟: http://localhost:3000

### 方式 2: 使用 Supabase 本地環境

如果使用 `supabase start`，確保 `config.toml` 中的 `site_url` 設定為 `http://localhost:3000`

## Realtime 事件測試

要測試 Realtime 事件，你可以：

1. 使用 Supabase Dashboard 的 Realtime 測試工具
2. 建立一個 Edge Function 來發送事件
3. 使用 Supabase CLI 或 API 發送 broadcast 事件

### 使用 Edge Function 發送事件範例

```typescript
// supabase/functions/send-event/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// 發送到 user:userId channel
await supabase.channel(`user:${userId}`).send({
  type: 'broadcast',
  event: 'test-event',
  payload: { message: 'Hello from Edge Function!' }
})
```

## 注意事項

- 確保 Supabase 專案的 Realtime 功能已啟用
- 確保 `config.toml` 中的 `[realtime]` 設定正確
- 前端需要正確的 Supabase URL 和 anon key 才能運作
