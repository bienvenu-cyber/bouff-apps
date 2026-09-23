GRANT EXECUTE ON FUNCTION public.claim_notifications(text, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notification(text, uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_intent(text, uuid, text, integer, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_payment_status(text, text, text, text, jsonb) TO anon, authenticated;

INSERT INTO private.service_tokens (name, token)
VALUES
  ('notifications', encode(gen_random_bytes(24), 'hex')),
  ('payments', encode(gen_random_bytes(24), 'hex'))
ON CONFLICT (name) DO NOTHING;