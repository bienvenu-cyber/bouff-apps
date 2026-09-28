'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getUserLocale, setUserLocale } from '@/lib/utils/methods/locale';
import HeaderText from '@/lib/ui/useable-components/header-text';
import { TLocale } from '@/lib/utils/types/locale';
import useToast from '@/lib/hooks/useToast';
import { useTranslations } from 'next-intl';

export default function LanguagePage() {
  const [currentLocale, setCurrentLocale] = useState<string>('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { showToast } = useToast();
  const t = useTranslations();

  useEffect(() => {
    getUserLocale().then((locale) => {
      setCurrentLocale(locale);
    });
  }, []);

  const handleLocaleChange = (newLocale: string) => {
    startTransition(async () => {
      await setUserLocale(newLocale as TLocale);
      setCurrentLocale(newLocale);
      showToast({
        type: 'success',
        title: 'Succès',
        message: 'Langue mise à jour avec succès',
      });
      router.refresh();
    });
  };

  const languages = [
    { code: 'fr', name: 'Français' },
    { code: 'en', name: 'English' },
  ];

  return (
    <div className="p-4 flex flex-col gap-6">
      <HeaderText text="Langue" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
        {languages.map((lang) => (
          <div
            key={lang.code}
            onClick={() => !isPending && handleLocaleChange(lang.code)}
            className={`cursor-pointer p-6 rounded-lg border-2 transition-all flex items-center justify-between ${
              currentLocale === lang.code
                ? 'border-primary-color bg-primary-color/5 dark:bg-primary-color/10'
                : 'border-gray-200 dark:border-dark-700 hover:border-primary-color/50 dark:hover:border-primary-color/50 bg-white dark:bg-dark-900'
            } ${isPending ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span className="text-lg font-medium dark:text-white">{lang.name}</span>
            {currentLocale === lang.code && (
              <div className="h-4 w-4 rounded-full bg-primary-color" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
