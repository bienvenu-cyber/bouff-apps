CREATE TABLE public.app_boot_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  app text NOT NULL,
  session_id text NOT NULL,
  stage text NOT NULL,
  message text,
  device text,
  build text
);
GRANT INSERT ON public.app_boot_logs TO anon, authenticated;
GRANT ALL ON public.app_boot_logs TO service_role;
ALTER TABLE public.app_boot_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Apps can write boot logs" ON public.app_boot_logs
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    char_length(app) <= 40 AND char_length(session_id) <= 64 AND char_length(stage) <= 80
    AND coalesce(char_length(message),0) <= 2000
    AND coalesce(char_length(device),0) <= 200 AND coalesce(char_length(build),0) <= 60
  );
CREATE INDEX app_boot_logs_created_idx ON public.app_boot_logs (created_at DESC);