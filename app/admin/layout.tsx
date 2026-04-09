import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/cloudbase/server';
import AdminSidebar from './components/AdminSidebar';

const CONNECTION_PANEL_TITLE = '管理台暂时不可用';
const RETRY_TEXT = '立即重试';
const BACK_TO_LOGIN_TEXT = '返回登录';
const ADMIN_FALLBACK_NAME = '管理员';
const ADMIN_AUTH_TIMEOUT_MS = 10000;

type SessionUser = {
  id: string;
  role?: unknown;
  name?: unknown;
  email?: unknown;
};

type AdminProfile = {
  role?: string;
  name?: string;
  email?: string;
};

function withTimeout<T>(promise: PromiseLike<T> | Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);

    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function isTransientConnectionError(message: string): boolean {
  const normalized = String(message ?? '').toLowerCase();
  return (
    normalized.includes('transient_backend') ||
    normalized.includes('服务暂时不可用') ||
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
          {'后台连接提示'}
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

async function loadProfileIfNeeded(dbClient: Awaited<ReturnType<typeof createClient>>, sessionUser: SessionUser): Promise<{
  profile: AdminProfile | null;
  profileError: { message?: string } | null;
}> {
  if (String(sessionUser.role ?? '').trim() === 'admin') {
    return {
      profile: {
        role: 'admin',
        name: typeof sessionUser.name === 'string' ? sessionUser.name : '',
        email: typeof sessionUser.email === 'string' ? sessionUser.email : '',
      },
      profileError: null,
    };
  }

  try {
    const profileResult = await withTimeout(
      dbClient.from('profiles').select('role, name, email').eq('id', sessionUser.id).maybeSingle(),
      ADMIN_AUTH_TIMEOUT_MS,
      '用户资料查询超时'
    );

    return {
      profile: (profileResult.data as AdminProfile | null) ?? null,
      profileError: profileResult.error,
    };
  } catch (error) {
    return {
      profile: null,
      profileError: {
        message: error instanceof Error ? error.message : '用户资料查询超时',
      },
    };
  }
}

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const dbClient = await createClient();
  let user: SessionUser | null = null;
  let authError: { message?: string } | null = null;

  try {
    const authResult = await withTimeout(
      dbClient.auth.getUser(),
      ADMIN_AUTH_TIMEOUT_MS,
      '鉴权服务连接超时'
    );
    user = (authResult.data?.user as SessionUser | null) ?? null;
    authError = authResult.error;
  } catch (error) {
    authError = {
      message: error instanceof Error ? error.message : '鉴权服务连接超时',
    };
  }

  if (authError && isTransientConnectionError(authError.message || '')) {
    return renderConnectionErrorPanel('鉴权服务连接超时，请稍后重试。');
  }

  if (!user) {
    redirect('/login?from=%2Fadmin');
  }

  const { profile, profileError } = await loadProfileIfNeeded(dbClient, user);

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
    <div className="admin-shell min-h-screen bg-[#FFFBF0] [background-image:radial-gradient(circle_at_8%_0%,rgba(255,200,87,0.16),transparent_34%),radial-gradient(circle_at_94%_16%,rgba(255,153,102,0.12),transparent_30%)]" style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
      <div className="relative flex min-h-screen min-w-0 w-full overflow-x-hidden">
        <AdminSidebar username={profile?.name || profile?.email || ADMIN_FALLBACK_NAME} />
        <main className="admin-main relative min-w-0 w-full flex-1 overflow-x-hidden px-4 pb-8 pt-[72px] sm:px-6 md:ml-72 md:px-8 md:pt-6 lg:px-10">
          <div className="admin-main__inner mx-auto w-full min-w-0 max-w-[1480px] overflow-x-hidden">{children}</div>
        </main>
      </div>
    </div>
  );
}
