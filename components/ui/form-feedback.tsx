"use client";

import { useEffect, type RefObject } from "react";
import type { FieldErrors } from "@/lib/schemas/vendor";

/**
 * After a server action returns validation errors, move focus to the first
 * marked field. For form-level failures, focus the alert itself so assistive
 * technology announces the message instead of leaving focus on a stale control.
 */
export function useErrorFocus(
  form: RefObject<HTMLFormElement | null>,
  state: { fieldErrors?: FieldErrors; message?: string },
) {
  useEffect(() => {
    if (state.fieldErrors && Object.keys(state.fieldErrors).length) {
      form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    } else if (state.message) {
      form.current?.querySelector<HTMLElement>('[role="alert"][tabindex="-1"]')?.focus();
    }
  }, [form, state]);
}

export function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  return messages?.length ? (
    <p id={id} className="text-xs text-destructive">
      {messages.join(" ")}
    </p>
  ) : null;
}
