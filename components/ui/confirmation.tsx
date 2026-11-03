"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/**
 * Native modal confirmation. Focus moves to Cancel when it opens and returns to
 * the control that opened it when it closes, so keyboard and screen-reader users
 * keep their place. Escape is routed through onCancel rather than closing the
 * dialog silently.
 */
export function Confirmation({ open, title, children, onCancel, onConfirm }: {
  open: boolean; title: string; children: ReactNode; onCancel: () => void; onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      restoreTo.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      element.showModal();
      cancelButton.current?.focus();
    } else if (!open && element.open) {
      element.close();
      restoreTo.current?.focus();
      restoreTo.current = null;
    }
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      className="m-auto w-[calc(100%_-_2rem)] max-w-md rounded-lg border bg-background p-6 text-foreground shadow-xl backdrop:bg-black/40"
    >
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="my-4 break-words text-sm">{children}</div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button ref={cancelButton} type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={onConfirm}>
          Confirm
        </Button>
      </div>
    </dialog>
  );
}

export function PendingButton({ children, busy = "Saving…" }: { children: ReactNode; busy?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? busy : children}
    </Button>
  );
}
