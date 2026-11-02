import { z } from "zod";

import type { FieldErrors } from "./vendor";

const decimal = (integerDigits: number, scale: number, label: string, positive: boolean) =>
  z
    .string({ required_error: `${label} is required` })
    .trim()
    .regex(
      new RegExp(`^\\d{1,${integerDigits}}(\\.\\d{1,${scale}})?$`),
      `${label} must be a number with at most ${integerDigits} digits and ${scale} decimals`,
    )
    .refine((value) => !positive || Number(value) > 0, `${label} must be greater than zero`);

export const lineInputSchema = z
  .object({
    item: z
      .string({ required_error: "Item is required" })
      .trim()
      .min(1, "Item is required")
      .max(200, "Item must be at most 200 characters"),
    quantity: decimal(10, 4, "Quantity", true),
    price: decimal(12, 2, "Price", false),
  })
  .strict();

export const documentInputSchema = z
  .object({
    vendorId: z.string().regex(/^\d+$/, "Choose a vendor"),
    documentDate: z
      .string({ required_error: "Document date is required" })
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date")
      .refine((value) => {
        const date = new Date(`${value}T00:00:00.000Z`);
        return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
      }, "Use a valid date"),
    notes: z
      .string()
      .trim()
      .max(500, "Notes must be at most 500 characters")
      .optional()
      .transform((value) => (value === undefined || value === "" ? undefined : value)),
    lines: z
      .array(lineInputSchema)
      .min(1, "Add at least one line item")
      .max(100, "A document can have at most 100 line items"),
  })
  .strict();

export type LineInput = z.infer<typeof lineInputSchema>;
export type DocumentInput = z.input<typeof documentInputSchema>;
export type DocumentValues = z.output<typeof documentInputSchema>;

export function parseDocumentInput(
  raw: unknown,
): { ok: true; data: DocumentValues } | { ok: false; fieldErrors: FieldErrors } {
  const result = documentInputSchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };

  const fieldErrors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const path = issue.path.map(String).join(".") || "form";
    (fieldErrors[path] ??= []).push(issue.message);
  }
  return { ok: false, fieldErrors };
}

/** Status changes carry the version the user was looking at. */
export const transitionSchema = z
  .object({
    shno: z.string().regex(/^\d+$/, "Unknown document"),
    to: z.enum(["draft", "submitted", "approved", "rejected"]),
    version: z.coerce.number().int().nonnegative(),
  })
  .strict();
