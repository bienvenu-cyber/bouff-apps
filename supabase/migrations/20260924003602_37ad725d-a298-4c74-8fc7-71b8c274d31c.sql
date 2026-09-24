-- Menu editing: restaurant_admin (or super admin) only; kitchen uses availability RPCs
DROP POLICY IF EXISTS menu_items_manage ON public.menu_items;
CREATE POLICY menu_items_manage ON public.menu_items FOR ALL TO authenticated
  USING (private.has_restaurant_role(auth.uid(),'restaurant_admin',restaurant_id))
  WITH CHECK (private.has_restaurant_role(auth.uid(),'restaurant_admin',restaurant_id));

DROP POLICY IF EXISTS item_variants_manage ON public.item_variants;
CREATE POLICY item_variants_manage ON public.item_variants FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.menu_items m WHERE m.id=item_variants.menu_item_id AND private.has_restaurant_role(auth.uid(),'restaurant_admin',m.restaurant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.menu_items m WHERE m.id=item_variants.menu_item_id AND private.has_restaurant_role(auth.uid(),'restaurant_admin',m.restaurant_id)));

DROP POLICY IF EXISTS option_groups_manage ON public.option_groups;
CREATE POLICY option_groups_manage ON public.option_groups FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.menu_items m WHERE m.id=option_groups.menu_item_id AND private.has_restaurant_role(auth.uid(),'restaurant_admin',m.restaurant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.menu_items m WHERE m.id=option_groups.menu_item_id AND private.has_restaurant_role(auth.uid(),'restaurant_admin',m.restaurant_id)));

DROP POLICY IF EXISTS options_manage ON public.options;
CREATE POLICY options_manage ON public.options FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.option_groups g JOIN public.menu_items m ON m.id=g.menu_item_id WHERE g.id=options.group_id AND private.has_restaurant_role(auth.uid(),'restaurant_admin',m.restaurant_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.option_groups g JOIN public.menu_items m ON m.id=g.menu_item_id WHERE g.id=options.group_id AND private.has_restaurant_role(auth.uid(),'restaurant_admin',m.restaurant_id)));

-- Restaurants: admin updates own; only super admin creates/deletes
DROP POLICY IF EXISTS restaurants_manage ON public.restaurants;
CREATE POLICY restaurants_update ON public.restaurants FOR UPDATE TO authenticated
  USING (private.has_restaurant_role(auth.uid(),'restaurant_admin',id))
  WITH CHECK (private.has_restaurant_role(auth.uid(),'restaurant_admin',id));
CREATE POLICY restaurants_insert_super ON public.restaurants FOR INSERT TO authenticated
  WITH CHECK (private.is_super_admin(auth.uid()));
CREATE POLICY restaurants_delete_super ON public.restaurants FOR DELETE TO authenticated
  USING (private.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION private.guard_restaurant_platform_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT private.is_super_admin(auth.uid()) THEN
    IF NEW.commission_rate IS DISTINCT FROM OLD.commission_rate
       OR NEW.slug IS DISTINCT FROM OLD.slug
       OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'Seul l''admin général peut modifier la commission, le slug ou l''activation du restaurant';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS restaurants_guard_platform_fields ON public.restaurants;
CREATE TRIGGER restaurants_guard_platform_fields BEFORE UPDATE ON public.restaurants
  FOR EACH ROW EXECUTE FUNCTION private.guard_restaurant_platform_fields();

-- Cities: super admin manages
GRANT INSERT, UPDATE, DELETE ON public.cities TO authenticated;
CREATE POLICY cities_manage_super ON public.cities FOR ALL TO authenticated
  USING (private.is_super_admin(auth.uid()))
  WITH CHECK (private.is_super_admin(auth.uid()));

-- Roles: restaurant admins may only grant staff roles within their restaurant
DROP POLICY IF EXISTS user_roles_manage ON public.user_roles;
CREATE POLICY user_roles_manage ON public.user_roles FOR ALL TO authenticated
  USING (private.is_super_admin(auth.uid())
    OR (restaurant_id IS NOT NULL AND role IN ('restaurant_admin','kitchen','rider')
        AND private.has_restaurant_role(auth.uid(),'restaurant_admin',restaurant_id)))
  WITH CHECK (private.is_super_admin(auth.uid())
    OR (restaurant_id IS NOT NULL AND role IN ('restaurant_admin','kitchen','rider')
        AND private.has_restaurant_role(auth.uid(),'restaurant_admin',restaurant_id)));