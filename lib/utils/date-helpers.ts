/**
 * 日期处理工具函数
 * 统一使用 UTC+8 时间（Asia/Shanghai）
 */

const UTC8_OFFSET_MINUTES = 8 * 60;
const UTC8_OFFSET_MS = UTC8_OFFSET_MINUTES * 60 * 1000;
const UTC8_TIME_ZONE = 'Asia/Shanghai';
const MYSQL_DATETIME_REGEX = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/;

const formatUTCParts = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatUTCTimeParts = (date: Date): string => {
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
};

/**
 * 将Date对象格式化为YYYY-MM-DD格式（UTC+8）
 * @param date Date对象
 * @returns YYYY-MM-DD格式的日期字符串
 */
export function formatDateUTC8(date: Date): string {
  const shifted = new Date(date.getTime() + UTC8_OFFSET_MS);
  return formatUTCParts(shifted);
}

/**
 * 将Date对象格式化为YYYY-MM-DD HH:mm:ss格式（UTC+8），用于写入MySQL DATETIME字段
 * @param date Date对象
 * @returns YYYY-MM-DD HH:mm:ss格式的日期时间字符串
 */
export function formatDateTimeUTC8(date: Date): string {
  const shifted = new Date(date.getTime() + UTC8_OFFSET_MS);
  return `${formatUTCParts(shifted)} ${formatUTCTimeParts(shifted)}`;
}

/**
 * 解析 DATETIME（无时区）为 UTC+8 时间
 * @param value 数据库返回的日期时间值
 * @returns Date对象（解析失败返回null）
 */
export function parseDateTimeUTC8(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }

  // ISO 字符串若自带时区，直接按原值解析。
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(raw)) {
    const parsed = new Date(raw);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  const matched = raw.match(MYSQL_DATETIME_REGEX);
  if (matched) {
    const [, year, month, day, hour, minute, second, milli = '0'] = matched;
    const milliseconds = Number(milli.padEnd(3, '0'));
    const parsed = new Date(
      Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour) - 8,
        Number(minute),
        Number(second),
        milliseconds
      )
    );
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  const normalizedIso = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const fallback = new Date(normalizedIso);
  return Number.isFinite(fallback.getTime()) ? fallback : null;
}

/**
 * 解析 DATETIME（无时区）到时间戳（毫秒）
 * @param value 数据库返回的日期时间值
 * @returns 时间戳（毫秒，失败返回0）
 */
export function toTimestampUTC8(value: unknown): number {
  const parsed = parseDateTimeUTC8(value);
  return parsed ? parsed.getTime() : 0;
}

/**
 * 将数据库日期时间按 UTC+8 口径格式化为展示字符串
 * @param value 数据库返回的日期时间值
 * @param options toLocaleDateString 格式化选项
 * @param locale 区域设置，默认 zh-CN
 * @returns 格式化后的日期字符串（解析失败返回空串）
 */
export function formatDateDisplayUTC8(
  value: unknown,
  options: Intl.DateTimeFormatOptions = {},
  locale: string = 'zh-CN'
): string {
  const parsed = parseDateTimeUTC8(value);
  if (!parsed) {
    return '';
  }

  return parsed.toLocaleDateString(locale, {
    timeZone: UTC8_TIME_ZONE,
    ...options,
  });
}

/**
 * 获取今天的日期（UTC+8）
 * @returns YYYY-MM-DD格式的今天日期
 */
export function getTodayUTC8(): string {
  return formatDateUTC8(new Date());
}

/**
 * 获取N天后的日期（UTC+8）
 * @param days 天数
 * @returns YYYY-MM-DD格式的日期
 */
export function getDateAfterDaysUTC8(days: number): string {
  const shifted = new Date(Date.now() + UTC8_OFFSET_MS);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return formatUTCParts(shifted);
}

/**
 * 获取N天后的日期时间（UTC+8）
 * @param days 天数
 * @returns YYYY-MM-DD HH:mm:ss格式的日期时间
 */
export function getDateTimeAfterDaysUTC8(days: number): string {
  const shifted = new Date(Date.now() + UTC8_OFFSET_MS);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return `${formatUTCParts(shifted)} ${formatUTCTimeParts(shifted)}`;
}

/**
 * 比较两个日期字符串（YYYY-MM-DD格式）
 * @param date1 第一个日期
 * @param date2 第二个日期
 * @returns date1 < date2 返回-1，date1 > date2 返回1，相等返回0
 */
export function compareDates(date1: string, date2: string): number {
  if (date1 < date2) return -1;
  if (date1 > date2) return 1;
  return 0;
}

/**
 * 检查日期是否在指定范围内
 * @param date 要检查的日期
 * @param startDate 开始日期
 * @param endDate 结束日期
 * @returns 是否在范围内
 */
export function isDateInRange(date: string, startDate: string, endDate: string): boolean {
  return date >= startDate && date <= endDate;
}

/**
 * 解析YYYY-MM-DD格式的日期字符串为Date对象（UTC+8）
 * @param dateStr YYYY-MM-DD格式的日期字符串
 * @returns Date对象
 */
export function parseDateUTC8(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const utcMillis = Date.UTC(year, month - 1, day);
  return new Date(utcMillis - UTC8_OFFSET_MS);
}

/**
 * 计算两个日期之间的天数差
 * @param date1 第一个日期
 * @param date2 第二个日期
 * @returns 天数差（date2 - date1）
 */
export function getDaysDifference(date1: string, date2: string): number {
  const d1 = parseDateUTC8(date1);
  const d2 = parseDateUTC8(date2);
  const diffTime = d2.getTime() - d1.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
