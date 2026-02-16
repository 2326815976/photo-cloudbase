/**
 * 手机号工具函数（中国大陆）
 */

const CHINA_MOBILE_REGEX = /^1[3-9]\d{9}$/;

/**
 * 归一化手机号：
 * - 仅允许中国区手机号（可选前缀：+86）
 * - 仅保留数字（用于服务端校验与入库前处理；不会强制截断长度）
 * - 若检测到其他国家码（以 "+" 开头但不是 "+86"），直接视为非法并返回空串
 */
export function normalizeChinaMobile(input: string): string {
  const raw = String(input ?? '').trim();
  if (!raw) {
    return '';
  }

  // 仅允许 +86，拒绝其他国家码，避免误把国际号码“洗”成可用的 11 位数字。
  if (raw.startsWith('+') && !raw.startsWith('+86')) {
    return '';
  }

  if (raw.startsWith('00')) {
    return '';
  }

  const withoutPrefix = raw.startsWith('+86') ? raw.slice(3) : raw;
  const digits = withoutPrefix.replace(/\D/g, '');

  // 非 +86 场景下出现 86 前缀（如 86138...），按“非法格式”处理。
  if (!raw.startsWith('+86') && digits.startsWith('86') && digits.length > 11) {
    return '';
  }

  return digits;
}

/**
 * 客户端输入友好：在归一化基础上限制为 11 位，避免受控输入超长。
 */
export function clampChinaMobileInput(input: string): string {
  return normalizeChinaMobile(input).slice(0, 11);
}

export function isValidChinaMobile(input: string): boolean {
  return CHINA_MOBILE_REGEX.test(normalizeChinaMobile(input));
}
