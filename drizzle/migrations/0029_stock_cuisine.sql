-- BOUFF — Stock & cuisine : produits, réceptions, pertes, comptages, dépenses, contrôles hygiène.
-- Lecture : équipe du restaurant (gérant, cuisine, super-admin). Écriture : uniquement via les fonctions ci-dessous.

CREATE TABLE public.stock_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  category text NOT NULL DEFAULT 'Autre',
  unit text NOT NULL DEFAULT 'pièce',
  qty numeric(12,3) NOT NULL DEFAULT 0 CHECK (qty >= 0),
  min_qty numeric(12,3) NOT NULL DEFAULT 0 CHECK (min_qty >= 0),
  unit_cost_fcfa integer CHECK (unit_cost_fcfa IS NULL OR unit_cost_fcfa >= 0),
  supplier text,
  count_daily boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX stock_products_name_uq ON public.stock_products (restaurant_id, lower(btrim(name)));
GRANT SELECT ON public.stock_products TO authenticated;
GRANT ALL ON public.stock_products TO service_role;
ALTER TABLE public.stock_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_products_read ON public.stock_products FOR SELECT TO authenticated
  USING (private.manages_restaurant(auth.uid(), restaurant_id));

CREATE TABLE public.stock_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('soir','complet')),
  local_day date NOT NULL DEFAULT ((now() AT TIME ZONE 'Africa/Porto-Novo')::date),
  lines_count integer NOT NULL DEFAULT 0,
  gap_value_fcfa integer NOT NULL DEFAULT 0,
  note text,
  author_id uuid,
  author_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_counts_day_idx ON public.stock_counts (restaurant_id, local_day DESC);
GRANT SELECT ON public.stock_counts TO authenticated;
GRANT ALL ON public.stock_counts TO service_role;
ALTER TABLE public.stock_counts ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_counts_read ON public.stock_counts FOR SELECT TO authenticated
  USING (private.manages_restaurant(auth.uid(), restaurant_id));

CREATE TABLE public.stock_count_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id uuid NOT NULL REFERENCES public.stock_counts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.stock_products(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  unit text NOT NULL,
  expected numeric(12,3) NOT NULL,
  counted numeric(12,3) NOT NULL,
  gap numeric(12,3) NOT NULL,
  gap_value_fcfa integer NOT NULL DEFAULT 0
);
CREATE INDEX stock_count_lines_count_idx ON public.stock_count_lines (count_id);
GRANT SELECT ON public.stock_count_lines TO authenticated;
GRANT ALL ON public.stock_count_lines TO service_role;
ALTER TABLE public.stock_count_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_count_lines_read ON public.stock_count_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stock_counts c WHERE c.id = count_id
                 AND private.manages_restaurant(auth.uid(), c.restaurant_id)));

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  local_day date NOT NULL DEFAULT ((now() AT TIME ZONE 'Africa/Porto-Novo')::date),
  category text NOT NULL,
  amount_fcfa integer NOT NULL CHECK (amount_fcfa > 0),
  paid_from text NOT NULL CHECK (paid_from IN ('caisse','direction')),
  description text,
  source text NOT NULL DEFAULT 'manuel' CHECK (source IN ('manuel','reception')),
  cancelled_at timestamptz,
  cancelled_by_name text,
  author_id uuid,
  author_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX expenses_day_idx ON public.expenses (restaurant_id, local_day DESC);
GRANT SELECT ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY expenses_read ON public.expenses FOR SELECT TO authenticated
  USING (private.has_restaurant_role(auth.uid(), 'restaurant_admin', restaurant_id));

CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.stock_products(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('reception','perte','inventaire','annulation')),
  qty_delta numeric(12,3) NOT NULL,
  qty_after numeric(12,3) NOT NULL,
  value_fcfa integer NOT NULL DEFAULT 0,
  reason text,
  supplier text,
  note text,
  count_id uuid REFERENCES public.stock_counts(id) ON DELETE SET NULL,
  expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  cancels_id uuid REFERENCES public.stock_movements(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  author_id uuid,
  author_name text,
  local_day date NOT NULL DEFAULT ((now() AT TIME ZONE 'Africa/Porto-Novo')::date),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_movements_day_idx ON public.stock_movements (restaurant_id, local_day DESC, created_at DESC);
CREATE INDEX stock_movements_product_idx ON public.stock_movements (product_id, created_at DESC);
GRANT SELECT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_movements_read ON public.stock_movements FOR SELECT TO authenticated
  USING (private.manages_restaurant(auth.uid(), restaurant_id));

CREATE TABLE public.hygiene_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  local_day date NOT NULL DEFAULT ((now() AT TIME ZONE 'Africa/Porto-Novo')::date),
  moment text NOT NULL CHECK (moment IN ('ouverture','fermeture')),
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  fridge_temp numeric(4,1),
  freezer_temp numeric(4,1),
  all_ok boolean NOT NULL DEFAULT false,
  note text,
  author_id uuid,
  author_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, local_day, moment)
);
GRANT SELECT ON public.hygiene_checks TO authenticated;
GRANT ALL ON public.hygiene_checks TO service_role;
ALTER TABLE public.hygiene_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY hygiene_checks_read ON public.hygiene_checks FOR SELECT TO authenticated
  USING (private.manages_restaurant(auth.uid(), restaurant_id));

-- ---------- Aides internes ----------
CREATE OR REPLACE FUNCTION private.bj_today() RETURNS date
LANGUAGE sql STABLE SET search_path = public AS $$ SELECT (now() AT TIME ZONE 'Africa/Porto-Novo')::date $$;

CREATE OR REPLACE FUNCTION private.stock_author() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT NULLIF(btrim(full_name), '') FROM public.profiles WHERE id = auth.uid()),
    NULLIF(auth.jwt() ->> 'email', ''),
    'Équipe')
$$;

CREATE OR REPLACE FUNCTION private.stock_guard(p_restaurant_id uuid) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_restaurant_id IS NULL OR NOT private.manages_restaurant(auth.uid(), p_restaurant_id) THEN
    RAISE EXCEPTION 'Action non autorisée.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION private.qty_txt(q numeric) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT replace(trim_scale(q)::text, '.', ',') $$;

-- ---------- Produits ----------
CREATE OR REPLACE FUNCTION public.stock_save_product(p_restaurant_id uuid, p_product jsonb)
RETURNS public.stock_products
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.stock_products;
  v_id uuid := NULLIF(p_product->>'id', '')::uuid;
  v_name text := btrim(COALESCE(p_product->>'name', ''));
  v_min numeric := COALESCE(NULLIF(p_product->>'min_qty', '')::numeric, 0);
  v_cost integer := NULLIF(p_product->>'unit_cost_fcfa', '')::numeric::integer;
BEGIN
  IF NOT private.has_restaurant_role(auth.uid(), 'restaurant_admin', p_restaurant_id) THEN
    RAISE EXCEPTION 'Action non autorisée.';
  END IF;
  IF v_name = '' THEN RAISE EXCEPTION 'Nom du produit obligatoire.'; END IF;
  IF v_min < 0 THEN RAISE EXCEPTION 'Le stock minimum ne peut pas être négatif.'; END IF;
  IF v_cost IS NOT NULL AND v_cost < 0 THEN RAISE EXCEPTION 'Prix invalide.'; END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.stock_products (restaurant_id, name, category, unit, min_qty, unit_cost_fcfa, supplier, count_daily, sort_order)
    VALUES (p_restaurant_id, v_name,
      COALESCE(NULLIF(btrim(p_product->>'category'), ''), 'Autre'),
      COALESCE(NULLIF(btrim(p_product->>'unit'), ''), 'pièce'),
      v_min, v_cost, NULLIF(btrim(p_product->>'supplier'), ''),
      COALESCE((p_product->>'count_daily')::boolean, false),
      (SELECT COALESCE(max(sort_order), 0) + 1 FROM public.stock_products WHERE restaurant_id = p_restaurant_id))
    RETURNING * INTO v;
  ELSE
    UPDATE public.stock_products SET
      name = v_name,
      category = COALESCE(NULLIF(btrim(p_product->>'category'), ''), category),
      unit = COALESCE(NULLIF(btrim(p_product->>'unit'), ''), unit),
      min_qty = v_min,
      unit_cost_fcfa = v_cost,
      supplier = NULLIF(btrim(p_product->>'supplier'), ''),
      count_daily = COALESCE((p_product->>'count_daily')::boolean, count_daily),
      is_active = COALESCE((p_product->>'is_active')::boolean, is_active),
      updated_at = now()
    WHERE id = v_id AND restaurant_id = p_restaurant_id
    RETURNING * INTO v;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produit introuvable.'; END IF;
  END IF;
  RETURN v;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Un produit porte déjà ce nom.';
END $$;

-- ---------- Réception (arrivage) : stock + dépense automatique si payé ----------
CREATE OR REPLACE FUNCTION public.stock_receive(p_restaurant_id uuid, p_lines jsonb, p_supplier text DEFAULT NULL,
  p_paid_from text DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l jsonb; p public.stock_products; q numeric; t integer;
  v_total integer := 0; v_n integer := 0; v_exp uuid; v_mid uuid; v_ids uuid[] := '{}';
  v_names text[] := '{}'; v_author text := private.stock_author();
  v_supplier text := NULLIF(btrim(p_supplier), '');
BEGIN
  PERFORM private.stock_guard(p_restaurant_id);
  IF p_paid_from IS NOT NULL AND p_paid_from NOT IN ('caisse','direction') THEN
    RAISE EXCEPTION 'Mode de paiement invalide.';
  END IF;
  IF p_paid_from IS NOT NULL AND NOT private.has_restaurant_role(auth.uid(), 'restaurant_admin', p_restaurant_id) THEN
    RAISE EXCEPTION 'Seule la gérance peut enregistrer un paiement.';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Ajoute au moins un produit.';
  END IF;
  FOR l IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    q := NULLIF(l->>'qty', '')::numeric;
    t := COALESCE(NULLIF(l->>'total_fcfa', '')::numeric::integer, 0);
    IF q IS NULL OR q <= 0 THEN RAISE EXCEPTION 'Quantité reçue invalide.'; END IF;
    IF t < 0 THEN RAISE EXCEPTION 'Montant invalide.'; END IF;
    SELECT * INTO p FROM public.stock_products
      WHERE id = NULLIF(l->>'product_id', '')::uuid AND restaurant_id = p_restaurant_id AND is_active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produit introuvable.'; END IF;
    UPDATE public.stock_products SET
      qty = qty + q,
      unit_cost_fcfa = CASE WHEN t > 0 THEN round(t / q)::integer ELSE unit_cost_fcfa END,
      supplier = COALESCE(v_supplier, supplier),
      updated_at = now()
    WHERE id = p.id RETURNING * INTO p;
    INSERT INTO public.stock_movements (restaurant_id, product_id, kind, qty_delta, qty_after, value_fcfa, supplier, note, author_id, author_name)
    VALUES (p_restaurant_id, p.id, 'reception', q, p.qty, t, v_supplier, NULLIF(btrim(p_note), ''), auth.uid(), v_author)
    RETURNING id INTO v_mid;
    v_ids := v_ids || v_mid;
    v_total := v_total + t;
    v_n := v_n + 1;
    v_names := v_names || p.name;
  END LOOP;
  IF p_paid_from IS NOT NULL AND v_total > 0 THEN
    INSERT INTO public.expenses (restaurant_id, category, amount_fcfa, paid_from, description, source, author_id, author_name)
    VALUES (p_restaurant_id, 'Achats marchandises', v_total, p_paid_from,
      left('Réception : ' || array_to_string(v_names, ', ') || COALESCE(' — ' || v_supplier, ''), 300),
      'reception', auth.uid(), v_author)
    RETURNING id INTO v_exp;
    UPDATE public.stock_movements SET expense_id = v_exp WHERE id = ANY (v_ids);
  END IF;
  RETURN jsonb_build_object('lines', v_n, 'total_fcfa', v_total, 'expense_id', v_exp);
END $$;

-- ---------- Perte ----------
CREATE OR REPLACE FUNCTION public.stock_loss(p_restaurant_id uuid, p_product_id uuid, p_qty numeric, p_reason text, p_note text DEFAULT NULL)
RETURNS public.stock_movements
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.stock_products; m public.stock_movements;
BEGIN
  PERFORM private.stock_guard(p_restaurant_id);
  IF p_qty IS NULL OR p_qty <= 0 THEN RAISE EXCEPTION 'Quantité perdue invalide.'; END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'Choisis le motif de la perte.'; END IF;
  SELECT * INTO p FROM public.stock_products WHERE id = p_product_id AND restaurant_id = p_restaurant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Produit introuvable.'; END IF;
  IF p.qty < p_qty THEN
    RAISE EXCEPTION 'Il ne reste que % % de « % » en stock. Vérifie la quantité ou fais un comptage.',
      private.qty_txt(p.qty), p.unit, p.name;
  END IF;
  UPDATE public.stock_products SET qty = qty - p_qty, updated_at = now() WHERE id = p.id RETURNING * INTO p;
  INSERT INTO public.stock_movements (restaurant_id, product_id, kind, qty_delta, qty_after, value_fcfa, reason, note, author_id, author_name)
  VALUES (p_restaurant_id, p.id, 'perte', -p_qty, p.qty, round(p_qty * COALESCE(p.unit_cost_fcfa, 0))::integer,
    btrim(p_reason), NULLIF(btrim(p_note), ''), auth.uid(), private.stock_author())
  RETURNING * INTO m;
  RETURN m;
END $$;

-- ---------- Comptage (inventaire) : le stock devient la quantité comptée, l'écart est gardé ----------
CREATE OR REPLACE FUNCTION public.stock_save_count(p_restaurant_id uuid, p_kind text, p_lines jsonb, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l jsonb; p public.stock_products; c numeric; g numeric; gv integer;
  v_count uuid; v_n integer := 0; v_total integer := 0; v_author text := private.stock_author();
BEGIN
  PERFORM private.stock_guard(p_restaurant_id);
  IF p_kind NOT IN ('soir','complet') THEN RAISE EXCEPTION 'Type de comptage invalide.'; END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN RAISE EXCEPTION 'Saisis au moins une quantité comptée.'; END IF;
  INSERT INTO public.stock_counts (restaurant_id, kind, note, author_id, author_name)
  VALUES (p_restaurant_id, p_kind, NULLIF(btrim(p_note), ''), auth.uid(), v_author) RETURNING id INTO v_count;
  FOR l IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    c := NULLIF(l->>'counted', '')::numeric;
    CONTINUE WHEN c IS NULL;
    IF c < 0 THEN RAISE EXCEPTION 'Quantité comptée invalide.'; END IF;
    SELECT * INTO p FROM public.stock_products
      WHERE id = NULLIF(l->>'product_id', '')::uuid AND restaurant_id = p_restaurant_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produit introuvable.'; END IF;
    g := c - p.qty;
    gv := round(g * COALESCE(p.unit_cost_fcfa, 0))::integer;
    INSERT INTO public.stock_count_lines (count_id, product_id, product_name, unit, expected, counted, gap, gap_value_fcfa)
    VALUES (v_count, p.id, p.name, p.unit, p.qty, c, g, gv);
    IF g <> 0 THEN
      UPDATE public.stock_products SET qty = c, updated_at = now() WHERE id = p.id;
      INSERT INTO public.stock_movements (restaurant_id, product_id, kind, qty_delta, qty_after, value_fcfa, reason, count_id, author_id, author_name)
      VALUES (p_restaurant_id, p.id, 'inventaire', g, c, gv,
        CASE p_kind WHEN 'soir' THEN 'Comptage du soir' ELSE 'Inventaire complet' END, v_count, auth.uid(), v_author);
    END IF;
    v_n := v_n + 1;
    v_total := v_total + gv;
  END LOOP;
  IF v_n = 0 THEN RAISE EXCEPTION 'Saisis au moins une quantité comptée.'; END IF;
  UPDATE public.stock_counts SET lines_count = v_n, gap_value_fcfa = v_total WHERE id = v_count;
  RETURN jsonb_build_object('count_id', v_count, 'lines', v_n, 'gap_value_fcfa', v_total);
END $$;

-- ---------- Annuler une erreur de saisie (réception ou perte, du jour ou de la veille) ----------
CREATE OR REPLACE FUNCTION public.stock_cancel_movement(p_movement_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.stock_movements; p public.stock_products; e public.expenses;
BEGIN
  SELECT * INTO m FROM public.stock_movements WHERE id = p_movement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Saisie introuvable.'; END IF;
  PERFORM private.stock_guard(m.restaurant_id);
  IF m.kind NOT IN ('reception','perte') THEN RAISE EXCEPTION 'Seules les réceptions et les pertes peuvent être annulées.'; END IF;
  IF m.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'Cette saisie est déjà annulée.'; END IF;
  IF m.local_day < private.bj_today() - 1 THEN
    RAISE EXCEPTION 'Saisie trop ancienne : corrige le stock avec un comptage.';
  END IF;
  SELECT * INTO p FROM public.stock_products WHERE id = m.product_id FOR UPDATE;
  IF p.qty - m.qty_delta < 0 THEN
    RAISE EXCEPTION 'Impossible : le stock deviendrait négatif. Fais plutôt un comptage.';
  END IF;
  UPDATE public.stock_products SET qty = qty - m.qty_delta, updated_at = now() WHERE id = p.id RETURNING * INTO p;
  UPDATE public.stock_movements SET cancelled_at = now() WHERE id = m.id;
  INSERT INTO public.stock_movements (restaurant_id, product_id, kind, qty_delta, qty_after, value_fcfa, reason, cancels_id, author_id, author_name)
  VALUES (m.restaurant_id, p.id, 'annulation', -m.qty_delta, p.qty, m.value_fcfa,
    CASE m.kind WHEN 'reception' THEN 'Annulation d''une réception' ELSE 'Annulation d''une perte' END,
    m.id, auth.uid(), private.stock_author());
  IF m.expense_id IS NOT NULL AND m.value_fcfa > 0 THEN
    SELECT * INTO e FROM public.expenses WHERE id = m.expense_id AND cancelled_at IS NULL FOR UPDATE;
    IF FOUND THEN
      IF e.amount_fcfa - m.value_fcfa <= 0 THEN
        UPDATE public.expenses SET cancelled_at = now(), cancelled_by_name = private.stock_author() WHERE id = e.id;
      ELSE
        UPDATE public.expenses SET amount_fcfa = amount_fcfa - m.value_fcfa WHERE id = e.id;
      END IF;
    END IF;
  END IF;
END $$;

-- ---------- Dépenses ----------
CREATE OR REPLACE FUNCTION public.expense_add(p_restaurant_id uuid, p_category text, p_amount integer, p_paid_from text, p_description text DEFAULT NULL)
RETURNS public.expenses
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.expenses;
BEGIN
  IF NOT private.has_restaurant_role(auth.uid(), 'restaurant_admin', p_restaurant_id) THEN
    RAISE EXCEPTION 'Action non autorisée.';
  END IF;
  IF NULLIF(btrim(p_category), '') IS NULL THEN RAISE EXCEPTION 'Choisis le type de dépense.'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Montant invalide.'; END IF;
  IF p_amount > 5000000 THEN RAISE EXCEPTION 'Montant trop élevé : vérifie le chiffre.'; END IF;
  IF p_paid_from NOT IN ('caisse','direction') THEN RAISE EXCEPTION 'Indique qui a payé (caisse ou direction).'; END IF;
  INSERT INTO public.expenses (restaurant_id, category, amount_fcfa, paid_from, description, author_id, author_name)
  VALUES (p_restaurant_id, btrim(p_category), p_amount, p_paid_from, NULLIF(btrim(p_description), ''), auth.uid(), private.stock_author())
  RETURNING * INTO e;
  RETURN e;
END $$;

CREATE OR REPLACE FUNCTION public.expense_cancel(p_expense_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.expenses;
BEGIN
  SELECT * INTO e FROM public.expenses WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dépense introuvable.'; END IF;
  IF NOT private.has_restaurant_role(auth.uid(), 'restaurant_admin', e.restaurant_id) THEN
    RAISE EXCEPTION 'Action non autorisée.';
  END IF;
  IF e.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'Dépense déjà annulée.'; END IF;
  IF e.source = 'reception' THEN
    RAISE EXCEPTION 'Cette dépense vient d''une réception : annule la réception dans l''historique.';
  END IF;
  IF e.local_day < private.bj_today() - 1 THEN RAISE EXCEPTION 'Dépense trop ancienne pour être annulée.'; END IF;
  UPDATE public.expenses SET cancelled_at = now(), cancelled_by_name = private.stock_author() WHERE id = e.id;
END $$;

-- ---------- Contrôles hygiène (ouverture / fermeture) ----------
CREATE OR REPLACE FUNCTION public.hygiene_save(p_restaurant_id uuid, p_moment text, p_items jsonb,
  p_fridge_temp numeric, p_freezer_temp numeric, p_note text DEFAULT NULL)
RETURNS public.hygiene_checks
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE h public.hygiene_checks; v_ok boolean;
BEGIN
  PERFORM private.stock_guard(p_restaurant_id);
  IF p_moment NOT IN ('ouverture','fermeture') THEN RAISE EXCEPTION 'Moment invalide.'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Liste de contrôle vide.';
  END IF;
  IF p_fridge_temp IS NULL OR p_freezer_temp IS NULL THEN
    RAISE EXCEPTION 'Note la température du frigo et du congélateur.';
  END IF;
  IF p_fridge_temp NOT BETWEEN -30 AND 40 OR p_freezer_temp NOT BETWEEN -40 AND 30 THEN
    RAISE EXCEPTION 'Température invalide : vérifie le chiffre.';
  END IF;
  v_ok := NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) e WHERE COALESCE((e->>'ok')::boolean, false) = false)
          AND p_fridge_temp <= 5 AND p_freezer_temp <= -18;
  INSERT INTO public.hygiene_checks (restaurant_id, local_day, moment, items, fridge_temp, freezer_temp, all_ok, note, author_id, author_name)
  VALUES (p_restaurant_id, private.bj_today(), p_moment, p_items, p_fridge_temp, p_freezer_temp, v_ok,
    NULLIF(btrim(p_note), ''), auth.uid(), private.stock_author())
  ON CONFLICT (restaurant_id, local_day, moment) DO UPDATE SET
    items = excluded.items, fridge_temp = excluded.fridge_temp, freezer_temp = excluded.freezer_temp,
    all_ok = excluded.all_ok, note = excluded.note, author_id = excluded.author_id,
    author_name = excluded.author_name, updated_at = now()
  RETURNING * INTO h;
  RETURN h;
END $$;

-- ---------- Résumé d'une journée ----------
CREATE OR REPLACE FUNCTION private.stock_day_json(p_restaurant_id uuid, p_day date)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH s AS (SELECT COALESCE((public.stats_compute(p_restaurant_id, p_day, p_day)->'kpis'->>'sales')::numeric::integer, 0) AS sales),
  ex AS (SELECT COALESCE(sum(amount_fcfa), 0)::integer AS total,
                COALESCE(sum(amount_fcfa) FILTER (WHERE paid_from = 'caisse'), 0)::integer AS caisse,
                count(*)::integer AS n
         FROM public.expenses WHERE restaurant_id = p_restaurant_id AND local_day = p_day AND cancelled_at IS NULL),
  mv AS (SELECT COALESCE(sum(value_fcfa) FILTER (WHERE kind = 'reception'), 0)::integer AS received,
                count(*) FILTER (WHERE kind = 'reception')::integer AS received_n,
                COALESCE(sum(value_fcfa) FILTER (WHERE kind = 'perte'), 0)::integer AS losses,
                count(*) FILTER (WHERE kind = 'perte')::integer AS losses_n
         FROM public.stock_movements WHERE restaurant_id = p_restaurant_id AND local_day = p_day AND cancelled_at IS NULL),
  ct AS (SELECT COALESCE(sum(gap_value_fcfa), 0)::integer AS gap,
                COALESCE(jsonb_agg(DISTINCT kind), '[]'::jsonb) AS kinds
         FROM public.stock_counts WHERE restaurant_id = p_restaurant_id AND local_day = p_day),
  cl AS (SELECT COALESCE(sum(gap_fcfa), 0)::integer AS gap, count(*)::integer AS n
         FROM public.cashier_closures
         WHERE restaurant_id = p_restaurant_id AND (closed_at AT TIME ZONE 'Africa/Porto-Novo')::date = p_day),
  hy AS (SELECT COALESCE(jsonb_object_agg(moment, jsonb_build_object('ok', all_ok, 'by', author_name, 'at', updated_at)), '{}'::jsonb) AS h
         FROM public.hygiene_checks WHERE restaurant_id = p_restaurant_id AND local_day = p_day),
  lo AS (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'qty', qty, 'min_qty', min_qty, 'unit', unit) ORDER BY sort_order), '[]'::jsonb) AS l
         FROM public.stock_products
         WHERE restaurant_id = p_restaurant_id AND is_active AND min_qty > 0 AND qty <= min_qty)
  SELECT jsonb_build_object(
    'day', p_day,
    'sales', s.sales,
    'expenses', ex.total, 'expenses_caisse', ex.caisse, 'expenses_count', ex.n,
    'received', mv.received, 'received_count', mv.received_n,
    'losses', mv.losses, 'losses_count', mv.losses_n,
    'count_gap', ct.gap, 'counts', ct.kinds,
    'closures_gap', cl.gap, 'closures_count', cl.n,
    'hygiene', hy.h,
    'low_stock', lo.l,
    'money_left', s.sales - ex.total)
  FROM s, ex, mv, ct, cl, hy, lo
$$;

CREATE OR REPLACE FUNCTION public.stock_day(p_restaurant_id uuid, p_day date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM private.stock_guard(p_restaurant_id);
  RETURN private.stock_day_json(p_restaurant_id, COALESCE(p_day, private.bj_today()));
END $$;

REVOKE ALL ON FUNCTION private.stock_day_json(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stock_save_product(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stock_receive(uuid, jsonb, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stock_loss(uuid, uuid, numeric, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stock_save_count(uuid, text, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stock_cancel_movement(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expense_add(uuid, text, integer, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.expense_cancel(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hygiene_save(uuid, text, jsonb, numeric, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.stock_day(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_save_product(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stock_receive(uuid, jsonb, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stock_loss(uuid, uuid, numeric, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stock_save_count(uuid, text, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stock_cancel_movement(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expense_add(uuid, text, integer, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expense_cancel(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hygiene_save(uuid, text, jsonb, numeric, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stock_day(uuid, date) TO authenticated, service_role;

-- ---------- Résumé de 1 h : ajoute dépenses, pertes et stock bas ----------
CREATE OR REPLACE FUNCTION public.daily_report_tick()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; v_day date := (now() at time zone 'Africa/Porto-Novo')::date - 1; s jsonb; k jsonb; st jsonb; n int := 0;
begin
  for r in select id, name from restaurants where is_active loop
    s := public.stats_compute(r.id, v_day, v_day)
      || jsonb_build_object('previous', public.stats_compute(r.id, v_day - 7, v_day - 7)->'kpis');
    begin
      st := private.stock_day_json(r.id, v_day);
    exception when others then
      st := null;
    end;
    if st is not null then s := s || jsonb_build_object('stock', st); end if;
    insert into daily_reports(restaurant_id, report_date, data) values (r.id, v_day, s)
      on conflict (restaurant_id, report_date) do update set data = excluded.data, created_at = now();
    k := s->'kpis';
    insert into notifications(user_id, title, body)
    select distinct ur.user_id, 'Résumé du ' || to_char(v_day, 'DD/MM'),
      (k->>'orders') || ' commandes · ' || (k->>'sales') || ' F · panier moyen ' || (k->>'avg_ticket') || ' F · ' || (k->>'cancelled') || ' annulées'
      || coalesce(' · dépenses ' || (st->>'expenses') || ' F · pertes ' || (st->>'losses') || ' F', '')
      || case when coalesce(jsonb_array_length(st->'low_stock'), 0) > 0
              then ' · ' || jsonb_array_length(st->'low_stock') || ' produit(s) en stock bas' else '' end
    from user_roles ur where ur.role = 'restaurant_admin' and ur.restaurant_id = r.id;
    n := n + 1;
  end loop;
  return n;
end $function$;

-- ---------- Liste de départ pour BOUFF (à corriger par la direction) ----------
INSERT INTO public.stock_products (restaurant_id, name, category, unit, count_daily, sort_order)
SELECT r.id, v.name, v.category, v.unit, v.daily, v.ord
FROM public.restaurants r
CROSS JOIN (VALUES
  ('Viande hachée bœuf', 'Viandes', 'kg', true, 1),
  ('Viande kebab bœuf', 'Viandes', 'kg', true, 2),
  ('Filets de poulet', 'Viandes', 'kg', true, 3),
  ('Morceaux poulet KFC', 'Viandes', 'kg', true, 4),
  ('Bacon', 'Viandes', 'kg', false, 5),
  ('Jambon', 'Viandes', 'kg', false, 6),
  ('Pains burger', 'Pains & pâtes', 'pièce', true, 10),
  ('Pains kebab', 'Pains & pâtes', 'pièce', true, 11),
  ('Galettes tacos', 'Pains & pâtes', 'pièce', true, 12),
  ('Pâtons mini-pizza', 'Pains & pâtes', 'pièce', true, 13),
  ('Pain de mie', 'Pains & pâtes', 'pièce', false, 14),
  ('Cheddar en tranches', 'Fromages & crèmerie', 'pièce', true, 20),
  ('Mozzarella', 'Fromages & crèmerie', 'kg', false, 21),
  ('Beurre', 'Fromages & crèmerie', 'kg', false, 22),
  ('Œufs', 'Fromages & crèmerie', 'pièce', false, 23),
  ('Pommes de terre (frites)', 'Légumes', 'kg', true, 30),
  ('Tomates', 'Légumes', 'kg', false, 31),
  ('Oignons', 'Légumes', 'kg', false, 32),
  ('Salade', 'Légumes', 'pièce', false, 33),
  ('Cornichons', 'Légumes', 'pièce', false, 34),
  ('Huile de friture', 'Huile & épices', 'L', true, 40),
  ('Farine (panure)', 'Huile & épices', 'kg', false, 41),
  ('Épices et assaisonnements', 'Huile & épices', 'pièce', false, 42),
  ('Sel', 'Huile & épices', 'kg', false, 43),
  ('Ketchup', 'Sauces', 'L', false, 50),
  ('Mayonnaise', 'Sauces', 'L', false, 51),
  ('Moutarde', 'Sauces', 'L', false, 52),
  ('Sauce barbecue', 'Sauces', 'L', false, 53),
  ('Sauce fromagère', 'Sauces', 'L', false, 54),
  ('Coca-Cola', 'Boissons', 'pièce', true, 60),
  ('Fanta', 'Boissons', 'pièce', true, 61),
  ('Sprite', 'Boissons', 'pièce', true, 62),
  ('Ice tea', 'Boissons', 'pièce', true, 63),
  ('Eau minérale', 'Boissons', 'pièce', true, 64),
  ('Oranges (jus)', 'Boissons', 'kg', false, 65),
  ('Citrons (limonade)', 'Boissons', 'kg', false, 66),
  ('Sucre', 'Boissons', 'kg', false, 67),
  ('Wraps alu BOUFF', 'Emballages', 'pièce', false, 70),
  ('Sacs kraft livraison', 'Emballages', 'pièce', false, 71),
  ('Boîtes à frites', 'Emballages', 'pièce', false, 72),
  ('Boîtes mini-pizza', 'Emballages', 'pièce', false, 73),
  ('Gobelets', 'Emballages', 'pièce', false, 74),
  ('Pots à sauce', 'Emballages', 'pièce', false, 75),
  ('Serviettes', 'Emballages', 'paquet', false, 76),
  ('Film alimentaire', 'Emballages', 'rouleau', false, 77),
  ('Bouteille de gaz', 'Gaz & entretien', 'pièce', false, 80),
  ('Liquide vaisselle', 'Gaz & entretien', 'L', false, 81),
  ('Eau de Javel', 'Gaz & entretien', 'L', false, 82),
  ('Sacs poubelle', 'Gaz & entretien', 'rouleau', false, 83),
  ('Gants jetables', 'Gaz & entretien', 'boîte', false, 84)
) AS v(name, category, unit, daily, ord)
WHERE r.slug = 'bouff'
ON CONFLICT DO NOTHING;