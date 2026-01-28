# Changelog

## [Unreleased]

### Changed - 2026-01-25

#### commit-message: 更新 broadcast payload schema

**變更內容：**

更新 `commit-message` Edge Function 的 Realtime broadcast payload，使其與 `get-channels` 返回的 channel schema 完全一致。

**變更前：**
```typescript
{
  channel_id: number,
  last_message: {
    text: string,
    created_at: number
  },
  unread_total: number
}
```

**變更後：**
```typescript
{
  id: number,
  channel_type: string,
  users: Array<{
    id: string,
    nickname: string,
    avatar_url: string | null
  }>,
  last_message: {
    id: number,
    uid: string,
    message_content: string,
    created_at: number
  } | null,
  unread_count: number
}
```

**影響：**

- Broadcast 事件 `channel_lst_msg_update` 現在包含完整的頻道資訊
- 前端可以直接使用與 `get-channels` 相同的處理邏輯
- 欄位名稱統一：`text` → `message_content`，`unread_total` → `unread_count`

**實作細節：**

- 查詢頻道資訊（`chat_channels` 表）取得 `id` 和 `channel_type`
- 查詢頻道成員（`channel_users` 表）
- 查詢使用者詳細資訊（`user_profile` 表）取得 nickname 和 avatar_url
- 組合成與 `get-channels` 一致的完整 channel 物件

---

### Changed - 2026-01-25

#### 統一命名：將 `room` 相關命名改為 `channel`

為了保持程式碼命名的一致性，將所有 Edge Functions 中的 `room` 相關命名統一改為 `channel`。

**影響的 Edge Functions：**

1. **init-app-session**
   - 將返回資料中的 `rooms` 欄位改為 `channels`
   - 將變數 `rooms` 改為 `channels`
   - 更新註解：`rooms snapshot` → `channels snapshot`
   - 更新註解：`room names` → `channel names`

2. **start-new-message**
   - 將請求參數 `room_id` 改為 `channel_id`
   - 將變數 `roomId` 改為 `channelId`
   - 更新錯誤訊息：`room_id is required` → `channel_id is required`

3. **get-messages**
   - 將請求參數 `room_id` 改為 `channel_id`
   - 將變數 `roomId` 改為 `channelId`
   - 更新錯誤訊息：`room_id is required` → `channel_id is required`

4. **handle-invitation**
   - 將變數 `roomId` 改為 `channelId`
   - 將返回資料中的 `room_id` 欄位改為 `channel_id`
   - 將 Realtime 通知 payload 中的 `room_id` 改為 `channel_id`

5. **commit-message**
   - 將 Realtime 通知 payload 中的 `room_id` 改為 `channel_id`

**API 變更：**

- 所有接受 `room_id` 參數的 Edge Functions 現在改為接受 `channel_id`
- 所有返回 `room_id` 欄位的 Edge Functions 現在改為返回 `channel_id`

**遷移指南：**

如果前端或其他服務正在呼叫這些 Edge Functions，需要更新：

- 將請求 body 中的 `room_id` 改為 `channel_id`
- 將回應中的 `room_id` 欄位改為 `channel_id`

**範例：**

```typescript
// 舊的 API 呼叫
const response = await fetch('/functions/v1/get-messages', {
  method: 'POST',
  body: JSON.stringify({ room_id: 123 })
});

// 新的 API 呼叫
const response = await fetch('/functions/v1/get-messages', {
  method: 'POST',
  body: JSON.stringify({ channel_id: 123 })
});
```

---

### Added - 2026-01-25

#### 未讀訊息功能 API

實作了完整的未讀訊息追蹤系統，包含以下 Edge Functions：

**1. get-channels - 取得頻道未讀數量**

返回每個頻道的未讀訊息數量。

**請求：**
```typescript
GET /functions/v1/get-channels
Headers: {
  Authorization: "Bearer <token>"
}
```

**回應：**
```typescript
{
  code: "0000",
  data: {
    channels: [
      {
        id: number,
        channel_type: string,
        users: Array<{ id, nickname, avatar_url }>,
        last_message: {
          id: number,
          uid: string,
          message_content: string,
          created_at: number
        } | null,
        unread_count: number  // 未讀訊息數量
      }
    ]
  }
}
```

**未讀數量計算邏輯：**
- 計算頻道中所有訊息（排除自己發送的）
- 查詢 `message_reads` 表找出已讀的訊息
- 未讀數量 = 總訊息數 - 已讀訊息數

---

**2. get-messages - 取得訊息的已讀數量**

返回每則訊息的已讀數量（用於顯示已讀狀態）。

**請求：**
```typescript
POST /functions/v1/get-messages
Headers: {
  Authorization: "Bearer <token>",
  "Content-Type": "application/json"
}
Body: {
  channel_id: string | number,
  cursor?: number  // 可選，用於分頁
}
```

**回應：**
```typescript
{
  code: "0000",
  data: {
    messages: [
      {
        id: number,
        sender: {
          id: string,
          nickname: string,
          avatar_url: string | null
        },
        content: string,
        msg_type: "text",
        created_at: number,
        read_count: number  // 已讀數量
      }
    ],
    cursor: number | null  // 下一頁的 cursor
  }
}
```

**已讀數量計算邏輯：**
- 對於一對一聊天（`channel_type === 'direct'`）：已讀數量固定為 1（對方）
- 對於群組聊天：計算實際已讀該訊息的使用者數量
- 查詢 `message_reads` 表統計每則訊息的已讀記錄數

---

**3. mark-read - 標記訊息為已讀**

標記指定訊息或頻道中所有訊息為已讀。

**請求：**
```typescript
POST /functions/v1/mark-read
Headers: {
  Authorization: "Bearer <token>",
  "Content-Type": "application/json"
}
Body: {
  channel_id: string | number,
  message_ids?: number[]  // 可選，指定要標記的訊息 ID 陣列
}
```

**回應：**
```typescript
{
  code: "0000",
  data: {
    marked_count: number  // 標記為已讀的訊息數量
  }
}
```

**行為說明：**

- **如果提供 `message_ids`**：標記指定的訊息為已讀
  - 驗證訊息 ID 是否為有效數字
  - 批次插入 `message_reads` 記錄
  - 使用 `ON CONFLICT DO NOTHING` 避免重複標記

- **如果未提供 `message_ids`**：標記頻道中所有訊息為已讀
  - 取得頻道中所有訊息（排除自己發送的）
  - 過濾掉已經讀過的訊息
  - 批次插入新的已讀記錄

**權限驗證：**
- 驗證使用者是否為頻道成員
- 只有頻道成員才能標記訊息為已讀

**錯誤碼：**
- `1001`: Missing authorization header
- `1002`: Unauthorized
- `1004`: Forbidden - User is not a member of this channel
- `1100`: channel_id is required / message_ids must be an array of valid numbers
- `9000`: Server error

---

**4. init-app-session - 初始化時包含未讀數量**

在應用程式初始化時返回頻道的未讀數量。

**回應結構：**
```typescript
{
  code: "0000",
  data: {
    status: "success",
    timestamp: number,
    user_profile: {
      id: string,
      nickname: string,
      avatar_url: string | null
    },
    channels: [
      {
        id: number,
        channel_type: string,
        users: Array<{ id, nickname, avatar_url }>,
        last_message: {
          id: number,
          uid: string,
          message_content: string,
          created_at: number
        } | null,
        unread_count: number  // 未讀訊息數量
      }
    ]
  }
}
```

**未讀數量計算邏輯：**
- 與 `get-channels` 使用相同的計算邏輯
- 計算頻道中所有訊息（排除自己發送的）
- 查詢 `message_reads` 表找出已讀的訊息
- 未讀數量 = 總訊息數 - 已讀訊息數

---

**資料庫結構：**

未讀訊息功能使用 `message_reads` 表來追蹤已讀狀態：

```sql
message_reads (
  message_id: number,  -- 訊息 ID (FK to chat_messages.id)
  uid: string,         -- 使用者 ID (FK to auth.users.id)
  read_at: number,     -- 標記為已讀的時間戳（毫秒）
  PRIMARY KEY (message_id, uid)  -- 複合主鍵，避免重複記錄
)
```

**使用範例：**

```typescript
// 1. 取得頻道列表（包含未讀數量）
const channels = await fetch('/functions/v1/get-channels', {
  headers: { Authorization: `Bearer ${token}` }
});

// 2. 標記特定訊息為已讀
await fetch('/functions/v1/mark-read', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    channel_id: 123,
    message_ids: [1, 2, 3]
  })
});

// 3. 標記頻道中所有訊息為已讀
await fetch('/functions/v1/mark-read', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    channel_id: 123
    // 不提供 message_ids 表示標記所有訊息
  })
});

// 4. 取得訊息列表（包含已讀數量）
const messages = await fetch('/functions/v1/get-messages', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    channel_id: 123
  })
});
```
