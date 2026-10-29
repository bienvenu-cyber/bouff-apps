import { redirect } from 'next/navigation';

// Page de l'ancien logiciel, non reliée à BOUFF : masquée.
export default function Hidden() {
  redirect('/admin/store/dashboard');
}
