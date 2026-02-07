'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDateUTC8, getDateAfterDaysUTC8, getTodayUTC8, parseDateUTC8 } from '@/lib/utils/date-helpers';

interface DatePickerProps {
  value: string | null;  // YYYY-MM-DD
  onChange: (date: string) => void;
  minDate?: string;  // 默认今天
  maxDate?: string;  // 默认今天+30天
  blockedDates: string[];  // 锁定日期数组
  placeholder?: string;
}

export default function DatePicker({
  value,
  onChange,
  minDate,
  maxDate,
  blockedDates,
  placeholder = '请选择日期...'
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => parseDateUTC8(getTodayUTC8()));
  const containerRef = useRef<HTMLDivElement>(null);

  // 计算默认的最小和最大日期（UTC）
  const today = parseDateUTC8(getTodayUTC8());
  const min = minDate ? parseDateUTC8(minDate) : today;
  const max = maxDate ? parseDateUTC8(maxDate) : parseDateUTC8(getDateAfterDaysUTC8(30));

  // 格式化显示日期（UTC）
  const formatDisplayDate = (dateStr: string) => {
    const date = parseDateUTC8(dateStr);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Shanghai'
    });
  };

  // 生成月份日历（UTC，5行 35天）
  const generateCalendar = (year: number, month: number) => {
    const firstDay = new Date(Date.UTC(year, month, 1));
    const lastDay = new Date(Date.UTC(year, month + 1, 0));
    const startDate = new Date(firstDay);
    startDate.setUTCDate(startDate.getUTCDate() - firstDay.getUTCDay());

    const days = [];
    for (let i = 0; i < 35; i++) {  // 改为35天（5行 x 7天）
      const date = new Date(startDate);
      date.setUTCDate(date.getUTCDate() + i);
      days.push(date);
    }
    return days;
  };

  // 判断日期是否可选
  const isDateSelectable = (date: Date) => {
    const dateStr = formatDateUTC8(date);
    const isInRange = date >= min && date <= max;
    const isBlocked = blockedDates.includes(dateStr);

    return isInRange && !isBlocked;
  };

  // 判断日期是否在当前月份
  const isCurrentMonth = (date: Date) => {
    return date.getUTCMonth() === currentMonth.getUTCMonth() &&
           date.getUTCFullYear() === currentMonth.getUTCFullYear();
  };

  // 判断日期是否被选中
  const isSelected = (date: Date) => {
    if (!value) return false;
    return formatDateUTC8(date) === value;
  };

  // 判断日期是否被锁定
  const isBlocked = (date: Date) => {
    const dateStr = formatDateUTC8(date);
    return blockedDates.includes(dateStr);
  };

  // 切换月份
  const changeMonth = (offset: number) => {
    const newMonth = new Date(currentMonth);
    newMonth.setUTCMonth(newMonth.getUTCMonth() + offset);
    setCurrentMonth(newMonth);
  };

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const days = generateCalendar(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth());
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 pr-10 bg-white border-2 border-[#5D4037]/20 rounded-2xl text-[#5D4037] font-medium text-left focus:outline-none focus:border-[#FFC857] focus:shadow-[0_0_0_3px_rgba(255,200,87,0.2)] transition-all text-base"
      >
        {value ? (
          <span>{formatDisplayDate(value)}</span>
        ) : (
          <span className="text-[#5D4037]/40">{placeholder}</span>
        )}
        <Calendar
          className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#5D4037]"
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute z-50 w-full mt-2 bg-[#fffdf5] border-2 border-[#5D4037]/20 rounded-2xl shadow-lg overflow-hidden"
            style={{ minWidth: '280px', maxWidth: '320px' }}
          >
            {/* 月份导航 */}
            <div className="flex items-center justify-between px-3 py-2 bg-[#FFC857]/10 border-b border-[#5D4037]/10">
              <button
                type="button"
                onClick={() => changeMonth(-1)}
                className="p-1 hover:bg-[#5D4037]/10 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-[#5D4037]" />
              </button>
              <span className="text-sm font-bold text-[#5D4037]">
                {currentMonth.getUTCFullYear()}年{currentMonth.getUTCMonth() + 1}月
              </span>
              <button
                type="button"
                onClick={() => changeMonth(1)}
                className="p-1 hover:bg-[#5D4037]/10 rounded-lg transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-[#5D4037]" />
              </button>
            </div>

            {/* 星期标题 */}
            <div className="grid grid-cols-7 gap-0.5 px-1.5 py-1.5 bg-[#FFC857]/5">
              {weekDays.map((day) => (
                <div
                  key={day}
                  className="text-center text-[10px] font-medium text-[#5D4037]/60 py-0.5"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* 日期网格 */}
            <div className="grid grid-cols-7 gap-0.5 p-1.5">
              {days.map((date, index) => {
                const selectable = isDateSelectable(date);
                const selected = isSelected(date);
                const blocked = isBlocked(date);
                const inCurrentMonth = isCurrentMonth(date);

                return (
                  <motion.button
                    key={index}
                    type="button"
                    onClick={() => {
                      if (selectable) {
                        onChange(formatDateUTC8(date));
                        setIsOpen(false);
                      }
                    }}
                    disabled={!selectable}
                    whileHover={selectable ? { scale: 1.05 } : {}}
                    whileTap={selectable ? { scale: 0.95 } : {}}
                    className={`
                      aspect-square rounded-md text-xs font-medium transition-all
                      ${!inCurrentMonth ? 'text-[#5D4037]/20' : ''}
                      ${selected ? 'bg-[#FFC857] text-white shadow-md' : ''}
                      ${!selected && selectable && inCurrentMonth ? 'bg-white hover:bg-[#FFC857]/20 text-[#5D4037]' : ''}
                      ${blocked ? 'bg-[#5D4037]/5 text-[#5D4037]/30 cursor-not-allowed relative' : ''}
                      ${!selectable && !blocked ? 'text-[#5D4037]/20 cursor-not-allowed' : ''}
                    `}
                  >
                    {date.getDate()}
                    {blocked && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-full h-0.5 bg-[#5D4037]/20 rotate-45" />
                      </div>
                    )}
                  </motion.button>
                );
              })}
            </div>

            {/* 图例说明 */}
            <div className="px-3 py-2 bg-[#FFC857]/5 border-t border-[#5D4037]/10 text-[10px] text-[#5D4037]/60 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-[#FFC857] rounded" />
                <span>已选中</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 bg-[#5D4037]/5 rounded relative">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-full h-0.5 bg-[#5D4037]/20 rotate-45" />
                  </div>
                </div>
                <span>已锁定</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
