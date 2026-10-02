CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE TABLE public.escale_countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  country text NOT NULL,
  flag text NOT NULL DEFAULT '',
  dish text NOT NULL,
  description text,
  kitchen_base text,
  is_african boolean NOT NULL DEFAULT false,
  solo_price_fcfa integer NOT NULL DEFAULT 2000 CHECK (solo_price_fcfa > 0),
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, country)
);
GRANT SELECT ON public.escale_countries TO anon, authenticated;
GRANT ALL ON public.escale_countries TO service_role;
ALTER TABLE public.escale_countries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "escale countries readable" ON public.escale_countries FOR SELECT USING (true);
CREATE TRIGGER trg_escale_countries_updated BEFORE UPDATE ON public.escale_countries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.escales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  country_id uuid NOT NULL REFERENCES public.escale_countries(id),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','live','done','rejected','disabled')),
  needs_approval boolean NOT NULL DEFAULT false,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, starts_on)
);
GRANT SELECT ON public.escales TO anon, authenticated;
GRANT ALL ON public.escales TO service_role;
ALTER TABLE public.escales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "escales readable" ON public.escales FOR SELECT USING (true);
CREATE TRIGGER trg_escales_updated BEFORE UPDATE ON public.escales FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS escale_menu_item_id uuid REFERENCES public.menu_items(id) ON DELETE SET NULL;
ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS escale_per_month smallint NOT NULL DEFAULT 1 CHECK (escale_per_month IN (1,2));

-- Avant-dernier mercredi du mois (et 2e mercredi si 2 escales/mois)
CREATE OR REPLACE FUNCTION public.escale_dates(p_month date, p_per_month int)
RETURNS SETOF date LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  WITH m AS (SELECT date_trunc('month', p_month)::date AS d0),
  last_wed AS (
    SELECT (d0 + interval '1 month' - interval '1 day')::date
      - ((extract(dow from (d0 + interval '1 month' - interval '1 day'))::int - 3 + 7) % 7) AS lw, d0 FROM m
  )
  SELECT lw - 7 FROM last_wed
  UNION
  SELECT d0 + ((3 - extract(dow from d0)::int + 7) % 7) + 7 FROM last_wed WHERE p_per_month = 2
$$;

CREATE OR REPLACE FUNCTION private.escale_alert(p_restaurant uuid, p_title text, p_body text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.notifications(user_id, title, body)
  SELECT DISTINCT user_id, p_title, p_body FROM public.user_roles
  WHERE restaurant_id = p_restaurant AND role IN ('kitchen','restaurant_admin');
$$;

-- Applique l'escale en cours au plat « Escale BOUFF » de la carte
CREATE OR REPLACE FUNCTION private.escale_apply(p_restaurant uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item uuid; e record; v_cat uuid;
BEGIN
  SELECT escale_menu_item_id INTO v_item FROM restaurants WHERE id = p_restaurant;
  IF v_item IS NULL THEN RETURN; END IF;
  SELECT category_id INTO v_cat FROM menu_items WHERE id = v_item;
  SELECT es.*, c.country, c.flag, c.dish, c.description, c.solo_price_fcfa, c.image_url
    INTO e FROM escales es JOIN escale_countries c ON c.id = es.country_id
   WHERE es.restaurant_id = p_restaurant AND es.status = 'live' ORDER BY es.starts_on DESC LIMIT 1;
  IF e.id IS NULL THEN
    UPDATE menu_items SET is_available = false WHERE id = v_item;
    UPDATE categories SET is_active = false WHERE id = v_cat;
    RETURN;
  END IF;
  UPDATE menu_items SET
    name = trim(e.flag || ' ' || e.dish),
    description = 'Escale du mois : ' || e.country || ' — seulement jusqu''à jeudi soir. ' || coalesce(e.description, ''),
    image_url = coalesce(e.image_url, image_url),
    base_price_fcfa = e.solo_price_fcfa,
    is_available = true
  WHERE id = v_item;
  UPDATE item_variants SET price_fcfa = e.solo_price_fcfa + CASE kind WHEN 'fries' THEN 500 WHEN 'combo' THEN 1000 ELSE 0 END,
    is_available = true
  WHERE menu_item_id = v_item;
  UPDATE categories SET is_active = true WHERE id = v_cat;
END $$;

-- Passage quotidien : propose 10 jours avant, met en ligne mercredi, retire après jeudi
CREATE OR REPLACE FUNCTION public.escale_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; d date; v_today date := (now() AT TIME ZONE 'Africa/Porto-Novo')::date;
  v_last_african boolean; v_country record; v_need boolean;
BEGIN
  FOR r IN SELECT id, escale_per_month FROM restaurants WHERE escale_menu_item_id IS NOT NULL AND is_active LOOP
    -- fin
    UPDATE escales SET status = 'done' WHERE restaurant_id = r.id AND status = 'live' AND ends_on < v_today;
    -- non validées à temps
    UPDATE escales SET status = 'rejected' WHERE restaurant_id = r.id AND status = 'proposed' AND starts_on <= v_today;
    -- mise en ligne
    UPDATE escales SET status = 'live' WHERE restaurant_id = r.id AND status = 'approved' AND starts_on <= v_today AND ends_on >= v_today;
    -- propositions
    FOR d IN SELECT x FROM (
        SELECT public.escale_dates(v_today, r.escale_per_month) AS x
        UNION SELECT public.escale_dates((v_today + interval '1 month')::date, r.escale_per_month)) s
      WHERE x > v_today AND x <= v_today + 10 LOOP
      CONTINUE WHEN EXISTS (SELECT 1 FROM escales WHERE restaurant_id = r.id AND starts_on = d);
      SELECT c.is_african INTO v_last_african FROM escales es JOIN escale_countries c ON c.id = es.country_id
        WHERE es.restaurant_id = r.id ORDER BY es.starts_on DESC LIMIT 1;
      SELECT c.* INTO v_country FROM escale_countries c
       WHERE c.restaurant_id = r.id AND c.is_active
         AND NOT EXISTS (SELECT 1 FROM escales es WHERE es.country_id = c.id AND es.starts_on > d - 180 AND es.status <> 'rejected')
       ORDER BY (v_last_african IS NOT NULL AND c.is_african = v_last_african), random() LIMIT 1;
      CONTINUE WHEN v_country.id IS NULL;
      v_need := v_country.is_african;
      INSERT INTO escales(restaurant_id, country_id, starts_on, ends_on, status, needs_approval)
      VALUES (r.id, v_country.id, d, d + 1, CASE WHEN v_need THEN 'proposed' ELSE 'approved' END, v_need);
      PERFORM private.escale_alert(r.id,
        'Escale BOUFF : ' || v_country.country || ' le ' || to_char(d, 'DD/MM'),
        v_country.dish || '. Test en cuisine le lundi. ' ||
        CASE WHEN v_need THEN 'À valider par l''admin, sinon rien ne sera mis en ligne.'
             ELSE 'Mise en ligne automatique mercredi matin (l''admin peut désactiver).' END);
    END LOOP;
    PERFORM private.escale_apply(r.id);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.escale_tick() FROM PUBLIC, anon, authenticated;

-- Décision admin : approve / reject / disable
CREATE OR REPLACE FUNCTION public.admin_escale_decide(p_escale_id uuid, p_action text)
RETURNS public.escales LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.escales; v_today date := (now() AT TIME ZONE 'Africa/Porto-Novo')::date;
BEGIN
  SELECT * INTO e FROM escales WHERE id = p_escale_id;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Escale introuvable.'; END IF;
  IF NOT private.has_restaurant_role(auth.uid(), 'restaurant_admin', e.restaurant_id) THEN RAISE EXCEPTION 'Action non autorisée.'; END IF;
  IF p_action = 'approve' THEN
    IF e.status NOT IN ('proposed','rejected','disabled') OR e.ends_on < v_today THEN RAISE EXCEPTION 'Escale non validable.'; END IF;
    UPDATE escales SET status = CASE WHEN starts_on <= v_today THEN 'live' ELSE 'approved' END,
      decided_by = auth.uid(), decided_at = now() WHERE id = e.id RETURNING * INTO e;
  ELSIF p_action IN ('reject','disable') THEN
    UPDATE escales SET status = CASE WHEN p_action = 'reject' THEN 'rejected' ELSE 'disabled' END,
      decided_by = auth.uid(), decided_at = now() WHERE id = e.id RETURNING * INTO e;
  ELSE RAISE EXCEPTION 'Action inconnue.'; END IF;
  PERFORM private.escale_apply(e.restaurant_id);
  RETURN e;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_escale_decide(uuid, text) TO authenticated;

-- Escale en cours / à venir pour l'app client et la cuisine
CREATE OR REPLACE FUNCTION public.current_escale(p_restaurant uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'live', (SELECT jsonb_build_object('country', c.country, 'flag', c.flag, 'dish', c.dish, 'ends_on', es.ends_on)
             FROM escales es JOIN escale_countries c ON c.id = es.country_id
             WHERE es.restaurant_id = p_restaurant AND es.status = 'live' ORDER BY es.starts_on DESC LIMIT 1),
    'next', (SELECT jsonb_build_object('starts_on', es.starts_on)
             FROM escales es WHERE es.restaurant_id = p_restaurant AND es.status = 'approved' ORDER BY es.starts_on LIMIT 1));
$$;
GRANT EXECUTE ON FUNCTION public.current_escale(uuid) TO anon, authenticated;