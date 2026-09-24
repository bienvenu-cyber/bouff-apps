-- Villes
CREATE TABLE public.cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cities TO anon, authenticated;
GRANT ALL ON public.cities TO service_role;
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cities are public" ON public.cities FOR SELECT USING (true);
CREATE TRIGGER cities_updated_at BEFORE UPDATE ON public.cities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.cities (name, sort_order, is_default, is_active) VALUES
('Parakou',1,true,true),('Cotonou',2,false,false),('Abomey-Calavi',3,false,false),('Porto-Novo',4,false,false),
('Bohicon',5,false,false),('Djougou',6,false,false),('Natitingou',7,false,false),('Kandi',8,false,false),
('Ouidah',9,false,false),('Lokossa',10,false,false);

-- Quartiers rattachés à une ville, frais minimum 500 F
ALTER TABLE public.delivery_zones ADD COLUMN city_id uuid REFERENCES public.cities(id);
UPDATE public.delivery_zones SET city_id = (SELECT id FROM public.cities WHERE name='Parakou');
ALTER TABLE public.delivery_zones ALTER COLUMN city_id SET NOT NULL;
ALTER TABLE public.delivery_zones ADD CONSTRAINT delivery_zones_min_fee CHECK (fee_fcfa >= 500);
CREATE INDEX delivery_zones_city_idx ON public.delivery_zones(city_id);

INSERT INTO public.delivery_zones (restaurant_id, city_id, name, fee_fcfa, sort_order, is_active)
SELECT r.id, c.id, z.name, z.fee, z.ord, c.is_active
FROM public.restaurants r
CROSS JOIN (VALUES
 ('Parakou','Zongo',500,5),('Parakou','Albarika',500,6),('Parakou','Madina',500,7),('Parakou','Titirou',700,8),
 ('Parakou','Ladjifarani',700,9),('Parakou','Kpébié',700,10),('Parakou','Gah',700,11),('Parakou','Okédama',500,12),
 ('Parakou','Dépôt',500,13),('Parakou','Tourou',1000,14),('Parakou','Amanwignon',1000,15),('Parakou','Baka',1000,16),
 ('Cotonou','Akpakpa',500,1),('Cotonou','Cadjèhoun',500,2),('Cotonou','Fidjrossè',500,3),('Cotonou','Haie Vive',500,4),('Cotonou','Gbégamey',500,5),('Cotonou','Dantokpa',500,6),
 ('Abomey-Calavi','Godomey',500,1),('Abomey-Calavi','Zogbadjè',500,2),('Abomey-Calavi','Tankpè',500,3),('Abomey-Calavi','Togba',500,4),
 ('Porto-Novo','Ouando',500,1),('Porto-Novo','Tokpota',500,2),('Porto-Novo','Djègan-Kpèvi',500,3),('Porto-Novo','Houinmè',500,4),
 ('Bohicon','Centre',500,1),('Djougou','Centre',500,1),('Natitingou','Centre',500,1),('Kandi','Centre',500,1),('Ouidah','Centre',500,1),('Lokossa','Centre',500,1)
) AS z(city,name,fee,ord)
JOIN public.cities c ON c.name = z.city
WHERE r.slug = 'bouff';

-- Notifications dans l'app
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users mark own notifications read" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX notifications_user_idx ON public.notifications(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.notify_customer_in_app()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_title text; v_body text;
BEGIN
  IF NEW.customer_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  v_title := 'Commande ' || NEW.order_number;
  v_body := CASE NEW.status
    WHEN 'received' THEN 'Nous avons bien reçu votre commande.'
    WHEN 'in_kitchen' THEN 'Votre commande est en préparation en cuisine.'
    WHEN 'ready' THEN CASE WHEN NEW.order_type='takeaway' THEN 'Votre commande est prête, vous pouvez venir la récupérer.' ELSE 'Votre commande est prête, un livreur va la prendre.' END
    WHEN 'on_the_way' THEN 'Votre livreur est en route.'
    WHEN 'delivered' THEN CASE WHEN NEW.order_type='takeaway' THEN 'Commande récupérée. Bon appétit !' ELSE 'Commande livrée. Bon appétit !' END
    WHEN 'cancelled' THEN 'Votre commande a été annulée.' || COALESCE(' ' || NEW.cancel_reason, '')
  END;
  INSERT INTO public.notifications(user_id, order_id, title, body) VALUES (NEW.customer_id, NEW.id, v_title, v_body);
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.notify_customer_in_app() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER orders_notify_in_app AFTER INSERT OR UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.notify_customer_in_app();

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;