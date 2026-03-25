import { redirect } from 'next/navigation';

export default function AdminReleaseNewRedirectPage() {
  redirect('/admin/releases?mode=create');
}
