'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Image, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';

const navItems = [
  { href: '/', label: '首页', icon: Home },
  { href: '/gallery', label: '作品墙', icon: Image },
  { href: '/booking', label: '约拍', icon: Calendar },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t-2 border-border-light shadow-lg z-30">
      <div className="max-w-lg mx-auto px-4 py-3">
        <div className="flex justify-around items-center">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;

            return (
              <Link key={item.href} href={item.href} className="flex-1">
                <motion.div
                  whileTap={{ scale: 0.9 }}
                  className={`flex flex-col items-center gap-1 py-2 rounded-2xl transition-colors ${
                    isActive ? 'text-primary' : 'text-foreground/60'
                  }`}
                >
                  <Icon className="w-6 h-6" />
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
