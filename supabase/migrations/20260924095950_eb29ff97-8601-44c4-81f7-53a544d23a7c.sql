REVOKE ALL ON FUNCTION public.send_push_for_notification() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.coupon_quote(uuid,text,integer,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.register_push_token(text,text), public.set_push_preferences(boolean,boolean), public.unregister_push_token(text) FROM PUBLIC, anon;