# Changelog

## [Unreleased]

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
