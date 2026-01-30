'use client';

import { motion } from 'framer-motion';
import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, hover = false, children, ...props }, ref) => {
    const Component = hover ? motion.div : 'div';
    const motionProps = hover
      ? {
          whileHover: { scale: 1.02, y: -4 },
          transition: { type: 'spring', stiffness: 300 },
        }
      : {};

    return (
      <Component
        ref={ref}
        className={cn(
          'bg-card rounded-3xl border-2 border-border-light p-6 shadow-sm',
          className
        )}
        {...motionProps}
        {...props}
      >
        {children}
      </Component>
    );
  }
);

Card.displayName = 'Card';

export default Card;
