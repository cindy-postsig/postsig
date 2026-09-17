CREATE TABLE public.chat_queries_log (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sanitized_query text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_queries_log_created_at ON public.chat_queries_log (created_at DESC);

ALTER TABLE public.chat_queries_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_queries_log_deny_authenticated" ON public.chat_queries_log
    FOR ALL
    TO authenticated
    USING (false);

CREATE POLICY "chat_queries_log_deny_anon" ON public.chat_queries_log
    FOR ALL
    TO anon
    USING (false);

GRANT ALL ON public.chat_queries_log TO postgres;
GRANT ALL ON public.chat_queries_log TO service_role;
