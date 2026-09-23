-- espace privé, non exposé par l'API
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION private.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin');
$$;

CREATE OR REPLACE FUNCTION private.has_restaurant_role(_user_id uuid, _role public.app_role, _restaurant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (role = 'super_admin' OR (role = _role AND restaurant_id = _restaurant_id))
  );
$$;

CREATE OR REPLACE FUNCTION private.manages_restaurant(_user_id uuid, _restaurant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (role = 'super_admin' OR (role IN ('restaurant_admin','kitchen') AND restaurant_id = _restaurant_id))
  );
$$;

CREATE OR REPLACE FUNCTION private.current_rider_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.riders WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.current_rider_restaurant()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT restaurant_id FROM public.riders WHERE user_id = auth.uid() LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role),
  private.is_super_admin(uuid),
  private.has_restaurant_role(uuid, public.app_role, uuid),
  private.manages_restaurant(uuid, uuid),
  private.current_rider_id(),
  private.current_rider_restaurant() TO authenticated, service_role;

-- ---------- réécriture des règles d'accès sur les fonctions privées ----------
DROP POLICY "restaurants_public_read" ON public.restaurants;
DROP POLICY "restaurants_manage" ON public.restaurants;
CREATE POLICY "restaurants_anon_read" ON public.restaurants FOR SELECT TO anon USING (is_active);
CREATE POLICY "restaurants_auth_read" ON public.restaurants FOR SELECT TO authenticated
  USING (is_active OR private.manages_restaurant(auth.uid(), id));
CREATE POLICY "restaurants_manage" ON public.restaurants FOR ALL TO authenticated
  USING (private.has_restaurant_role(auth.uid(),'restaurant_admin', id))
  WITH CHECK (private.has_restaurant_role(auth.uid(),'restaurant_admin', id));

DROP POLICY "zones_public_read" ON public.delivery_zones;
DROP POLICY "zones_manage" ON public.delivery_zones;
CREATE POLICY "zones_anon_read" ON public.delivery_zones FOR SELECT TO anon USING (is_active);
CREATE POLICY "zones_auth_read" ON public.delivery_zones FOR SELECT TO authenticated
  USING (is_active OR private.manages_restaurant(auth.uid(), restaurant_id));
CREATE POLICY "zones_manage" ON public.delivery_zones FOR ALL TO authenticated
  USING (private.has_restaurant_role(auth.uid(),'restaurant_admin', restaurant_id))
  WITH CHECK (private.has_restaurant_role(auth.uid(),'restaurant_admin', restaurant_id));

DROP POLICY "categories_public_read" ON public.categories;
DROP POLICY "categories_manage" ON public.categories;
CREATE POLICY "categories_anon_read" ON public.categories FOR SELECT TO anon USING (is_active);
CREATE POLICY "categories_auth_read" ON public.categories FOR SELECT TO authenticated
  USING (is_active OR private.manages_restaurant(auth.uid(), restaurant_id));
CREATE POLICY "categories_manage" ON public.categories FOR ALL TO authenticated
  USING (private.has_restaurant_role(auth.uid(),'restaurant_admin', restaurant_id))
  WITH CHECK (private.has_restaurant_role(auth.uid(),'restaurant_admin', restaurant_id));

DROP POLICY "menu_items_manage" ON public.menu_items;
CREATE POLICY "menu_items_manage" ON public.menu_items FOR ALL TO authenticated
  USING (private.manages_restaurant(auth.uid(), restaurant_id))
  WITH CHECK (private.manages_restaurant(auth.uid(), restaurant_id));

DROP POLICY "item_variants_manage" ON public.item_variants;
CREATE POLICY "item_variants_manage" ON public.item_variants FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.menu_items m WHERE m.id = menu_item_id AND private.manages_restaurant(auth.uid(), m.restaurant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.menu_items m WHERE m.id = menu_item_id AND private.manages_restaurant(auth.uid(), m.restaurant_id)));

DROP POLICY "option_groups_manage" ON public.option_groups;
CREATE POLICY "option_groups_manage" ON public.option_groups FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.menu_items m WHERE m.id = menu_item_id AND private.manages_restaurant(auth.uid(), m.restaurant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.menu_items m WHERE m.id = menu_item_id AND private.manages_restaurant(auth.uid(), m.restaurant_id)));

DROP POLICY "options_manage" ON public.options;
CREATE POLICY "options_manage" ON public.options FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.option_groups g JOIN public.menu_items m ON m.id = g.menu_item_id
                 WHERE g.id = group_id AND private.manages_restaurant(auth.uid(), m.restaurant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.option_groups g JOIN public.menu_items m ON m.id = g.menu_item_id
                 WHERE g.id = group_id AND private.manages_restaurant(auth.uid(), m.restaurant_id)));

DROP POLICY "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR private.is_super_admin(auth.uid()));

DROP POLICY "user_roles_select_own" ON public.user_roles;
DROP POLICY "user_roles_manage" ON public.user_roles;
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.is_super_admin(auth.uid())
         OR (restaurant_id IS NOT NULL AND private.has_restaurant_role(auth.uid(),'restaurant_admin', restaurant_id)));
CREATE POLICY "user_roles_manage" ON public.user_roles FOR ALL TO authenticated
  USING (private.is_super_admin(auth.uid()) OR (restaurant_id IS NOT NULL AND private.has_restaurant_role(auth.uid(),'restaurant_admin', restaurant_id)))
  WITH CHECK (private.is_super_admin(auth.uid()) OR (restaurant_id IS NOT NULL AND private.has_restaurant_role(auth.uid(),'restaurant_admin', restaurant_id)));

DROP POLICY "riders_select" ON public.riders;
DROP POLICY "riders_manage" ON public.riders;
CREATE POLICY "riders_select" ON public.riders FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.manages_restaurant(auth.uid(), restaurant_id));
CREATE POLICY "riders_manage" ON public.riders FOR ALL TO authenticated
  USING (private.has_restaurant_role(auth.uid(),'restaurant_admin', restaurant_id))
  WITH CHECK (private.has_restaurant_role(auth.uid(),'restaurant_admin', restaurant_id));

DROP POLICY "orders_select" ON public.orders;
DROP POLICY "orders_update_staff" ON public.orders;
CREATE POLICY "orders_select" ON public.orders FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR private.manages_restaurant(auth.uid(), restaurant_id)
    OR rider_id = private.current_rider_id()
    OR (rider_id IS NULL AND order_type = 'delivery' AND status IN ('ready','in_kitchen')
        AND restaurant_id = private.current_rider_restaurant())
  );
CREATE POLICY "orders_update_staff" ON public.orders FOR UPDATE TO authenticated
  USING (
    private.manages_restaurant(auth.uid(), restaurant_id)
    OR rider_id = private.current_rider_id()
    OR (rider_id IS NULL AND order_type = 'delivery' AND status = 'ready'
        AND restaurant_id = private.current_rider_restaurant())
  )
  WITH CHECK (
    private.manages_restaurant(auth.uid(), restaurant_id)
    OR rider_id = private.current_rider_id()
  );

DROP POLICY "order_items_select" ON public.order_items;
CREATE POLICY "order_items_select" ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (
    o.customer_id = auth.uid()
    OR private.manages_restaurant(auth.uid(), o.restaurant_id)
    OR o.rider_id = private.current_rider_id()
    OR (o.rider_id IS NULL AND o.restaurant_id = private.current_rider_restaurant())
  )));

DROP POLICY "order_item_options_select" ON public.order_item_options;
CREATE POLICY "order_item_options_select" ON public.order_item_options FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.order_items i JOIN public.orders o ON o.id = i.order_id
    WHERE i.id = order_item_id AND (
      o.customer_id = auth.uid()
      OR private.manages_restaurant(auth.uid(), o.restaurant_id)
      OR o.rider_id = private.current_rider_id()
      OR (o.rider_id IS NULL AND o.restaurant_id = private.current_rider_restaurant())
    )));

-- anciennes fonctions publiques supprimées
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
DROP FUNCTION IF EXISTS public.is_super_admin(uuid);
DROP FUNCTION IF EXISTS public.has_restaurant_role(uuid, public.app_role, uuid);
DROP FUNCTION IF EXISTS public.manages_restaurant(uuid, uuid);
DROP FUNCTION IF EXISTS public.current_rider_id();
DROP FUNCTION IF EXISTS public.current_rider_restaurant();