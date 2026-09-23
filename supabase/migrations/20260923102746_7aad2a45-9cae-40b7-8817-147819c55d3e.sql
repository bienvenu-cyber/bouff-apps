-- =========================================================
-- BOUFF — socle multi-restaurants
-- =========================================================

CREATE TYPE public.app_role AS ENUM ('client','kitchen','rider','restaurant_admin','super_admin');
CREATE TYPE public.order_type AS ENUM ('takeaway','delivery');
CREATE TYPE public.order_status AS ENUM ('received','in_kitchen','ready','on_the_way','delivered','cancelled');
CREATE TYPE public.payment_method AS ENUM ('cash','mobile_money','card');
CREATE TYPE public.rider_status AS ENUM ('offline','available','on_delivery');
CREATE TYPE public.variant_kind AS ENUM ('solo','fries','combo','single');

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------- restaurants ----------
CREATE TABLE public.restaurants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  tagline text,
  description text,
  logo_url text,
  cover_url text,
  brand_color text NOT NULL DEFAULT '#ff7a1a',
  phone text,
  whatsapp_number text,
  address text,
  city text NOT NULL DEFAULT 'Parakou',
  commission_rate numeric(5,2) NOT NULL DEFAULT 0,
  accepts_takeaway boolean NOT NULL DEFAULT true,
  accepts_delivery boolean NOT NULL DEFAULT true,
  opens_at time,
  closes_at time,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- zones de livraison ----------
CREATE TABLE public.delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  fee_fcfa integer NOT NULL DEFAULT 0 CHECK (fee_fcfa >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX delivery_zones_restaurant_idx ON public.delivery_zones(restaurant_id);

-- ---------- categories ----------
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  image_url text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX categories_restaurant_idx ON public.categories(restaurant_id);

-- ---------- articles ----------
CREATE TABLE public.menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  image_url text,
  base_price_fcfa integer NOT NULL CHECK (base_price_fcfa >= 0),
  is_available boolean NOT NULL DEFAULT true,
  is_featured boolean NOT NULL DEFAULT false,
  available_weekday smallint CHECK (available_weekday BETWEEN 0 AND 6),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX menu_items_restaurant_idx ON public.menu_items(restaurant_id);
CREATE INDEX menu_items_category_idx ON public.menu_items(category_id);

-- ---------- formules ----------
CREATE TABLE public.item_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind public.variant_kind NOT NULL DEFAULT 'solo',
  price_fcfa integer NOT NULL CHECK (price_fcfa >= 0),
  is_default boolean NOT NULL DEFAULT false,
  is_available boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX item_variants_item_idx ON public.item_variants(menu_item_id);

-- ---------- options ----------
CREATE TABLE public.option_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  name text NOT NULL,
  min_select integer NOT NULL DEFAULT 0 CHECK (min_select >= 0),
  max_select integer NOT NULL DEFAULT 1 CHECK (max_select >= 1),
  applies_to_kind public.variant_kind,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX option_groups_item_idx ON public.option_groups(menu_item_id);

CREATE TABLE public.options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.option_groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_delta_fcfa integer NOT NULL DEFAULT 0,
  is_available boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX options_group_idx ON public.options(group_id);

-- ---------- profils ----------
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text,
  phone text,
  whatsapp_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- rôles ----------
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  restaurant_id uuid REFERENCES public.restaurants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX user_roles_unique_idx
  ON public.user_roles(user_id, role, COALESCE(restaurant_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin');
$$;

CREATE OR REPLACE FUNCTION public.has_restaurant_role(_user_id uuid, _role public.app_role, _restaurant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = 'super_admin'
        OR (role = _role AND restaurant_id = _restaurant_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.manages_restaurant(_user_id uuid, _restaurant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        role = 'super_admin'
        OR (role IN ('restaurant_admin','kitchen') AND restaurant_id = _restaurant_id)
      )
  );
$$;

-- ---------- livreurs ----------
CREATE TABLE public.riders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text,
  status public.rider_status NOT NULL DEFAULT 'offline',
  is_platform_fleet boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX riders_restaurant_idx ON public.riders(restaurant_id);
CREATE UNIQUE INDEX riders_user_idx ON public.riders(user_id) WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.current_rider_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.riders WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_rider_restaurant()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT restaurant_id FROM public.riders WHERE user_id = auth.uid() LIMIT 1;
$$;

-- ---------- commandes ----------
CREATE SEQUENCE public.order_number_seq START 1;

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE DEFAULT ('BF-' || lpad(nextval('public.order_number_seq')::text, 4, '0')),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE RESTRICT,
  customer_id uuid,
  customer_name text NOT NULL,
  customer_phone text NOT NULL,
  order_type public.order_type NOT NULL DEFAULT 'takeaway',
  status public.order_status NOT NULL DEFAULT 'received',
  delivery_zone_id uuid REFERENCES public.delivery_zones(id) ON DELETE SET NULL,
  delivery_address text,
  delivery_fee_fcfa integer NOT NULL DEFAULT 0 CHECK (delivery_fee_fcfa >= 0),
  items_total_fcfa integer NOT NULL DEFAULT 0 CHECK (items_total_fcfa >= 0),
  total_fcfa integer NOT NULL DEFAULT 0 CHECK (total_fcfa >= 0),
  commission_fcfa integer NOT NULL DEFAULT 0,
  payment_method public.payment_method NOT NULL DEFAULT 'cash',
  rider_id uuid REFERENCES public.riders(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  ready_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text
);
CREATE INDEX orders_restaurant_idx ON public.orders(restaurant_id, created_at DESC);
CREATE INDEX orders_customer_idx ON public.orders(customer_id);
CREATE INDEX orders_rider_idx ON public.orders(rider_id);
CREATE INDEX orders_status_idx ON public.orders(status);

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id uuid REFERENCES public.menu_items(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES public.item_variants(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  variant_name text,
  unit_price_fcfa integer NOT NULL CHECK (unit_price_fcfa >= 0),
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  line_total_fcfa integer NOT NULL CHECK (line_total_fcfa >= 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_items_order_idx ON public.order_items(order_id);

CREATE TABLE public.order_item_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  option_id uuid REFERENCES public.options(id) ON DELETE SET NULL,
  name text NOT NULL,
  price_delta_fcfa integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_item_options_item_idx ON public.order_item_options(order_item_id);

-- ---------- triggers updated_at ----------
CREATE TRIGGER trg_restaurants_updated BEFORE UPDATE ON public.restaurants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_zones_updated BEFORE UPDATE ON public.delivery_zones FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_categories_updated BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_menu_items_updated BEFORE UPDATE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_item_variants_updated BEFORE UPDATE ON public.item_variants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_option_groups_updated BEFORE UPDATE ON public.option_groups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_options_updated BEFORE UPDATE ON public.options FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_riders_updated BEFORE UPDATE ON public.riders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- création automatique du profil ----------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'phone')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'client')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- ---------- GRANTS ----------
GRANT SELECT ON public.restaurants, public.delivery_zones, public.categories,
  public.menu_items, public.item_variants, public.option_groups, public.options TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.restaurants, public.delivery_zones, public.categories,
  public.menu_items, public.item_variants, public.option_groups, public.options TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles, public.user_roles, public.riders,
  public.orders, public.order_items, public.order_item_options TO authenticated;
GRANT ALL ON public.restaurants, public.delivery_zones, public.categories, public.menu_items,
  public.item_variants, public.option_groups, public.options, public.profiles, public.user_roles,
  public.riders, public.orders, public.order_items, public.order_item_options TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.order_number_seq TO service_role;

-- ---------- RLS ----------
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.riders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_options ENABLE ROW LEVEL SECURITY;

-- catalogue : lecture publique
CREATE POLICY "restaurants_public_read" ON public.restaurants FOR SELECT TO anon, authenticated USING (is_active OR public.manages_restaurant(auth.uid(), id));
CREATE POLICY "restaurants_manage" ON public.restaurants FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_restaurant_role(auth.uid(),'restaurant_admin', id))
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_restaurant_role(auth.uid(),'restaurant_admin', id));

CREATE POLICY "zones_public_read" ON public.delivery_zones FOR SELECT TO anon, authenticated USING (is_active OR public.manages_restaurant(auth.uid(), restaurant_id));
CREATE POLICY "zones_manage" ON public.delivery_zones FOR ALL TO authenticated
  USING (public.has_restaurant_role(auth.uid(),'restaurant_admin', restaurant_id))
  WITH CHECK (public.has_restaurant_role(auth.uid(),'restaurant_admin', restaurant_id));

CREATE POLICY "categories_public_read" ON public.categories FOR SELECT TO anon, authenticated USING (is_active OR public.manages_restaurant(auth.uid(), restaurant_id));
CREATE POLICY "categories_manage" ON public.categories FOR ALL TO authenticated
  USING (public.has_restaurant_role(auth.uid(),'restaurant_admin', restaurant_id))
  WITH CHECK (public.has_restaurant_role(auth.uid(),'restaurant_admin', restaurant_id));

CREATE POLICY "menu_items_public_read" ON public.menu_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "menu_items_manage" ON public.menu_items FOR ALL TO authenticated
  USING (public.manages_restaurant(auth.uid(), restaurant_id))
  WITH CHECK (public.manages_restaurant(auth.uid(), restaurant_id));

CREATE POLICY "item_variants_public_read" ON public.item_variants FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "item_variants_manage" ON public.item_variants FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.menu_items m WHERE m.id = menu_item_id AND public.manages_restaurant(auth.uid(), m.restaurant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.menu_items m WHERE m.id = menu_item_id AND public.manages_restaurant(auth.uid(), m.restaurant_id)));

CREATE POLICY "option_groups_public_read" ON public.option_groups FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "option_groups_manage" ON public.option_groups FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.menu_items m WHERE m.id = menu_item_id AND public.manages_restaurant(auth.uid(), m.restaurant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.menu_items m WHERE m.id = menu_item_id AND public.manages_restaurant(auth.uid(), m.restaurant_id)));

CREATE POLICY "options_public_read" ON public.options FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "options_manage" ON public.options FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.option_groups g JOIN public.menu_items m ON m.id = g.menu_item_id
    WHERE g.id = group_id AND public.manages_restaurant(auth.uid(), m.restaurant_id)))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.option_groups g JOIN public.menu_items m ON m.id = g.menu_item_id
    WHERE g.id = group_id AND public.manages_restaurant(auth.uid(), m.restaurant_id)));

-- profils
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_super_admin(auth.uid()));
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- rôles : lecture de ses propres rôles, gestion par les admins
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid())
         OR (restaurant_id IS NOT NULL AND public.has_restaurant_role(auth.uid(),'restaurant_admin', restaurant_id)));
CREATE POLICY "user_roles_manage" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR (restaurant_id IS NOT NULL AND public.has_restaurant_role(auth.uid(),'restaurant_admin', restaurant_id)))
  WITH CHECK (public.is_super_admin(auth.uid()) OR (restaurant_id IS NOT NULL AND public.has_restaurant_role(auth.uid(),'restaurant_admin', restaurant_id)));

-- livreurs
CREATE POLICY "riders_select" ON public.riders FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.manages_restaurant(auth.uid(), restaurant_id));
CREATE POLICY "riders_update_self" ON public.riders FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "riders_manage" ON public.riders FOR ALL TO authenticated
  USING (public.has_restaurant_role(auth.uid(),'restaurant_admin', restaurant_id))
  WITH CHECK (public.has_restaurant_role(auth.uid(),'restaurant_admin', restaurant_id));

-- commandes
CREATE POLICY "orders_select" ON public.orders FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR public.manages_restaurant(auth.uid(), restaurant_id)
    OR rider_id = public.current_rider_id()
    OR (rider_id IS NULL AND order_type = 'delivery' AND status IN ('ready','in_kitchen')
        AND restaurant_id = public.current_rider_restaurant())
  );
CREATE POLICY "orders_insert_own" ON public.orders FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid());
CREATE POLICY "orders_update_staff" ON public.orders FOR UPDATE TO authenticated
  USING (
    public.manages_restaurant(auth.uid(), restaurant_id)
    OR rider_id = public.current_rider_id()
    OR (rider_id IS NULL AND order_type = 'delivery' AND status = 'ready'
        AND restaurant_id = public.current_rider_restaurant())
  )
  WITH CHECK (
    public.manages_restaurant(auth.uid(), restaurant_id)
    OR rider_id = public.current_rider_id()
  );

CREATE POLICY "order_items_select" ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (
    o.customer_id = auth.uid()
    OR public.manages_restaurant(auth.uid(), o.restaurant_id)
    OR o.rider_id = public.current_rider_id()
    OR (o.rider_id IS NULL AND o.restaurant_id = public.current_rider_restaurant())
  )));
CREATE POLICY "order_items_insert_own" ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.customer_id = auth.uid()));

CREATE POLICY "order_item_options_select" ON public.order_item_options FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.order_items i JOIN public.orders o ON o.id = i.order_id
    WHERE i.id = order_item_id AND (
      o.customer_id = auth.uid()
      OR public.manages_restaurant(auth.uid(), o.restaurant_id)
      OR o.rider_id = public.current_rider_id()
      OR (o.rider_id IS NULL AND o.restaurant_id = public.current_rider_restaurant())
    )));
CREATE POLICY "order_item_options_insert_own" ON public.order_item_options FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.order_items i JOIN public.orders o ON o.id = i.order_id
    WHERE i.id = order_item_id AND o.customer_id = auth.uid()));

-- ---------- temps réel ----------
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.order_items REPLICA IDENTITY FULL;
ALTER TABLE public.menu_items REPLICA IDENTITY FULL;
ALTER TABLE public.item_variants REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.item_variants;