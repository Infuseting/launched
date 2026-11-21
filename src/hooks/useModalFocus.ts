import { useEffect, useRef } from 'react';

const openDialogs = new Map<HTMLElement, number>();
const focusableSelector =
  'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

function topDialog(): HTMLElement | undefined {
  return [...openDialogs].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** Contain keyboard focus in the foremost overlay and restore its opener on close. */
export function useModalFocus(isOpen: boolean, priority: number) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    openDialogs.set(dialog, priority);

    const focusable = () =>
      [...dialog.querySelectorAll<HTMLElement>(focusableSelector)].filter(
        (element) =>
          element.getClientRects().length > 0 && element.tabIndex >= 0,
      );
    const focusFirst = () =>
      (
        dialog.querySelector<HTMLElement>('[data-initial-focus]') ??
        focusable()[0] ??
        dialog
      ).focus();
    if (topDialog() === dialog) focusFirst();

    const onFocus = (event: FocusEvent) => {
      if (
        topDialog() === dialog &&
        event.target instanceof Node &&
        !dialog.contains(event.target)
      )
        focusFirst();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || topDialog() !== dialog) return;
      const controls = focusable();
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (
        !first ||
        (event.shiftKey
          ? document.activeElement === first ||
            document.activeElement === dialog
          : document.activeElement === last)
      ) {
        event.preventDefault();
        (event.shiftKey ? (last ?? dialog) : (first ?? dialog)).focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocus);
    return () => {
      const wasTop = topDialog() === dialog;
      openDialogs.delete(dialog);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocus);
      if (wasTop) {
        const remainingDialog = topDialog();
        if (
          opener?.isConnected &&
          (!remainingDialog || remainingDialog.contains(opener))
        ) {
          opener.focus();
        } else {
          remainingDialog?.focus();
        }
      }
    };
  }, [isOpen, priority]);

  return dialogRef;
}
