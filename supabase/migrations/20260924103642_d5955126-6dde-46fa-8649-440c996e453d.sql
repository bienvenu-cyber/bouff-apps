
CREATE POLICY bouff_images_read ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'bouff-images');
CREATE POLICY bouff_images_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'bouff-images' AND private.is_any_admin(auth.uid()));
CREATE POLICY bouff_images_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'bouff-images' AND private.is_any_admin(auth.uid()));
CREATE POLICY bouff_images_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'bouff-images' AND private.is_any_admin(auth.uid()));
