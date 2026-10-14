CREATE TABLE public.cashier_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  cashier_id uuid NOT NULL REFERENCES public.cashiers(id),
  period_start timestamptz NOT NULL,
  closed_at timestamptz NOT NULL DEFAULT now(),
  orders_count integer NOT NULL,
  cancelled_count integer NOT NULL,
  cash_expected_fcfa integer NOT NULL,
  momo_total_fcfa integer NOT NULL,
  cash_counted_fcfa integer NOT NULL,
  gap_fcfa integer NOT NULL,
  note text
);
ALTER TABLE public.cashier_closures ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.cashier_closures TO service_role;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_by_cashier_id uuid REFERENCES public.cashiers(id);

-- Début de la période : dernière clôture de cette caissière, sinon minuit (heure du Bénin).
CREATE OR REPLACE FUNCTION private.counter_period_start(p_cashier uuid)
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT GREATEST(
    COALESCE((SELECT max(closed_at) FROM public.cashier_closures WHERE cashier_id = p_cashier), '-infinity'::timestamptz),
    (date_trunc('day', now() AT TIME ZONE 'Africa/Porto-Novo') AT TIME ZONE 'Africa/Porto-Novo')
  );
$$;

CREATE OR REPLACE FUNCTION public.counter_day_summary(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.cashiers; v_start timestamptz; r jsonb;
BEGIN
  c := private.counter_cashier(p_token);
  v_start := private.counter_period_start(c.id);
  SELECT jsonb_build_object(
    'period_start', v_start,
    'orders_count', count(*) FILTER (WHERE status <> 'cancelled'),
    'cancelled_count', count(*) FILTER (WHERE status = 'cancelled'),
    'cash_fcfa', COALESCE(sum(total_fcfa) FILTER (WHERE status <> 'cancelled' AND payment_method = 'cash'), 0),
    'momo_fcfa', COALESCE(sum(total_fcfa) FILTER (WHERE status <> 'cancelled' AND payment_method = 'mobile_money'), 0)
  ) INTO r
  FROM public.orders
  WHERE source = 'counter' AND cashier_id = c.id AND created_at >= v_start;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.counter_close_day(p_token text, p_cash_counted integer, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.cashiers; s jsonb; v_gap integer;
BEGIN
  c := private.counter_cashier(p_token);
  IF p_cash_counted IS NULL OR p_cash_counted < 0 THEN RAISE EXCEPTION 'Montant compté invalide'; END IF;
  s := public.counter_day_summary(p_token);
  v_gap := p_cash_counted - (s->>'cash_fcfa')::int;
  INSERT INTO public.cashier_closures (restaurant_id, cashier_id, period_start, orders_count, cancelled_count,
    cash_expected_fcfa, momo_total_fcfa, cash_counted_fcfa, gap_fcfa, note)
  VALUES (c.restaurant_id, c.id, (s->>'period_start')::timestamptz, (s->>'orders_count')::int, (s->>'cancelled_count')::int,
    (s->>'cash_fcfa')::int, (s->>'momo_fcfa')::int, p_cash_counted, v_gap, NULLIF(btrim(p_note), ''));
  RETURN s || jsonb_build_object('cash_counted_fcfa', p_cash_counted, 'gap_fcfa', v_gap);
END $$;

CREATE OR REPLACE FUNCTION public.counter_cancel_order(p_token text, p_order_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.cashiers; o public.orders;
BEGIN
  c := private.counter_cashier(p_token);
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN RAISE EXCEPTION 'Indique le motif de l''annulation'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.restaurant_id <> c.restaurant_id OR o.source <> 'counter' THEN RAISE EXCEPTION 'Commande introuvable'; END IF;
  IF o.created_at < now() - interval '12 hours' THEN RAISE EXCEPTION 'Commande trop ancienne pour être annulée à la caisse'; END IF;
  IF o.status = 'cancelled' THEN RAISE EXCEPTION 'Commande déjà annulée'; END IF;
  IF o.status = 'delivered' THEN RAISE EXCEPTION 'Commande déjà remise au client : impossible de l''annuler'; END IF;
  UPDATE public.orders SET status = 'cancelled', cancelled_at = now(), cancelled_by_cashier_id = c.id,
    cancel_reason = 'Caisse (' || c.full_name || ') : ' || btrim(p_reason)
  WHERE id = o.id;
  RETURN jsonb_build_object('ok', true, 'order_number', o.order_number);
END $$;

CREATE OR REPLACE FUNCTION public.counter_recent_orders(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.cashiers;
BEGIN
  c := private.counter_cashier(p_token);
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id', o.id, 'order_number', o.order_number, 'status', o.status,
            'total_fcfa', o.total_fcfa, 'customer_name', o.customer_name, 'dine_in', o.dine_in,
            'payment_method', o.payment_method, 'created_at', o.created_at, 'cancel_reason', o.cancel_reason) ORDER BY o.created_at DESC)
    FROM (SELECT * FROM public.orders WHERE restaurant_id = c.restaurant_id AND source = 'counter'
            AND created_at > now() - interval '12 hours' ORDER BY created_at DESC LIMIT 30) o), '[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION private.counter_period_start(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.counter_day_summary(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.counter_close_day(text, integer, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.counter_cancel_order(text, uuid, text) TO anon, authenticated;