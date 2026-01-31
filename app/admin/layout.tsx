import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import AdminSidebar from './components/AdminSidebar';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // 检查用户角色
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, name, email')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    redirect('/profile');
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex">
        <AdminSidebar username={profile.name || profile.email || '管理员'} />
        <main className="flex-1 md:ml-64 pt-14 md:pt-0 p-4 sm:p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
