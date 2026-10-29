import { redirect } from 'next/navigation';

// Déplacée dans l'espace super admin (Gestion > Notification).
export default function Hidden() {
  redirect('/admin/store/dashboard');
}
