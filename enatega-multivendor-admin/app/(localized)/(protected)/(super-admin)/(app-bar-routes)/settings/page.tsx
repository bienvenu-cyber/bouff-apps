'use client';

import React, { useEffect, useState } from 'react';
import { Formik, Form, Field } from 'formik';
import * as Yup from 'yup';
import { bouffDb } from '@/lib/bouff-data/supabase';
import HeaderText from '@/lib/ui/useable-components/header-text';
import CustomTextField from '@/lib/ui/useable-components/input-field';
import CustomNumberTextField from '@/lib/ui/useable-components/custom-input';
import CustomTimeInput from '@/lib/ui/useable-components/time-input';
import Toggle from '@/lib/ui/useable-components/toggle';
import CustomButton from '@/lib/ui/useable-components/button';
import CustomDropdownComponent from '@/lib/ui/useable-components/custom-dropdown';
import useToast from '@/lib/hooks/useToast';
import { useTranslations } from 'next-intl';

const validationSchema = Yup.object().shape({
  name: Yup.string().required('Le nom est requis'),
  min_order_fcfa: Yup.number().min(0, 'Minimum 0').required('Requis'),
  max_active_orders_per_phone: Yup.number().min(0, 'Minimum 0').required('Requis'),
  max_orders_per_phone_hour: Yup.number().min(0, 'Minimum 0').required('Requis'),
});

export default function SettingsPage() {
  const { showToast } = useToast();
  const t = useTranslations();
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);
  const [initialValues, setInitialValues] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRestaurants();
  }, []);

  const fetchRestaurants = async () => {
    const { data, error } = await bouffDb().from('restaurants').select('id, name');
    if (error) {
      showToast({ type: 'error', title: 'Erreur', message: error.message });
    } else if (data && data.length > 0) {
      setRestaurants(data);
      setSelectedRestaurantId(data[0].id);
      fetchRestaurantDetails(data[0].id);
    } else {
      setLoading(false);
    }
  };

  const fetchRestaurantDetails = async (id: string) => {
    setLoading(true);
    const { data, error } = await bouffDb()
      .from('restaurants')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      showToast({ type: 'error', title: 'Erreur', message: error.message });
    } else {
      setInitialValues({
        ...data,
        opens_at: data.opens_at?.substring(0, 5) || '08:00',
        closes_at: data.closes_at?.substring(0, 5) || '22:00',
      });
    }
    setLoading(false);
  };

  const handleSubmit = async (values: any) => {
    if (!selectedRestaurantId) return;
    const { error } = await bouffDb()
      .from('restaurants')
      .update({
        name: values.name,
        tagline: values.tagline || null,
        phone: values.phone || null,
        whatsapp_number: values.whatsapp_number || null,
        address: values.address || null,
        opens_at: values.opens_at,
        closes_at: values.closes_at,
        min_order_fcfa: values.min_order_fcfa ?? 0,
        accepts_delivery: values.accepts_delivery,
        accepts_takeaway: values.accepts_takeaway,
        is_temporarily_closed: values.is_temporarily_closed,
        max_active_orders_per_phone: values.max_active_orders_per_phone,
        max_orders_per_phone_hour: values.max_orders_per_phone_hour,
      })
      .eq('id', selectedRestaurantId);

    if (error) {
      showToast({ type: 'error', title: 'Erreur', message: error.message });
    } else {
      showToast({ type: 'success', title: 'Succès', message: 'Réglages enregistrés' });
      fetchRestaurantDetails(selectedRestaurantId);
    }
  };

  if (loading && !initialValues) return <div className="p-4">Chargement...</div>;

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6">
      <HeaderText text="Réglages du restaurant" />

      {restaurants.length > 1 && (
        <div className="bg-white dark:bg-dark-900 p-4 rounded-lg shadow-sm border dark:border-dark-700">
          <CustomDropdownComponent
            name="restaurant-selector"
            placeholder="Choisir un restaurant"
            options={restaurants.map((r) => ({ label: r.name, code: r.id }))}
            selectedItem={
              restaurants
                .filter((r) => r.id === selectedRestaurantId)
                .map((r) => ({ label: r.name, code: r.id }))[0] ?? null
            }
            setSelectedItem={(_: string, val: { code?: string }) => {
              if (!val?.code) return;
              setSelectedRestaurantId(val.code);
              fetchRestaurantDetails(val.code);
            }}
            showLabel
          />
        </div>
      )}

      {initialValues && (
        <Formik
          initialValues={initialValues}
          validationSchema={validationSchema}
          enableReinitialize
          onSubmit={handleSubmit}
        >
          {({ values, errors, touched, setFieldValue, isSubmitting }) => (
            <Form className="space-y-6">
              {!values.whatsapp_number && (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-yellow-700">
                        Numéro WhatsApp à renseigner avant la mise en ligne (Support et Avis en dépendent)
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white dark:bg-dark-900 p-6 rounded-lg shadow-sm border dark:border-dark-700">
                <CustomTextField
                  type="text"
                  name="name"
                  placeholder="Nom du restaurant"
                  showLabel
                  value={values.name}
                  onChange={(e: any) => setFieldValue('name', e.target.value)}
                  error={touched.name && errors.name ? (errors.name as string) : ''}
                />
                <CustomTextField
                  type="text"
                  name="tagline"
                  placeholder="Slogan / Description courte"
                  showLabel
                  value={values.tagline || ''}
                  onChange={(e: any) => setFieldValue('tagline', e.target.value)}
                />
                <CustomTextField
                  type="text"
                  name="phone"
                  placeholder="Téléphone"
                  showLabel
                  value={values.phone || ''}
                  onChange={(e: any) => setFieldValue('phone', e.target.value)}
                />
                <CustomTextField
                  type="text"
                  name="whatsapp_number"
                  placeholder="Numéro WhatsApp"
                  showLabel
                  value={values.whatsapp_number || ''}
                  onChange={(e: any) => setFieldValue('whatsapp_number', e.target.value)}
                />
                <div className="md:col-span-2">
                  <CustomTextField
                  type="text"
                    name="address"
                    placeholder="Adresse complète"
                    showLabel
                    value={values.address || ''}
                    onChange={(e: any) => setFieldValue('address', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white dark:bg-dark-900 p-6 rounded-lg shadow-sm border dark:border-dark-700">
                <CustomTimeInput
                  placeholder="Heure d'ouverture"
                  showLabel
                  value={values.opens_at}
                  onChange={(val) => setFieldValue('opens_at', val)}
                />
                <CustomTimeInput
                  placeholder="Heure de fermeture"
                  showLabel
                  value={values.closes_at}
                  onChange={(val) => setFieldValue('closes_at', val)}
                />
                <CustomNumberTextField
                  min={0}
                  showLabel
                  name="min_order_fcfa"
                  placeholder="Minimum de commande (FCFA)"
                  value={values.min_order_fcfa}
                  onChange={(name, val) => setFieldValue(name, val)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white dark:bg-dark-900 p-6 rounded-lg shadow-sm border dark:border-dark-700">
                <Toggle
                  placeholder="Accepte la livraison"
                  showLabel
                  checked={values.accepts_delivery}
                  onClick={() => setFieldValue('accepts_delivery', !values.accepts_delivery)}
                />
                <Toggle
                  placeholder="Accepte à emporter"
                  showLabel
                  checked={values.accepts_takeaway}
                  onClick={() => setFieldValue('accepts_takeaway', !values.accepts_takeaway)}
                />
                <Toggle
                  placeholder="Temporairement fermé"
                  showLabel
                  checked={values.is_temporarily_closed}
                  onClick={() => setFieldValue('is_temporarily_closed', !values.is_temporarily_closed)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white dark:bg-dark-900 p-6 rounded-lg shadow-sm border dark:border-dark-700">
                <CustomNumberTextField
                  min={0}
                  showLabel
                  name="max_active_orders_per_phone"
                  placeholder="Max commandes actives / téléphone"
                  value={values.max_active_orders_per_phone}
                  onChange={(name, val) => setFieldValue(name, val)}
                />
                <CustomNumberTextField
                  min={0}
                  showLabel
                  name="max_orders_per_phone_hour"
                  placeholder="Max commandes / heure / téléphone"
                  value={values.max_orders_per_phone_hour}
                  onChange={(name, val) => setFieldValue(name, val)}
                />
              </div>

              <div className="flex justify-end">
                <CustomButton
                  label="Enregistrer les réglages"
                  type="submit"
                  loading={isSubmitting}
                  className="w-full md:w-auto px-8"
                />
              </div>
            </Form>
          )}
        </Formik>
      )}
    </div>
  );
}
