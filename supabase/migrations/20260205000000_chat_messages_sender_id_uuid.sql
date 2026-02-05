-- chat_messages.sender_id: bigint -> uuid, default null
-- Existing int values cannot be mapped to UUID; set to NULL.
ALTER TABLE public.chat_messages
  ALTER COLUMN sender_id TYPE uuid USING NULL;

-- Explicit default (optional; nullable columns default to NULL anyway)
ALTER TABLE public.chat_messages
  ALTER COLUMN sender_id SET DEFAULT NULL;
