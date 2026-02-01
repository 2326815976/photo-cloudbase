/**
 * 会话管理工具
 * 用于生成和管理用户会话ID（用于浏览量去重）
 */

/**
 * 获取或创建会话ID
 * 对于未登录用户，使用localStorage存储会话ID
 * 对于登录用户，返回null（使用用户ID）
 */
export function getSessionId(): string | null {
  // 检查是否在浏览器环境
  if (typeof window === 'undefined') {
    return null;
  }

  const SESSION_KEY = 'photo_session_id';

  // 尝试从localStorage获取现有会话ID
  let sessionId = localStorage.getItem(SESSION_KEY);

  // 如果不存在，创建新的会话ID
  if (!sessionId) {
    sessionId = generateSessionId();
    localStorage.setItem(SESSION_KEY, sessionId);
  }

  return sessionId;
}

/**
 * 生成唯一的会话ID
 * 使用UUID v4格式
 */
function generateSessionId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 清除会话ID（用于测试或重置）
 */
export function clearSessionId(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('photo_session_id');
  }
}
