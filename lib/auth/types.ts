export type SessionRole = 'anonymous' | 'user' | 'admin' | 'system';

export interface AuthUser {
  id: string;
  email: string | null;
  phone: string | null;
  role: 'user' | 'admin';
  name: string | null;
}

export interface AuthContext {
  role: SessionRole;
  user: AuthUser | null;
}

