'use client';

import { motion } from 'framer-motion';
import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'transition'> {
  hover?: boolean;
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, hover = false, children, ...props }, ref) => {
    if (hover) {
      return (
        <motion.div
          ref={ref}
          whileHover={{ scale: 1.02, y: -4 }}
          transition={{ type: 'spring', stiffness: 300 }}
          className={cn(
            'bg-card rounded-2xl border-2 border-border-light p-6 shadow-[0_4px_12px_rgba(93,64,55,0.08)]',
            className
          )}
          {...(props as any)}
        >
          {children}
        </motion.div>
      );
    }

    return (
      <div
        ref={ref}
        className={cn(
          'bg-card rounded-2xl border-2 border-border-light p-6 shadow-sm',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

export default Card;
