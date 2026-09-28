import { redirect } from 'next/navigation';

/**
 * 注册页面重定向
 * 此页面已废弃，所有注册请求将重定向到 /register
 * 保留此文件以兼容旧链接和书签
 */
export default function SignupRedirectPage() {
  redirect('/register');
}
