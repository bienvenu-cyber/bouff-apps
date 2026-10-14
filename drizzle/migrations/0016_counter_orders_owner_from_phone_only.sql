CREATE OR REPLACE FUNCTION public.counter_place_order(
  p_token text, p_items jsonb, p_dine_in boolean, p_payment_method payment_method,
  p_customer_name text DEFAULT NULL, p_customer_phone text DEFAULT NULL, p_note text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE c public.cashiers; v jsonb; v_phone text; v_digits text; v_customer uuid; v_note text;
BEGIN
  c := private.counter_cashier(p_token);
  IF p_payment_method NOT IN ('cash','mobile_money') THEN RAISE EXCEPTION 'Paiement : espèces ou MoMo uniquement.'; END IF;
  v_digits := regexp_replace(COALESCE(p_customer_phone,''), '\D', '', 'g');
  IF v_digits <> '' AND length(v_digits) < 8 THEN RAISE EXCEPTION 'Numéro du client invalide.'; END IF;
  v_phone := CASE WHEN v_digits = '' THEN '00000000' ELSE btrim(p_customer_phone) END;
  v_note := CASE WHEN p_dine_in THEN 'SUR PLACE' ELSE 'À EMPORTER' END || ' · Comptoir'
            || COALESCE(' · ' || NULLIF(btrim(COALESCE(p_note,'')), ''), '');

  PERFORM set_config('bouff.counter', '1', true);
  v := public.place_order_base(c.restaurant_id, COALESCE(NULLIF(btrim(COALESCE(p_customer_name,'')), ''), 'Client comptoir'),
         v_phone, 'takeaway', p_items, NULL, NULL, p_payment_method, v_note, NULL);
  PERFORM set_config('bouff.counter', '', true);

  IF v_digits <> '' THEN
    SELECT p.id INTO v_customer FROM public.profiles p
     WHERE right(regexp_replace(COALESCE(p.phone,''), '\D', '', 'g'), 8) = right(v_digits, 8)
     ORDER BY p.created_at LIMIT 1;
  END IF;

  -- Le client d'une vente caisse vient UNIQUEMENT du numéro saisi,
  -- jamais du compte éventuellement connecté sur la tablette.
  UPDATE public.orders SET source = 'counter', dine_in = COALESCE(p_dine_in,false), cashier_id = c.id,
         paid_at = now(), customer_id = v_customer
   WHERE id = (v->>'order_id')::uuid;

  RETURN v || jsonb_build_object('cashier', c.full_name, 'dine_in', COALESCE(p_dine_in,false),
                                 'points_linked', v_customer IS NOT NULL);
END $$;