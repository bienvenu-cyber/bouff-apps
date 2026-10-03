ALTER TABLE public.customer_birthdays ADD COLUMN IF NOT EXISTS year smallint;

CREATE OR REPLACE FUNCTION public.set_my_birthday(p_month integer, p_day integer, p_year integer)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_date date; v_age int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise.'; END IF;
  BEGIN v_date := make_date(p_year, p_month, p_day);
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Date invalide.'; END;
  v_age := extract(year FROM age((now() AT TIME ZONE 'Africa/Porto-Novo')::date, v_date));
  IF v_age < 10 OR v_age > 100 THEN RAISE EXCEPTION 'Date invalide.'; END IF;
  IF EXISTS (SELECT 1 FROM customer_birthdays WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Ta date est déjà enregistrée. Pour la corriger, contacte BOUFF.';
  END IF;
  INSERT INTO customer_birthdays(user_id, month, day, year) VALUES (auth.uid(), p_month, p_day, p_year);
  RETURN jsonb_build_object('month', p_month, 'day', p_day, 'year', p_year);
END $$;
REVOKE ALL ON FUNCTION public.set_my_birthday(integer, integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_my_birthday(integer, integer, integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_my_birthday(integer, integer) FROM authenticated;