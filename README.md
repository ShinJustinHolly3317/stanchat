# StanChat

一個使用 Supabase 作為後端的簡單專案，具備完整的 CI/CD 自動化流程。

## 專案結構

```
.
├── supabase/
│   ├── config.toml          # Supabase 專案設定
│   ├── migrations/           # 資料庫 migration 檔案
│   └── functions/           # Edge Functions
│       ├── _shared/         # 共用的程式碼
│       └── hello-world/     # 範例 function
├── .github/
│   └── workflows/
│       ├── deploy.yml       # 自動部署 workflow
│       └── local-test.yml   # 本地測試 workflow
└── README.md
```

## 快速開始

### 1. 安裝 Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# 或使用 npm
npm install -g supabase
```

### 2. 登入 Supabase

```bash
supabase login
```

### 3. 連結你的 Supabase 專案

```bash
supabase link --project-ref your-project-ref
```

你可以在 Supabase Dashboard 的專案設定中找到 `project-ref`。

### 4. 本地開發

啟動本地 Supabase 環境：

```bash
supabase start
```

這會啟動所有必要的服務（PostgreSQL, Auth, Storage, Realtime 等）。

### 5. 建立 Migration

```bash
supabase migration new migration_name
```

這會在 `supabase/migrations/` 資料夾中建立一個新的 migration 檔案。

### 6. 執行 Migration

```bash
# 本地執行
supabase db reset

# 或推送到遠端
supabase db push
```

### 7. 開發 Edge Function

在 `supabase/functions/` 資料夾中建立新的 function：

```bash
mkdir -p supabase/functions/my-function
```

然後建立 `index.ts` 檔案。

### 8. 測試 Edge Function 本地

```bash
supabase functions serve my-function
```

### 9. 部署 Edge Function

```bash
supabase functions deploy my-function
```

## CI/CD 設定

### GitHub Secrets 設定

在 GitHub repository 的 Settings > Secrets and variables > Actions 中新增以下 secrets：

1. **SUPABASE_ACCESS_TOKEN**: 
   - 在 Supabase Dashboard > Account Settings > Access Tokens 建立
   
2. **SUPABASE_PROJECT_ID**: 
   - 在 Supabase Dashboard > Project Settings > General 中找到

3. **SUPABASE_DB_PASSWORD**: 
   - 在 Supabase Dashboard > Project Settings > Database 中找到

### 自動化流程

- **Push 到 main branch**: 自動執行 migrations 和部署 edge functions
- **Pull Request**: 自動執行本地測試

## 開發工作流程

1. **建立 Migration**:
   ```bash
   supabase migration new add_users_table
   ```

2. **編輯 Migration 檔案**:
   編輯 `supabase/migrations/YYYYMMDDHHMMSS_add_users_table.sql`

3. **本地測試**:
   ```bash
   supabase db reset  # 重置並執行所有 migrations
   ```

4. **Commit 並 Push**:
   ```bash
   git add .
   git commit -m "Add users table migration"
   git push origin main
   ```

5. **CI/CD 自動部署**:
   GitHub Actions 會自動執行 migrations 和部署 edge functions

## Edge Functions 開發

### 建立新的 Function

```bash
mkdir -p supabase/functions/my-new-function
```

### Function 範本

參考 `supabase/functions/hello-world/index.ts` 作為範本。

### 使用 Supabase Client

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!

const supabase = createClient(supabaseUrl, supabaseKey)
```

## 注意事項

- Migration 檔案名稱必須遵循格式: `YYYYMMDDHHMMSS_description.sql`
- Edge Functions 必須放在 `supabase/functions/` 下的獨立資料夾中
- 所有 Edge Functions 都需要有 `index.ts` 或 `index.js` 作為入口點
- 本地開發時使用 `supabase start`，這會啟動所有服務在 Docker 容器中

## 參考資源

- [Supabase CLI 文件](https://supabase.com/docs/reference/cli)
- [Supabase Migrations 指南](https://supabase.com/docs/guides/cli/local-development#database-migrations)
- [Edge Functions 文件](https://supabase.com/docs/guides/functions)
