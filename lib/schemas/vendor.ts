import { z } from "zod";

/**
 * Vendor input validation. Codes are normalised to upper case so a user typing
 * "acme" and "ACME" cannot create two vendors, and unknown fields are rejected
 * so a stray form field can never silently widen the insert.
 */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters`)
    .optional()
    .transform((value) => (value === undefined || value === "" ? undefined : value));

export const vendorCodeSchema = z
  .string({ required_error: "Vendor code is required" })
  .trim()
  .min(2, "Vendor code must be at least 2 characters")
  .max(24, "Vendor code must be at most 24 characters")
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9-]*$/,
    "Use letters, digits and hyphens only, starting with a letter or digit",
  )
  .transform((value) => value.toUpperCase());

export const vendorInputSchema = z
  .object({
    code: vendorCodeSchema,
    name: z
      .string({ required_error: "Name is required" })
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(120, "Name must be at most 120 characters"),
    email: z
      .union([z.literal(""), z.string().trim().email("Enter a valid email address")])
      .optional()
      .transform((value) => (value === undefined || value === "" ? undefined : value)),
    phone: optionalText(40, "Phone"),
    address: optionalText(240, "Address"),
    isActive: z.boolean().default(true),
  })
  .strict();

export type VendorInput = z.input<typeof vendorInputSchema>;
export type VendorValues = z.output<typeof vendorInputSchema>;

export type FieldErrors = Record<string, string[]>;

/** Parse and flatten issues into per-field messages for form rendering. */
export function parseVendorInput(
  raw: unknown,
): { ok: true; data: VendorValues } | { ok: false; fieldErrors: FieldErrors } {
  const result = vendorInputSchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };

  const fieldErrors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0]?.toString() ?? "form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { ok: false, fieldErrors };
}
