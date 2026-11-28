import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface ModalShellProps {
  isOpen: boolean;
  dialogRef: React.RefObject<HTMLDivElement | null>;
  titleId: string;
  title: string;
  subtitle?: React.ReactNode;
  icon: React.ReactNode;
  iconClassName?: string;
  role?: 'dialog' | 'alertdialog';
  zIndexClass?: string;
  maxWidthClass?: string;
  showCloseButton?: boolean;
  onBackdropClick?: () => void;
  onClose?: () => void;
  children: React.ReactNode;
}

/**
 * Shared modal overlay, backdrop, spring container, and header shell.
 */
export const ModalShell: React.FC<ModalShellProps> = ({
  isOpen,
  dialogRef,
  titleId,
  title,
  subtitle,
  icon,
  iconClassName = 'bg-white/5 border-white/10 text-white/90',
  role = 'dialog',
  zIndexClass = 'z-50',
  maxWidthClass = 'max-w-md',
  showCloseButton = true,
  onBackdropClick,
  onClose,
  children,
}) => (
  <AnimatePresence>
    {isOpen && (
      <div
        className={`fixed inset-0 ${zIndexClass} flex items-center justify-center p-6 select-none`}
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onBackdropClick}
          className="absolute inset-0 bg-black/80 backdrop-blur-md"
        />

        <motion.div
          ref={dialogRef}
          tabIndex={-1}
          role={role}
          aria-modal="true"
          aria-labelledby={titleId}
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ type: 'spring', duration: 0.35, bounce: 0.05 }}
          className={`relative z-10 w-full ${maxWidthClass} bg-neutral-900/95 border border-white/10 rounded-2xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.7)] text-white overflow-hidden space-y-5`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div
                className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 ${iconClassName}`}
              >
                {icon}
              </div>
              <div>
                <h3
                  id={titleId}
                  className="font-semibold text-sm tracking-tight text-white"
                >
                  {title}
                </h3>
                {subtitle && (
                  <div className="text-white/50 text-xs mt-0.5">{subtitle}</div>
                )}
              </div>
            </div>
            {showCloseButton && onClose && (
              <button
                type="button"
                aria-label="Fermer"
                title="Fermer"
                onClick={onClose}
                className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {children}
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

export default ModalShell;
