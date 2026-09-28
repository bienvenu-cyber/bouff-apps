REVOKE EXECUTE ON FUNCTION public.redeem_points(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_points(text) TO authenticated;