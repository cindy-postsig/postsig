CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_updated
    ON public.chat_sessions (user_id, updated_at DESC);
