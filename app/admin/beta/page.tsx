import { redirect } from 'next/navigation';

export default function LegacyAdminBetaRedirectPage() {
  redirect('/admin/web-pages');
}
