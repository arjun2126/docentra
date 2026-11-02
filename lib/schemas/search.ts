import { z } from "zod";

import type { FieldErrors } from "./vendor";

export const PAGE_SIZES = [10, 25, 50] as const;

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, "Use a valid date");

export const searchParamsSchema = z
  .object({
    q: z.preprocess(
      emptyToUndefined,
      z.string().trim().max(120, "Search text must be at most 120 characters").optional(),
    ),
    status: z.preprocess(
      emptyToUndefined,
      z.enum(["draft", "submitted", "approved", "rejected"]).optional(),
    ),
    vendorId: z.preprocess(emptyToUndefined, z.string().regex(/^\d+$/, "Unknown vendor").optional()),
    from: z.preprocess(emptyToUndefined, isoDate.optional()),
    to: z.preprocess(emptyToUndefined, isoDate.optional()),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce
      .number()
      .int()
      .refine((size) => (PAGE_SIZES as readonly number[]).includes(size), "Unsupported page size")
      .default(25),
  })
  .strict()
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "The start date must not be after the end date",
    path: ["to"],
  });

export type SearchParams = z.output<typeof searchParamsSchema>;

export function parseSearchParams(
  raw: Record<string, string | string[] | undefined>,
): { ok: true; data: SearchParams } | { ok: false; fieldErrors: FieldErrors } {
  const flat: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    flat[key] = Array.isArray(value) ? value[0] : value;
  }

  const result = searchParamsSchema.safeParse(flat);
  if (result.success) return { ok: true, data: result.data };

  const fieldErrors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0]?.toString() ?? "form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { ok: false, fieldErrors };
}

/** Build a query string, omitting defaults so URLs stay readable. */
export function searchQueryString(params: SearchParams): string {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.status) query.set("status", params.status);
  if (params.vendorId) query.set("vendorId", params.vendorId);
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  if (params.page > 1) query.set("page", String(params.page));
  if (params.pageSize !== 25) query.set("pageSize", String(params.pageSize));
  const text = query.toString();
  return text ? `?${text}` : "";
}
