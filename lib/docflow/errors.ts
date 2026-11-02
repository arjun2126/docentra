/**
 * Typed domain errors. Callers map these to responses deliberately; a raw
 * Prisma or PostgreSQL error must never reach a user.
 */
export class DomainError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class DuplicateVendorCodeError extends DomainError {
  constructor(code: string) {
    super(`Vendor code ${code} is already in use.`, "duplicate_vendor_code");
  }
}

export class VendorNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Vendor ${id} does not exist.`, "vendor_not_found");
  }
}

export class DocumentNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Document ${id} does not exist.`, "document_not_found");
  }
}

export class ValidationError extends DomainError {
  readonly fieldErrors: Record<string, string[]>;

  constructor(fieldErrors: Record<string, string[]>) {
    super("Some fields need attention.", "validation_failed");
    this.fieldErrors = fieldErrors;
  }
}

export class IllegalTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super(`A ${from} document cannot become ${to}.`, "illegal_transition");
  }
}

export class ImmutableDocumentError extends DomainError {
  constructor(status: string) {
    super(`A ${status} document cannot be edited.`, "document_immutable");
  }
}

export class StaleDocumentError extends DomainError {
  constructor(expected: number, actual: number) {
    super(
      `This document changed while you were editing it (expected version ${expected}, found ${actual}). Reload and try again.`,
      "stale_document",
    );
  }
}

export class EmptyDocumentError extends DomainError {
  constructor() {
    super("A document needs at least one line item.", "document_empty");
  }
}
