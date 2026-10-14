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
  IF o.status <> 'received' THEN RAISE EXCEPTION 'Commande déjà acceptée par la cuisine : impossible de l''annuler'; END IF;
  UPDATE public.orders SET status = 'cancelled', cancelled_at = now(), cancelled_by_cashier_id = c.id,
    cancel_reason = 'Caisse (' || c.full_name || ') : ' || btrim(p_reason)
  WHERE id = o.id;
  RETURN jsonb_build_object('ok', true, 'order_number', o.order_number);
END $$;