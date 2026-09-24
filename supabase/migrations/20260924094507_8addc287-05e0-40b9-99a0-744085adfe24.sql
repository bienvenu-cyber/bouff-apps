CREATE OR REPLACE FUNCTION public.email_exists(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_email IS NULL OR length(p_email) > 254 THEN false
    ELSE EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(trim(p_email)))
  END
$$;
REVOKE ALL ON FUNCTION public.email_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_exists(text) TO anon, authenticated;