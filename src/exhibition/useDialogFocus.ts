import { useLayoutEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const isVisiblyFocusable = (element: HTMLElement): boolean => {
  if (!element.isConnected) return false;
  if (element.closest("[hidden], [inert], [aria-hidden='true']")) return false;
  const style = window.getComputedStyle(element);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.visibility === "collapse" ||
    Number.parseFloat(style.opacity) === 0
  ) {
    return false;
  }
  return element.getClientRects().length > 0;
};

const focusableElements = (root: HTMLElement): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisiblyFocusable);

/** Focus containment, trigger restoration, and scroll locking for true modal overlays. */
export function useDialogFocus<T extends HTMLElement>(returnFocus?: HTMLElement | null) {
  const dialogRef = useRef<T>(null);
  const restoreTimerRef = useRef<number | undefined>(undefined);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    if (restoreTimerRef.current !== undefined) window.clearTimeout(restoreTimerRef.current);
    const previousFocus =
      returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : undefined);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const initial =
      dialog.querySelector<HTMLElement>("[data-dialog-initial-focus]") ??
      focusableElements(dialog)[0] ??
      dialog;
    initial.focus({ preventScroll: true });

    const containFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const elements = focusableElements(dialog);
      if (elements.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", containFocus, true);

    return () => {
      document.removeEventListener("keydown", containFocus, true);
      document.body.style.overflow = previousOverflow;
      restoreTimerRef.current = window.setTimeout(() => {
        if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      }, 0);
    };
  }, []);

  return dialogRef;
}
