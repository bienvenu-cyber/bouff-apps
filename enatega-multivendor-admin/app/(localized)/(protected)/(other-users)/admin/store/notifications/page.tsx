'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUserContext } from '@/lib/hooks/useUser';
import PromoPushScreen from '@/lib/ui/screens/admin/restaurant/general/promo-push';

// Réservé au super admin.
export default function PromoPushPage() {
  const { user } = useUserContext();
  const router = useRouter();
  const allowed = user?.userType === 'ADMIN';
  useEffect(() => {
    if (user && !allowed) router.replace('/admin/store/dashboard');
  }, [user, allowed, router]);
  return allowed ? <PromoPushScreen /> : null;
}
