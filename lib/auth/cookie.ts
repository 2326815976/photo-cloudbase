export const SESSION_COOKIE_NAME = 'photo_session';
export const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  };
}

