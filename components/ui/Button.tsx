'use client';

import { motion } from 'framer-motion';
import { ButtonHTMLAttributes, forwardRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { isAndroidApp } from '@/lib/platform';

interface ButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'
> {
  variant?: 'primary' | 'secondary' | 'accent';
  size?: 'sm' | 'md' | 'lg';
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, ...props }, ref) => {
    const [isAndroid, setIsAndroid] = useState(false);

    useEffect(() => {
      setIsAndroid(isAndroidApp());
    }, []);

    const baseStyles = 'font-medium rounded-2xl border-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed';

    const variants = {
      primary: 'bg-primary text-primary-foreground border-border shadow-[4px_4px_0px_#5D4037] hover:bg-primary/90 hover:shadow-[2px_2px_0px_#5D4037] hover:translate-x-[2px] hover:translate-y-[2px]',
      secondary: 'bg-secondary text-secondary-foreground border-border shadow-[4px_4px_0px_#5D4037] hover:bg-secondary/90 hover:shadow-[2px_2px_0px_#5D4037] hover:translate-x-[2px] hover:translate-y-[2px]',
      accent: 'bg-accent text-accent-foreground border-border shadow-[4px_4px_0px_#5D4037] hover:bg-accent/90 hover:shadow-[2px_2px_0px_#5D4037] hover:translate-x-[2px] hover:translate-y-[2px]',
    };

    const sizes = {
      sm: 'px-4 py-2 text-sm',
      md: 'px-6 py-3 text-base',
      lg: 'px-8 py-4 text-lg',
    };

    // Android: 使用纯 CSS 动画
    if (isAndroid) {
      return (
        <button
          ref={ref}
          className={cn(
            baseStyles,
            variants[variant],
            sizes[size],
            'active:scale-95',
            className
          )}
          {...props}
        >
          {children}
        </button>
      );
    }

    // Web/iOS: 使用 Framer Motion
    return (
      <motion.button
        ref={ref}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {children}
      </motion.button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
