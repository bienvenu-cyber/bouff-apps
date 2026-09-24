ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS estimated_ready_at timestamptz;

-- Accepter une commande avec un temps de préparation (minutes)
CREATE OR REPLACE FUNCTION public.accept_order(p_order_id uuid, p_minutes integer DEFAULT 15)
RETURNS public.orders LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.orders;
BEGIN
  v := public.advance_order_status(p_order_id, 'in_kitchen', NULL);
  UPDATE public.orders
     SET estimated_ready_at = now() + make_interval(mins => LEAST(GREATEST(COALESCE(p_minutes, 15), 1), 240))
   WHERE id = p_order_id RETURNING * INTO v;
  RETURN v;
END $$;
REVOKE EXECUTE ON FUNCTION public.accept_order(uuid, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.accept_order(uuid, integer) TO authenticated;

-- Fermeture d'urgence : aussi possible depuis l'app cuisine
CREATE OR REPLACE FUNCTION public.set_restaurant_closed(p_restaurant_id uuid, p_closed boolean)
RETURNS public.restaurants LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.restaurants;
BEGIN
  IF NOT (private.is_super_admin(auth.uid()) OR private.manages_restaurant(auth.uid(), p_restaurant_id)) THEN
    RAISE EXCEPTION 'Action non autorisée.';
  END IF;
  UPDATE public.restaurants SET is_temporarily_closed = p_closed WHERE id = p_restaurant_id RETURNING * INTO v;
  RETURN v;
END $$;

-- Les commandes ne se modifient plus directement : tout passe par les actions contrôlées
-- (accepter, prête, annuler, prise de course, livrée), qui vérifient les droits et les étapes.
DROP POLICY IF EXISTS orders_update_staff ON public.orders;
REVOKE UPDATE ON public.orders FROM authenticated, anon;