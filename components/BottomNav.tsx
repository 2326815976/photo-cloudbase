'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Lock, Image, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';

const navItems = [
  { href: '/', label: '首页', icon: Home },
  { href: '/album', label: '专属', icon: Lock },
  { href: '/gallery', label: '作品', icon: Image },
  { href: '/booking', label: '约拍', icon: Calendar },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-[400px] bg-[#FFFBF0]/90 backdrop-blur-md rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] z-50 border-2 border-[#5D4037]/10 pointer-events-none">
      <div className="px-4 py-3">
        <div className="flex justify-around items-center">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href === '/album' && pathname.startsWith('/album'));
            const Icon = item.icon;

            return (
              <Link key={item.href} href={item.href} className="flex-1 pointer-events-auto">
                <motion.div
                  whileTap={{ scale: 0.9 }}
                  animate={isActive ? { y: -2 } : { y: 0 }}
                  className={`flex flex-col items-center gap-1 py-2 rounded-2xl transition-colors ${
                    isActive ? 'text-[#FFC857]' : 'text-[#5D4037]/60'
                  }`}
                >
                  <Icon
                    className={`w-6 h-6 ${isActive ? 'fill-[#FFC857]' : ''}`}
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                  <span className="text-xs font-medium">{item.label}</span>
                </motion.div>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
