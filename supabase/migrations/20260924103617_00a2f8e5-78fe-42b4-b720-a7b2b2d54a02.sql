
CREATE POLICY coupons_restaurant_admin ON public.coupons FOR ALL TO authenticated
  USING (restaurant_id IS NOT NULL AND private.has_restaurant_role(auth.uid(),'restaurant_admin',restaurant_id))
  WITH CHECK (restaurant_id IS NOT NULL AND private.has_restaurant_role(auth.uid(),'restaurant_admin',restaurant_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_my_access()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'user_id', auth.uid(),
    'email', (SELECT email FROM auth.users WHERE id = auth.uid()),
    'full_name', (SELECT full_name FROM public.profiles WHERE id = auth.uid()),
    'is_super_admin', private.is_super_admin(auth.uid()),
    'restaurants', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'slug', r.slug))
        FROM public.user_roles ur JOIN public.restaurants r ON r.id = ur.restaurant_id
        WHERE ur.user_id = auth.uid() AND ur.role = 'restaurant_admin'), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.admin_my_access() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_my_access() TO authenticated;

CREATE OR REPLACE FUNCTION private.is_any_admin(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_uid AND role IN ('super_admin','restaurant_admin'));
$$;

CREATE OR REPLACE FUNCTION public.admin_find_user(p_email text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT private.is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'Action non autorisée.'; END IF;
  RETURN (SELECT id FROM auth.users WHERE lower(email) = lower(trim(p_email)) LIMIT 1);
END $$;
REVOKE ALL ON FUNCTION public.admin_find_user(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_find_user(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_assign_staff(p_user_id uuid, p_role app_role, p_restaurant_id uuid, p_full_name text DEFAULT NULL, p_phone text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rider uuid;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'Compte introuvable.'; END IF;
  IF p_role = 'client' THEN RAISE EXCEPTION 'Rôle invalide.'; END IF;
  IF p_role = 'super_admin' THEN
    IF NOT private.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Action non autorisée.'; END IF;
    INSERT INTO public.user_roles(user_id, role, restaurant_id) VALUES (p_user_id,'super_admin',NULL) ON CONFLICT DO NOTHING;
  ELSE
    IF p_restaurant_id IS NULL THEN RAISE EXCEPTION 'Restaurant requis.'; END IF;
    IF NOT private.has_restaurant_role(auth.uid(),'restaurant_admin',p_restaurant_id) THEN RAISE EXCEPTION 'Action non autorisée.'; END IF;
    INSERT INTO public.user_roles(user_id, role, restaurant_id) VALUES (p_user_id,p_role,p_restaurant_id) ON CONFLICT DO NOTHING;
  END IF;
  INSERT INTO public.profiles(id, full_name, phone) VALUES (p_user_id, p_full_name, p_phone)
    ON CONFLICT (id) DO UPDATE SET full_name = COALESCE(EXCLUDED.full_name, profiles.full_name), phone = COALESCE(EXCLUDED.phone, profiles.phone);
  IF p_role = 'rider' THEN
    SELECT id INTO v_rider FROM public.riders WHERE user_id = p_user_id AND restaurant_id = p_restaurant_id;
    IF v_rider IS NULL THEN
      INSERT INTO public.riders(user_id, restaurant_id, full_name, phone)
      VALUES (p_user_id, p_restaurant_id, COALESCE(NULLIF(p_full_name,''),'Livreur'), p_phone) RETURNING id INTO v_rider;
    ELSE
      UPDATE public.riders SET is_active = true, full_name = COALESCE(NULLIF(p_full_name,''), full_name), phone = COALESCE(p_phone, phone) WHERE id = v_rider;
    END IF;
  END IF;
  RETURN jsonb_build_object('user_id', p_user_id, 'role', p_role, 'restaurant_id', p_restaurant_id, 'rider_id', v_rider);
END $$;
REVOKE ALL ON FUNCTION public.admin_assign_staff(uuid, app_role, uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_staff(uuid, app_role, uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_remove_staff(p_user_id uuid, p_role app_role, p_restaurant_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_role = 'super_admin' THEN
    IF NOT private.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Action non autorisée.'; END IF;
    IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'Vous ne pouvez pas retirer votre propre accès.'; END IF;
    DELETE FROM public.user_roles WHERE user_id = p_user_id AND role = 'super_admin';
    RETURN;
  END IF;
  IF NOT private.has_restaurant_role(auth.uid(),'restaurant_admin',p_restaurant_id) THEN RAISE EXCEPTION 'Action non autorisée.'; END IF;
  DELETE FROM public.user_roles WHERE user_id = p_user_id AND role = p_role AND restaurant_id = p_restaurant_id;
  IF p_role = 'rider' THEN
    UPDATE public.riders SET is_active = false, status = 'offline' WHERE user_id = p_user_id AND restaurant_id = p_restaurant_id;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_remove_staff(uuid, app_role, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_remove_staff(uuid, app_role, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_staff(p_restaurant_id uuid DEFAULT NULL)
RETURNS TABLE(user_id uuid, email text, full_name text, phone text, role app_role, restaurant_id uuid, restaurant_name text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_restaurant_id IS NULL THEN
    IF NOT private.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Action non autorisée.'; END IF;
  ELSIF NOT private.has_restaurant_role(auth.uid(),'restaurant_admin',p_restaurant_id) THEN
    RAISE EXCEPTION 'Action non autorisée.';
  END IF;
  RETURN QUERY
  SELECT ur.user_id, u.email::text, p.full_name, p.phone, ur.role, ur.restaurant_id, r.name, ur.created_at
  FROM public.user_roles ur
  JOIN auth.users u ON u.id = ur.user_id
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  LEFT JOIN public.restaurants r ON r.id = ur.restaurant_id
  WHERE ur.role <> 'client' AND (p_restaurant_id IS NULL OR ur.restaurant_id = p_restaurant_id)
  ORDER BY ur.created_at DESC;
END $$;
REVOKE ALL ON FUNCTION public.admin_list_staff(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_staff(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_customers(p_search text DEFAULT NULL, p_limit int DEFAULT 20, p_offset int DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rows jsonb; v_total int;
BEGIN
  IF NOT private.is_super_admin(auth.uid()) THEN RAISE EXCEPTION 'Action non autorisée.'; END IF;
  WITH base AS (
    SELECT u.id, u.email::text AS email, u.created_at, p.full_name, p.phone,
      (SELECT count(*) FROM public.orders o WHERE o.customer_id = u.id) AS orders_count
    FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
    WHERE p_search IS NULL OR p_search = '' OR u.email ILIKE '%'||p_search||'%' OR p.full_name ILIKE '%'||p_search||'%' OR p.phone ILIKE '%'||p_search||'%'
  )
  SELECT (SELECT count(*) FROM base),
    COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.created_at DESC) FROM (SELECT * FROM base ORDER BY created_at DESC LIMIT LEAST(p_limit,100) OFFSET GREATEST(p_offset,0)) b), '[]'::jsonb)
  INTO v_total, v_rows;
  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END $$;
REVOKE ALL ON FUNCTION public.admin_list_customers(text, int, int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_customers(text, int, int) TO authenticated;
