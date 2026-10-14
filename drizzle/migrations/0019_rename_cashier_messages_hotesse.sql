DO $do$
DECLARE f regprocedure;
BEGIN
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('admin_save_cashier','admin_set_cashier_active','counter_login')
      AND p.prosrc LIKE '%Caissière introuvable%'
  LOOP
    EXECUTE replace(pg_get_functiondef(f), 'Caissière introuvable', 'Hôtesse introuvable');
  END LOOP;
END $do$;