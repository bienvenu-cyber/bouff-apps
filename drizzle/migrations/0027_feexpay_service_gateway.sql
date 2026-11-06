-- Le serveur de paiement (site client hébergé) parle à la base avec un jeton de service.
CREATE TABLE IF NOT EXISTS private.service_token_windows (
  name text PRIMARY KEY,
  open_until timestamptz NOT NULL
);
REVOKE ALL ON TABLE private.service_token_windows FROM PUBLIC, anon, authenticated;

-- Enregistrement du jeton : possible une seule fois, pendant une fenêtre ouverte par la direction.
CREATE OR REPLACE FUNCTION public.register_service_token(p_name text, p_token text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'private', 'public' AS $$
BEGIN
  IF p_name <> 'payments' OR length(COALESCE(p_token, '')) < 32 THEN RETURN false; END IF;
  DELETE FROM private.service_token_windows WHERE name = p_name AND open_until > now();
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO private.service_tokens (name, token) VALUES (p_name, p_token)
  ON CONFLICT (name) DO UPDATE SET token = EXCLUDED.token, created_at = now();
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.register_service_token(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_service_token(text, text) TO anon, authenticated, service_role;

-- La direction peut rouvrir la fenêtre (changement de jeton) pendant 15 minutes.
CREATE OR REPLACE FUNCTION public.admin_open_payments_token_window()
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'private', 'public' AS $$
DECLARE v timestamptz := now() + interval '15 minutes';
BEGIN
  IF NOT private.has_role(auth.uid(), 'super_admin'::app_role) THEN RAISE EXCEPTION 'Action non autorisée.'; END IF;
  INSERT INTO private.service_token_windows (name, open_until) VALUES ('payments', v)
  ON CONFLICT (name) DO UPDATE SET open_until = EXCLUDED.open_until;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.admin_open_payments_token_window() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_open_payments_token_window() TO authenticated;

CREATE OR REPLACE FUNCTION public.feexpay_service(p_token text, p_op text, p_args jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private' AS $$
DECLARE a jsonb := COALESCE(p_args, '{}'::jsonb);
BEGIN
  IF NOT private.check_service_token('payments', p_token) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  CASE p_op
    WHEN 'order_state' THEN
      RETURN public.feexpay_order_state(a->>'orderNumber', a->>'phone');
    WHEN 'record_attempt' THEN
      RETURN public.feexpay_record_attempt((a->>'orderId')::uuid, a->>'reference', a->>'method', a->>'network',
        a->>'phone', (a->>'amount')::int, a->>'status', a->>'reason', a->>'paymentUrl',
        NULLIF(a->>'expiresAt', '')::timestamptz, a->>'returnTo', a->>'webOrigin', a->'raw');
    WHEN 'apply_result' THEN
      RETURN public.feexpay_apply_result(a->>'reference', a->>'status', NULLIF(a->>'amount', '')::int, a->>'reason', a->'raw');
    WHEN 'pending' THEN
      RETURN COALESCE((SELECT jsonb_agg(t.reference) FROM public.feexpay_pending_to_check(COALESCE((a->>'limit')::int, 25)) t), '[]'::jsonb);
    WHEN 'expire' THEN
      RETURN to_jsonb(public.feexpay_expire_due(make_interval(mins => COALESCE((a->>'graceMinutes')::int, 0))));
    WHEN 'touch' THEN
      PERFORM public.feexpay_touch(a->>'reference');
      RETURN 'true'::jsonb;
    WHEN 'order_by_id' THEN
      RETURN (SELECT jsonb_build_object('id', o.id, 'total', o.total_fcfa) FROM public.orders o WHERE o.id = (a->>'orderId')::uuid);
    ELSE
      RAISE EXCEPTION 'unknown op';
  END CASE;
END $$;
REVOKE ALL ON FUNCTION public.feexpay_service(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.feexpay_service(text, text, jsonb) TO anon, authenticated, service_role;

-- La veille de la base appelle le serveur de paiement hébergé avec le site client.
DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.ops_tick()'::regprocedure);
  d := replace(d, 'https://txyqwlatzlkurjrnlxhe.supabase.co/functions/v1/feexpay/reconcile', 'https://bouff-apps.vercel.app/api/payments/feexpay/reconcile');
  d := replace(d, '{"Content-Type":"application/json","apikey":"sb_publishable_mL30STWaoMLv30cWEZnI8g_e_WZn8j3"}', '{"Content-Type":"application/json"}');
  EXECUTE d;
END $$;