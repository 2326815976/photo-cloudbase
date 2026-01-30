'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Lock, Image, Calendar, User } from 'lucide-react';
import { motion } from 'framer-motion';

const navItems = [
  { href: '/', label: '首页', icon: Home },
  { href: '/album', label: '返图', icon: Lock },
  { href: '/gallery', label: '照片墙', icon: Image },
  { href: '/booking', label: '约拍', icon: Calendar },
  { href: '/profile', label: '我的', icon: User },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="absolute bottom-0 left-0 w-full h-[68px] bg-[#FFFBF0]/95 backdrop-blur-md border-t-2 border-dashed border-[#5D4037]/15 shadow-[0_-2px_12px_rgba(93,64,55,0.08)] z-50">
      <div className="flex justify-around items-center h-full px-4 pb-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href === '/album' && pathname.startsWith('/album'));
          const Icon = item.icon;

          return (
            <Link key={item.href} href={item.href} className="flex-1">
              <motion.div
                whileTap={{ scale: 0.9 }}
                animate={isActive ? { scale: 1.05 } : { scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                className={`flex flex-col items-center gap-1 transition-colors relative ${
                  isActive ? 'text-[#FFC857]' : 'text-[#5D4037]/60'
                }`}
              >
                {/* 活跃状态背景光晕 */}
                {isActive && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute -top-1 w-14 h-14 bg-[#FFC857]/30 rounded-full blur-lg"
                  />
                )}

                <motion.div
                  animate={isActive ? { y: [0, -3, 0] } : { y: 0 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className="relative"
                >
                  <Icon
                    className={`w-6 h-6 ${isActive ? 'fill-[#FFC857] drop-shadow-[0_2px_4px_rgba(255,200,87,0.3)]' : ''}`}
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                </motion.div>
                <span className={`text-[10px] font-medium ${isActive ? 'font-bold' : ''}`}>{item.label}</span>
              </motion.div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
