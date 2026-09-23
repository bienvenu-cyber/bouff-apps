CREATE TABLE IF NOT EXISTS private.service_tokens (
  name text PRIMARY KEY,
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE private.service_tokens FROM anon, authenticated, PUBLIC;

CREATE OR REPLACE FUNCTION private.check_service_token(p_name text, p_token text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = private, public AS $$
  SELECT EXISTS (
    SELECT 1 FROM private.service_tokens
    WHERE name = p_name AND token = p_token AND length(coalesce(p_token,'')) >= 20
  );
$$;

CREATE OR REPLACE FUNCTION public.claim_notifications(p_token text, p_limit integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_rows jsonb;
BEGIN
  IF NOT private.check_service_token('notifications', p_token) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  WITH picked AS (
    SELECT id FROM public.notification_outbox
    WHERE status = 'pending' AND attempts < 5
    ORDER BY created_at
    LIMIT greatest(1, least(coalesce(p_limit, 20), 100))
    FOR UPDATE SKIP LOCKED
  ), bumped AS (
    UPDATE public.notification_outbox o
    SET attempts = o.attempts + 1
    WHERE o.id IN (SELECT id FROM picked)
    RETURNING o.*
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id,
    'order_id', b.order_id,
    'event', b.event,
    'channel', b.channel,
    'audience', b.audience,
    'recipient', coalesce(b.recipient, u.email),
    'payload', b.payload,
    'attempts', b.attempts
  ) ORDER BY b.created_at), '[]'::jsonb)
  INTO v_rows
  FROM bumped b
  LEFT JOIN public.orders o ON o.id = b.order_id
  LEFT JOIN auth.users u ON u.id = o.customer_id;

  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notification(p_token text, p_id uuid, p_status text, p_error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF NOT private.check_service_token('notifications', p_token) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF p_status NOT IN ('sent','failed','skipped','pending') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  UPDATE public.notification_outbox
  SET status = p_status,
      last_error = p_error,
      sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE sent_at END
  WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_payment_intent(
  p_token text, p_order_id uuid, p_phone text, p_amount integer,
  p_provider_ref text, p_correspondent text DEFAULT NULL, p_provider text DEFAULT 'pawapay'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT private.check_service_token('payments', p_token) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  INSERT INTO public.payments (order_id, provider, provider_ref, provider_correspondent, phone, amount_fcfa, status)
  VALUES (p_order_id, p_provider, p_provider_ref, p_correspondent, p_phone, p_amount, 'submitted')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_payment_status(
  p_token text, p_provider_ref text, p_status text,
  p_failure_reason text DEFAULT NULL, p_raw jsonb DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
BEGIN
  IF NOT private.check_service_token('payments', p_token) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF p_status NOT IN ('pending','submitted','accepted','completed','failed','cancelled') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  UPDATE public.payments
  SET status = p_status, failure_reason = p_failure_reason, raw = coalesce(p_raw, raw)
  WHERE provider_ref = p_provider_ref;
END;
$$;

REVOKE ALL ON FUNCTION private.check_service_token(text, text) FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.claim_notifications(text, integer) FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.mark_notification(text, uuid, text, text) FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.record_payment_intent(text, uuid, text, integer, text, text, text) FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.update_payment_status(text, text, text, text, jsonb) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_notifications(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_notification(text, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_payment_intent(text, uuid, text, integer, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_payment_status(text, text, text, text, jsonb) TO service_role;