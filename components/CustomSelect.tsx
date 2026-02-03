'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

interface Option {
  value: number;
  label: string;
  emoji?: string;
}

interface CustomSelectProps {
  value: number;
  onChange: (value: number) => void;
  options: Option[];
  placeholder?: string;
  required?: boolean;
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = '请选择...',
  required = false
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(opt => opt.value === value);

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

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 pr-10 bg-white border-2 border-[#5D4037]/20 rounded-2xl text-[#5D4037] font-medium text-left focus:outline-none focus:border-[#FFC857] focus:shadow-[0_0_0_3px_rgba(255,200,87,0.2)] transition-all text-base"
      >
        {selectedOption ? (
          <span>
            {selectedOption.emoji && `${selectedOption.emoji} `}
            {selectedOption.label}
          </span>
        ) : (
          <span className="text-[#5D4037]/40">{placeholder}</span>
        )}
        <ChevronDown
          className={`absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#5D4037] transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute z-50 w-full mt-2 bg-white border-2 border-[#5D4037]/20 rounded-2xl shadow-lg overflow-hidden"
          >
            <div className="max-h-60 overflow-y-auto">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`w-full px-4 py-3 text-left transition-colors ${
                    option.value === value
                      ? 'bg-[#FFC857]/20 text-[#5D4037] font-medium'
                      : 'text-[#5D4037] hover:bg-[#5D4037]/5'
                  }`}
                >
                  {option.emoji && `${option.emoji} `}
                  {option.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
