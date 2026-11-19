'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUserContext } from '@/lib/hooks/useUser';
import CouponsScreen from '@/lib/ui/screens/admin/restaurant/general/coupons';

// Marketing : réservé au super admin. La gérante est renvoyée au tableau de bord.
export default function CouponsPage() {
  const { user } = useUserContext();
  const router = useRouter();
  const isSuperAdmin = user?.userType === 'ADMIN';

  useEffect(() => {
    if (user && !isSuperAdmin) router.replace('/admin/store/dashboard');
  }, [user, isSuperAdmin, router]);

  return isSuperAdmin ? <CouponsScreen /> : null;
}
