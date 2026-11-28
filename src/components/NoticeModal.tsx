import React from 'react';
import { AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import { useModalFocus } from '../hooks/useModalFocus';
import type { NoticeDialogState } from '../types';
import ModalShell from './ModalShell';

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
    <ModalShell
      isOpen={isOpen}
      dialogRef={dialogRef}
      titleId="notice-modal-title"
      title={dialog?.title ?? ''}
      icon={<Icon className="w-5 h-5" />}
      iconClassName={iconClasses}
      role={variant === 'error' ? 'alertdialog' : 'dialog'}
      zIndexClass="z-[70]"
      onBackdropClick={() => onResolve(false)}
      onClose={() => onResolve(false)}
    >
      <p className="text-xs leading-relaxed text-white/75 whitespace-pre-wrap break-words select-text">
        {dialog?.message}
      </p>

      <div className="flex items-center justify-end gap-2.5 pt-1">
        {hasCancel && (
          <button
            type="button"
            onClick={() => onResolve(false)}
            className="px-4 py-2 rounded-lg text-xs font-medium text-white/75 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer"
          >
            {dialog?.cancelLabel}
          </button>
        )}
        <button
          type="button"
          onClick={() => onResolve(true)}
          className="px-4 py-2 rounded-lg text-xs font-semibold bg-white text-black hover:bg-white/90 transition-colors cursor-pointer"
        >
          {dialog?.confirmLabel ?? 'Compris'}
        </button>
      </div>
    </ModalShell>
  );
};

export default NoticeModal;
