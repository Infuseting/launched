import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Info, ShieldAlert, X } from 'lucide-react';
import { useModalFocus } from '../hooks/useModalFocus';
import type { NoticeDialogState } from '../types';

interface NoticeModalProps {
  dialog: NoticeDialogState | null;
  onResolve: (confirmed: boolean) => void;
}

export const NoticeModal: React.FC<NoticeModalProps> = ({
  dialog,
  onResolve,
}) => {
  const isOpen = dialog !== null;
  const dialogRef = useModalFocus(isOpen, 70);
  const variant = dialog?.variant ?? 'info';
  const hasCancel = Boolean(dialog?.cancelLabel);

  const Icon =
    variant === 'error'
      ? ShieldAlert
      : variant === 'warning'
        ? AlertTriangle
        : Info;

  const iconClasses =
    variant === 'error'
      ? 'bg-red-500/10 border-red-500/20 text-red-400'
      : variant === 'warning'
        ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
        : 'bg-white/5 border-white/10 text-white/90';

  return (
    <AnimatePresence>
      {dialog && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6 select-none">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onResolve(false)}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
          />

          <motion.div
            ref={dialogRef}
            tabIndex={-1}
            role={variant === 'error' ? 'alertdialog' : 'dialog'}
            aria-modal="true"
            aria-labelledby="notice-modal-title"
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: 'spring', duration: 0.35, bounce: 0.05 }}
            className="relative z-10 w-full max-w-md bg-neutral-900/95 border border-white/10 rounded-2xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.7)] text-white overflow-hidden space-y-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 ${iconClasses}`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    id="notice-modal-title"
                    className="font-semibold text-sm tracking-tight text-white"
                  >
                    {dialog.title}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => onResolve(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs leading-relaxed text-white/75 whitespace-pre-wrap break-words select-text">
              {dialog.message}
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-1">
              {hasCancel && (
                <button
                  type="button"
                  onClick={() => onResolve(false)}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-white/75 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer"
                >
                  {dialog.cancelLabel}
                </button>
              )}
              <button
                type="button"
                onClick={() => onResolve(true)}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-white text-black hover:bg-white/90 transition-colors cursor-pointer"
              >
                {dialog.confirmLabel ?? 'Compris'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default NoticeModal;
