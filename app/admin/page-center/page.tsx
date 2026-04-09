import { redirect } from 'next/navigation';

export default function LegacyAdminPageCenterRedirectPage() {
  redirect('/admin/web-pages');
}
