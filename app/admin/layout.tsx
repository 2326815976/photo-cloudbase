import type { ReactNode } from 'react';
import { createClient } from '@/lib/cloudbase/server';
import { redirect } from 'next/navigation';
import AdminSidebar from './components/AdminSidebar';

const CONNECTION_PANEL_TITLE = '\u7ba1\u7406\u53f0\u6682\u65f6\u4e0d\u53ef\u7528';
const RETRY_TEXT = '\u7acb\u5373\u91cd\u8bd5';
const BACK_TO_LOGIN_TEXT = '\u8fd4\u56de\u767b\u5f55';
const ADMIN_FALLBACK_NAME = '\u7ba1\u7406\u5458';

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
    <div className="min-h-screen bg-[#FFFBF0] [background-image:radial-gradient(circle_at_8%_0%,rgba(255,200,87,0.16),transparent_34%),radial-gradient(circle_at_94%_16%,rgba(255,153,102,0.12),transparent_30%)] flex items-center justify-center p-6">
      <div className="relative w-full max-w-lg overflow-hidden rounded-[32px] border border-[#5D4037]/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(255,251,240,0.92)_100%)] p-6 shadow-[0_18px_42px_rgba(93,64,55,0.14)] backdrop-blur-sm sm:p-7">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#FFC857] via-[#FFB347] to-[#FFD67E]" />
        <div className="mb-5 inline-flex items-center rounded-full bg-[#FFC857]/16 px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-[#8D6E63]">
          {'\u540e\u53f0\u8fde\u63a5\u63d0\u793a'}
        </div>
        <h1 className="mb-3 text-[30px] font-bold leading-none text-[#5D4037]" style={{ fontFamily: "'ZQKNNY', cursive" }}>
          {CONNECTION_PANEL_TITLE}
        </h1>
        <p className="mb-6 text-sm leading-6 text-[#5D4037]/72">{description}</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <a
            href="/admin"
            className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-[linear-gradient(135deg,#FFD76E,#FFC857)] text-sm font-semibold text-[#5D4037] shadow-[0_10px_18px_rgba(255,200,87,0.28)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_24px_rgba(255,200,87,0.32)]"
          >
            {RETRY_TEXT}
          </a>
          <a
            href="/login?from=%2Fadmin"
            className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-[#5D4037]/16 bg-white/72 text-sm font-semibold text-[#5D4037] transition-colors hover:bg-white"
          >
            {BACK_TO_LOGIN_TEXT}
          </a>
        </div>
      </div>
    </div>
  );
}

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const dbClient = await createClient();
  const {
    data: { user },
    error: authError,
  } = await dbClient.auth.getUser();

  if (authError && isTransientConnectionError(authError.message || '')) {
    return renderConnectionErrorPanel('\u9274\u6743\u670d\u52a1\u8fde\u63a5\u8d85\u65f6\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002');
  }

  if (!user) {
    redirect('/login?from=%2Fadmin');
  }

  const { data: profile, error: profileError } = await dbClient
    .from('profiles')
    .select('role, name, email')
    .eq('id', user.id)
    .single();

  if (profileError) {
    if (isTransientConnectionError(profileError.message || '')) {
      return renderConnectionErrorPanel('\u7528\u6237\u8d44\u6599\u67e5\u8be2\u8d85\u65f6\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002');
    }
    return renderConnectionErrorPanel('\u7528\u6237\u8d44\u6599\u52a0\u8f7d\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002');
  }

  if (profile?.role !== 'admin') {
    redirect('/profile');
  }

  return (
    <div className="admin-shell min-h-screen bg-[#FFFBF0] [background-image:radial-gradient(circle_at_8%_0%,rgba(255,200,87,0.16),transparent_34%),radial-gradient(circle_at_94%_16%,rgba(255,153,102,0.12),transparent_30%)]" style={{ width: '100%', maxWidth: '100vw', overflow: 'hidden' }}>
      <div className="relative flex min-h-screen">
        <AdminSidebar username={profile.name || profile.email || ADMIN_FALLBACK_NAME} />
        <main className="admin-main relative flex-1 px-4 pb-8 pt-[72px] sm:px-6 md:ml-72 md:px-8 md:pt-6 lg:px-10">
          <div className="admin-main__inner mx-auto w-full max-w-[1480px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
