/**
 * 日期处理工具函数
 * 统一使用UTC时间，避免时区问题
 */

/**
 * 将Date对象格式化为YYYY-MM-DD格式（UTC时间）
 * @param date Date对象
 * @returns YYYY-MM-DD格式的日期字符串
 */
export function formatDateUTC(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 获取今天的日期（UTC）
 * @returns YYYY-MM-DD格式的今天日期
 */
export function getTodayUTC(): string {
  return formatDateUTC(new Date());
}

/**
 * 获取N天后的日期（UTC）
 * @param days 天数
 * @returns YYYY-MM-DD格式的日期
 */
export function getDateAfterDaysUTC(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateUTC(date);
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
 * 解析YYYY-MM-DD格式的日期字符串为Date对象（UTC）
 * @param dateStr YYYY-MM-DD格式的日期字符串
 * @returns Date对象
 */
export function parseDateUTC(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * 计算两个日期之间的天数差
 * @param date1 第一个日期
 * @param date2 第二个日期
 * @returns 天数差（date2 - date1）
 */
export function getDaysDifference(date1: string, date2: string): number {
  const d1 = parseDateUTC(date1);
  const d2 = parseDateUTC(date2);
  const diffTime = d2.getTime() - d1.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
