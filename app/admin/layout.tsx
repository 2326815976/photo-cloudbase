import { createClient } from '@/lib/cloudbase/server';
import { redirect } from 'next/navigation';
import AdminSidebar from './components/AdminSidebar';

function isTransientConnectionError(message: string): boolean {
  const normalized = String(message ?? '').toLowerCase();
  return (
    normalized.includes('connect timeout') ||
    normalized.includes('request timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('etimedout') ||
    normalized.includes('esockettimedout') ||
    normalized.includes('network')
  );
}

function renderConnectionErrorPanel(description: string) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-[#5D4037]/10 bg-white p-6 shadow-sm">
        <h1
          className="text-2xl font-bold text-[#5D4037] mb-3"
          style={{ fontFamily: "'ZQKNNY', cursive" }}
        >
          管理台暂时不可用
        </h1>
        <p className="text-sm text-[#5D4037]/70 leading-6 mb-5">{description}</p>
        <div className="flex gap-2">
          <a
            href="/admin"
            className="flex-1 h-10 rounded-full bg-[#FFC857] text-[#5D4037] font-medium flex items-center justify-center hover:shadow-md transition-shadow"
          >
            立即重试
          </a>
          <a
            href="/login?from=%2Fadmin"
            className="flex-1 h-10 rounded-full border border-[#5D4037]/20 text-[#5D4037] font-medium flex items-center justify-center hover:bg-[#5D4037]/5 transition-colors"
          >
            返回登录
          </a>
        </div>
      </div>
    </div>
  );
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const dbClient = await createClient();
  const {
    data: { user },
    error: authError,
  } = await dbClient.auth.getUser();

  if (authError && isTransientConnectionError(authError.message || '')) {
    return renderConnectionErrorPanel('鉴权服务连接超时，请稍后重试。');
  }

  if (!user) {
    redirect('/login?from=%2Fadmin');
  }

  // 检查用户角色
  const { data: profile, error: profileError } = await dbClient
    .from('profiles')
    .select('role, name, email')
    .eq('id', user.id)
    .single();

  if (profileError) {
    if (isTransientConnectionError(profileError.message || '')) {
      return renderConnectionErrorPanel('用户资料查询超时，请稍后重试。');
    }
    return renderConnectionErrorPanel('用户资料加载失败，请稍后重试。');
  }

  if (profile?.role !== 'admin') {
    redirect('/profile');
  }

  return (
    <div className="min-h-screen bg-slate-50" style={{ width: '100%', maxWidth: '100vw', overflow: 'hidden' }}>
      <div className="flex">
        <AdminSidebar username={profile.name || profile.email || '管理员'} />
        <main className="flex-1 md:ml-64 pt-14 md:pt-0 p-4 sm:p-6 md:p-8" style={{ width: '100%', maxWidth: '100%' }}>
          {children}
        </main>
      </div>
    </div>
  );
}


