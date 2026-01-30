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
    <nav className="fixed bottom-0 left-0 w-full h-[68px] bg-[#FFFBF0]/95 backdrop-blur-md border-t-2 border-dashed border-[#5D4037]/10 z-50">
      <div className="flex justify-around items-center h-full px-4 pb-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href === '/album' && pathname.startsWith('/album'));
          const Icon = item.icon;

          return (
            <Link key={item.href} href={item.href} className="flex-1">
              <motion.div
                whileTap={{ scale: 0.9 }}
                animate={isActive ? { scale: 1.1 } : { scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                className={`flex flex-col items-center gap-0.5 transition-colors ${
                  isActive ? 'text-[#FFC857]' : 'text-[#5D4037]/60'
                }`}
              >
                <motion.div
                  animate={isActive ? { y: [0, -3, 0] } : { y: 0 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                >
                  <Icon
                    className={`w-6 h-6 ${isActive ? 'fill-[#FFC857]' : ''}`}
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                </motion.div>
                <span className="text-[10px] font-medium scale-90">{item.label}</span>
              </motion.div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
