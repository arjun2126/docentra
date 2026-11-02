import { IllegalTransitionError } from "./errors";

export const DOCUMENT_STATUSES = ["draft", "submitted", "approved", "rejected"] as const;
export type WorkflowStatus = (typeof DOCUMENT_STATUSES)[number];

/**
 * The one place transitions live. Anything absent here is illegal, so a new
 * screen cannot invent a shortcut to approved.
 */
export const TRANSITIONS: Record<WorkflowStatus, readonly WorkflowStatus[]> = {
  draft: ["submitted"],
  submitted: ["approved", "rejected"],
  rejected: ["draft"],
  approved: [],
};

/** Only drafts are editable: a rejected document is reopened before editing. */
export const EDITABLE_STATUSES: readonly WorkflowStatus[] = ["draft"];

export function canTransition(from: string, to: string): boolean {
  const allowed = TRANSITIONS[from as WorkflowStatus];
  return Boolean(allowed?.includes(to as WorkflowStatus));
}

export function assertTransition(from: string, to: string): void {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
}

export function isEditable(status: string): boolean {
  return EDITABLE_STATUSES.includes(status as WorkflowStatus);
}

export function allowedTransitions(status: string): readonly WorkflowStatus[] {
  return TRANSITIONS[status as WorkflowStatus] ?? [];
}
