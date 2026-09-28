REVOKE EXECUTE ON FUNCTION public.is_time_in_hours(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_list_reviews(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_dashboard_counts(uuid, date, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_customer_rewards(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_grant_reward(uuid, text, integer, text, text) FROM PUBLIC, anon;