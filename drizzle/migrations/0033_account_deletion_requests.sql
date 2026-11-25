CREATE TABLE public.account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  contact text NOT NULL CHECK (length(contact) BETWEEN 5 AND 120),
  reason text CHECK (reason IS NULL OR length(reason) <= 500),
  source text NOT NULL DEFAULT 'web' CHECK (source IN ('web','app')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
GRANT SELECT, UPDATE ON public.account_deletion_requests TO authenticated;
GRANT ALL ON public.account_deletion_requests TO service_role;
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deletion_super_admin_read" ON public.account_deletion_requests FOR SELECT TO authenticated USING (private.is_super_admin(auth.uid()));
CREATE POLICY "deletion_super_admin_update" ON public.account_deletion_requests FOR UPDATE TO authenticated USING (private.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.request_account_deletion(p_contact text, p_reason text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_contact text := lower(trim(coalesce(p_contact,'')));
BEGIN
  IF auth.uid() IS NOT NULL AND v_contact = '' THEN
    SELECT lower(email) INTO v_contact FROM auth.users WHERE id = auth.uid();
  END IF;
  IF length(v_contact) < 5 OR length(v_contact) > 120 THEN RAISE EXCEPTION 'Indiquez un e-mail ou un numéro valide.'; END IF;
  IF EXISTS (SELECT 1 FROM account_deletion_requests WHERE contact = v_contact AND status = 'pending') THEN RETURN true; END IF;
  IF (SELECT count(*) FROM account_deletion_requests WHERE created_at > now() - interval '1 hour') > 50 THEN RAISE EXCEPTION 'Trop de demandes, réessayez plus tard.'; END IF;
  INSERT INTO account_deletion_requests(user_id, contact, reason, source)
  VALUES (auth.uid(), v_contact, nullif(left(trim(coalesce(p_reason,'')),500),''), CASE WHEN auth.uid() IS NULL THEN 'web' ELSE 'app' END);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.request_account_deletion(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_account_deletion(text,text) TO anon, authenticated;