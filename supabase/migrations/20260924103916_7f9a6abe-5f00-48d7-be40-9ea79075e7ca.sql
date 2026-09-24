
CREATE TABLE public.restaurant_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  price_fcfa integer NOT NULL DEFAULT 0 CHECK (price_fcfa >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.restaurant_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  min_select integer NOT NULL DEFAULT 0 CHECK (min_select >= 0),
  max_select integer NOT NULL DEFAULT 1 CHECK (max_select >= 1),
  option_ids uuid[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.restaurant_options, public.restaurant_addons TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurant_options, public.restaurant_addons TO authenticated;
GRANT ALL ON public.restaurant_options, public.restaurant_addons TO service_role;
ALTER TABLE public.restaurant_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_addons ENABLE ROW LEVEL SECURITY;
CREATE POLICY ropt_read ON public.restaurant_options FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY ropt_manage ON public.restaurant_options FOR ALL TO authenticated
  USING (private.has_restaurant_role(auth.uid(),'restaurant_admin',restaurant_id))
  WITH CHECK (private.has_restaurant_role(auth.uid(),'restaurant_admin',restaurant_id));
CREATE POLICY radd_read ON public.restaurant_addons FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY radd_manage ON public.restaurant_addons FOR ALL TO authenticated
  USING (private.has_restaurant_role(auth.uid(),'restaurant_admin',restaurant_id))
  WITH CHECK (private.has_restaurant_role(auth.uid(),'restaurant_admin',restaurant_id));
CREATE TRIGGER ropt_updated BEFORE UPDATE ON public.restaurant_options FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER radd_updated BEFORE UPDATE ON public.restaurant_addons FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX ropt_restaurant_idx ON public.restaurant_options(restaurant_id);
CREATE INDEX radd_restaurant_idx ON public.restaurant_addons(restaurant_id);

ALTER TABLE public.option_groups ADD COLUMN source_addon_id uuid REFERENCES public.restaurant_addons(id) ON DELETE SET NULL;
ALTER TABLE public.options ADD COLUMN source_option_id uuid REFERENCES public.restaurant_options(id) ON DELETE SET NULL;
ALTER TABLE public.item_variants ADD COLUMN addon_ids uuid[] NOT NULL DEFAULT '{}';
CREATE INDEX option_groups_source_idx ON public.option_groups(source_addon_id);
CREATE INDEX options_source_idx ON public.options(source_option_id);

-- Reprise de l'existant
INSERT INTO public.restaurant_options(restaurant_id, title, price_fcfa)
SELECT DISTINCT m.restaurant_id, o.name, o.price_delta_fcfa
FROM public.options o JOIN public.option_groups g ON g.id=o.group_id JOIN public.menu_items m ON m.id=g.menu_item_id;
UPDATE public.options o SET source_option_id = ro.id
FROM public.option_groups g, public.menu_items m, public.restaurant_options ro
WHERE g.id=o.group_id AND m.id=g.menu_item_id AND ro.restaurant_id=m.restaurant_id AND ro.title=o.name AND ro.price_fcfa=o.price_delta_fcfa;
INSERT INTO public.restaurant_addons(restaurant_id, title, min_select, max_select, option_ids)
SELECT m.restaurant_id, g.name, min(g.min_select), max(g.max_select),
  COALESCE(array_agg(DISTINCT o.source_option_id) FILTER (WHERE o.source_option_id IS NOT NULL), '{}')
FROM public.option_groups g JOIN public.menu_items m ON m.id=g.menu_item_id LEFT JOIN public.options o ON o.group_id=g.id
GROUP BY m.restaurant_id, g.name;
UPDATE public.option_groups g SET source_addon_id = ra.id
FROM public.menu_items m, public.restaurant_addons ra
WHERE m.id=g.menu_item_id AND ra.restaurant_id=m.restaurant_id AND ra.title=g.name;
UPDATE public.item_variants v SET addon_ids = COALESCE((
  SELECT array_agg(DISTINCT g.source_addon_id) FROM public.option_groups g
  WHERE g.menu_item_id=v.menu_item_id AND g.source_addon_id IS NOT NULL
    AND (g.applies_to_kind IS NULL OR g.applies_to_kind = v.kind)), '{}');

-- Recopie un groupe de la bibliothèque sur un plat
CREATE OR REPLACE FUNCTION private.materialize_addon(p_item uuid, p_addon uuid, p_sort int)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE a public.restaurant_addons; g uuid;
BEGIN
  SELECT * INTO a FROM public.restaurant_addons WHERE id = p_addon;
  IF a.id IS NULL THEN RETURN; END IF;
  SELECT id INTO g FROM public.option_groups WHERE menu_item_id=p_item AND source_addon_id=p_addon LIMIT 1;
  IF g IS NULL THEN
    INSERT INTO public.option_groups(menu_item_id, name, min_select, max_select, sort_order, source_addon_id)
    VALUES (p_item, a.title, a.min_select, GREATEST(a.max_select,1), p_sort, p_addon) RETURNING id INTO g;
  ELSE
    UPDATE public.option_groups SET name=a.title, min_select=a.min_select, max_select=GREATEST(a.max_select,1), sort_order=p_sort WHERE id=g;
  END IF;
  DELETE FROM public.options WHERE group_id=g AND (source_option_id IS NULL OR NOT (source_option_id = ANY(a.option_ids)));
  INSERT INTO public.options(group_id, name, price_delta_fcfa, sort_order, source_option_id)
  SELECT g, ro.title, ro.price_fcfa, ord.n, ro.id
  FROM unnest(a.option_ids) WITH ORDINALITY ord(oid, n) JOIN public.restaurant_options ro ON ro.id = ord.oid
  WHERE NOT EXISTS (SELECT 1 FROM public.options x WHERE x.group_id=g AND x.source_option_id=ro.id);
  UPDATE public.options x SET name=ro.title, price_delta_fcfa=ro.price_fcfa
  FROM public.restaurant_options ro WHERE x.group_id=g AND x.source_option_id=ro.id;
END $$;

-- Enregistre un plat complet (création ou modification)
CREATE OR REPLACE FUNCTION public.admin_save_food(p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item uuid; v_rest uuid := (p->>'restaurant_id')::uuid; v jsonb; v_ids uuid[] := '{}'; v_vid uuid;
  v_addons uuid[] := '{}'; v_count int; v_kind variant_kind; v_name text; v_idx int := 0; a uuid;
BEGIN
  IF NOT private.has_restaurant_role(auth.uid(),'restaurant_admin',v_rest) THEN RAISE EXCEPTION 'Action non autorisée.'; END IF;
  v_count := jsonb_array_length(COALESCE(p->'variations','[]'::jsonb));
  IF v_count = 0 THEN RAISE EXCEPTION 'Ajoutez au moins une formule avec un prix.'; END IF;
  v_item := NULLIF(p->>'id','')::uuid;
  IF v_item IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.menu_items WHERE id=v_item AND restaurant_id=v_rest) THEN
    RAISE EXCEPTION 'Plat introuvable.';
  END IF;
  IF v_item IS NULL THEN
    INSERT INTO public.menu_items(restaurant_id, category_id, name, description, image_url, base_price_fcfa, is_available)
    VALUES (v_rest, NULLIF(p->>'category_id','')::uuid, p->>'name', NULLIF(p->>'description',''), NULLIF(p->>'image_url',''), 0, COALESCE((p->>'is_available')::boolean, true))
    RETURNING id INTO v_item;
  ELSE
    UPDATE public.menu_items SET category_id=NULLIF(p->>'category_id','')::uuid, name=p->>'name', description=NULLIF(p->>'description',''),
      image_url=COALESCE(NULLIF(p->>'image_url',''), image_url), is_available=COALESCE((p->>'is_available')::boolean, is_available)
    WHERE id=v_item;
  END IF;
  FOR v IN SELECT * FROM jsonb_array_elements(p->'variations') LOOP
    v_idx := v_idx + 1;
    v_name := COALESCE(NULLIF(trim(v->>'name'),''), 'Standard');
    v_kind := CASE WHEN v_count = 1 THEN 'single'
      WHEN v_name ILIKE '%combo%' OR v_name ILIKE '%menu%' THEN 'combo'
      WHEN v_name ILIKE '%frite%' THEN 'fries' ELSE 'solo' END;
    v_vid := NULLIF(v->>'id','')::uuid;
    IF v_vid IS NOT NULL AND EXISTS (SELECT 1 FROM public.item_variants WHERE id=v_vid AND menu_item_id=v_item) THEN
      UPDATE public.item_variants SET name=v_name, kind=v_kind, price_fcfa=(v->>'price')::int, sort_order=v_idx,
        is_available=COALESCE((v->>'is_available')::boolean, true), is_default=(v_idx=1),
        addon_ids=COALESCE(ARRAY(SELECT jsonb_array_elements_text(v->'addons'))::uuid[], '{}')
      WHERE id=v_vid;
    ELSE
      INSERT INTO public.item_variants(menu_item_id, name, kind, price_fcfa, sort_order, is_available, is_default, addon_ids)
      VALUES (v_item, v_name, v_kind, (v->>'price')::int, v_idx, COALESCE((v->>'is_available')::boolean, true), v_idx=1,
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(v->'addons'))::uuid[], '{}'))
      RETURNING id INTO v_vid;
    END IF;
    v_ids := v_ids || v_vid;
  END LOOP;
  -- Formules retirées : désactivées si déjà commandées, sinon supprimées
  UPDATE public.item_variants SET is_available=false WHERE menu_item_id=v_item AND NOT (id = ANY(v_ids))
    AND EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.variant_id=item_variants.id);
  DELETE FROM public.item_variants WHERE menu_item_id=v_item AND NOT (id = ANY(v_ids))
    AND NOT EXISTS (SELECT 1 FROM public.order_items oi WHERE oi.variant_id=item_variants.id);
  UPDATE public.menu_items SET base_price_fcfa=(SELECT min(price_fcfa) FROM public.item_variants WHERE menu_item_id=v_item AND id = ANY(v_ids)) WHERE id=v_item;
  SELECT COALESCE(array_agg(DISTINCT x), '{}') INTO v_addons FROM public.item_variants iv, unnest(iv.addon_ids) x WHERE iv.id = ANY(v_ids);
  DELETE FROM public.option_groups WHERE menu_item_id=v_item AND (source_addon_id IS NULL OR NOT (source_addon_id = ANY(v_addons)));
  v_idx := 0;
  FOREACH a IN ARRAY v_addons LOOP
    v_idx := v_idx + 1;
    PERFORM private.materialize_addon(v_item, a, v_idx);
    -- Groupe réservé aux formules qui l'ont choisi
    UPDATE public.option_groups g SET applies_to_kind = CASE
      WHEN (SELECT count(*) FROM public.item_variants iv WHERE iv.id = ANY(v_ids) AND NOT (a = ANY(iv.addon_ids))) = 0 THEN NULL
      ELSE (SELECT iv.kind FROM public.item_variants iv WHERE iv.id = ANY(v_ids) AND a = ANY(iv.addon_ids) LIMIT 1) END
    WHERE g.menu_item_id=v_item AND g.source_addon_id=a;
  END LOOP;
  RETURN v_item;
END $$;
REVOKE ALL ON FUNCTION public.admin_save_food(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_food(jsonb) TO authenticated;

-- Répercute une modification de la bibliothèque sur tous les plats
CREATE OR REPLACE FUNCTION public.admin_sync_library(p_restaurant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NOT private.has_restaurant_role(auth.uid(),'restaurant_admin',p_restaurant_id) THEN RAISE EXCEPTION 'Action non autorisée.'; END IF;
  FOR r IN SELECT g.menu_item_id, g.source_addon_id, g.sort_order FROM public.option_groups g JOIN public.menu_items m ON m.id=g.menu_item_id
    WHERE m.restaurant_id=p_restaurant_id AND g.source_addon_id IS NOT NULL LOOP
    PERFORM private.materialize_addon(r.menu_item_id, r.source_addon_id, r.sort_order);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.admin_sync_library(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_sync_library(uuid) TO authenticated;
