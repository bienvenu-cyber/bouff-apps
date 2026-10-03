CREATE OR REPLACE FUNCTION public.touch_cart(p_items integer, p_first_item text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  INSERT INTO cart_activity(user_id, items, first_item, updated_at, reminded)
  VALUES (auth.uid(), GREATEST(COALESCE(p_items,0),0), left(p_first_item, 80), now(), false)
  ON CONFLICT (user_id) DO UPDATE SET items = EXCLUDED.items, first_item = EXCLUDED.first_item,
    updated_at = now(), reminded = false
  WHERE cart_activity.items IS DISTINCT FROM EXCLUDED.items;
END $$;