CREATE OR REPLACE FUNCTION public.counter_complete_order(p_token text, p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE c public.cashiers; o public.orders;
BEGIN
 c := private.counter_cashier(p_token);
 SELECT * INTO o FROM public.orders WHERE id=p_order_id AND restaurant_id=c.restaurant_id AND source='counter' AND order_type='takeaway' FOR UPDATE;
 IF o.id IS NULL THEN RAISE EXCEPTION 'Commande comptoir introuvable.'; END IF;
 IF o.paid_at IS NULL THEN RAISE EXCEPTION 'Commande non payée.'; END IF;
 IF o.status='delivered' THEN RETURN jsonb_build_object('order_id',o.id,'status',o.status); END IF;
 IF o.status <> 'ready' THEN RAISE EXCEPTION 'La cuisine doit confirmer que la commande est prête.'; END IF;
 UPDATE public.orders SET status='delivered', delivered_at=now() WHERE id=o.id;
 RETURN jsonb_build_object('order_id',o.id,'status','delivered');
END;
$$;
REVOKE ALL ON FUNCTION public.counter_complete_order(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.counter_complete_order(text,uuid) TO anon,authenticated,service_role;
COMMENT ON FUNCTION public.counter_complete_order(text,uuid) IS 'Remise réelle au client par une session caisse valide ; uniquement commandes comptoir payées et prêtes du même restaurant.';