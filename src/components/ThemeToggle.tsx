import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

export default function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={toggleTheme}
      className={cn(
        "p-2.5 rounded-xl border border-outline-variant/20 bg-surface-container-lowest text-on-surface shadow-sm hover:shadow-md transition-all flex items-center justify-center",
        className
      )}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      {theme === 'light' ? (
        <Sun className="w-5 h-5 text-amber-500 animate-in fade-in zoom-in duration-300" />
      ) : (
        <Moon className="w-5 h-5 text-indigo-400 animate-in fade-in zoom-in duration-300" />
      )}
    </motion.button>
  );
}
