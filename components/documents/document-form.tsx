"use client";

import { useActionState, useRef, useState } from "react";

import {
  saveDocument,
  type DocumentActionState,
} from "@/app/(docflow)/documents/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DocumentDto } from "@/lib/docflow/documents";
import { FieldError, useErrorFocus } from "@/components/ui/form-feedback";

type Row = { key: number; item: string; quantity: string; price: string };

let nextKey = 1;
const newRow = (row?: Partial<Row>): Row => ({
  key: nextKey++,
  item: row?.item ?? "",
  quantity: row?.quantity ?? "",
  price: row?.price ?? "",
});

export function DocumentForm({
  vendors,
  document,
}: {
  vendors: Array<{ id: string; name: string; code: string }>;
  document?: DocumentDto;
}) {
  const [state, formAction, pending] = useActionState<DocumentActionState, FormData>(
    saveDocument,
    {},
  );
  const [rows, setRows] = useState<Row[]>(
    document?.lines.length
      ? document.lines.map((line) =>
          newRow({
            item: line.item,
            quantity: line.quantity,
            price: line.price,
          }),
        )
      : [newRow(), newRow()],
  );

  const form = useRef<HTMLFormElement>(null);
  useErrorFocus(form, state);
  const [query, setQuery] = useState("");
  const [vendorId, setVendorId] = useState(document?.vendor.id ?? "");
  const errors = state.fieldErrors ?? {};
  const matches = vendors.filter((v) => `${v.code} ${v.name}`.toLowerCase().includes(query.trim().toLowerCase()));
  const visibleVendors = vendors.filter((v) => v.id === vendorId || matches.includes(v));
  const errorProps = (field: string, id: string) => ({
    "aria-invalid": Boolean(errors[field]?.length),
    "aria-describedby": errors[field]?.length ? `${id}-error` : undefined,
  });

  return (
    <form ref={form} action={formAction} className="min-w-0 space-y-6" noValidate aria-busy={pending}>
      {document ? (
        <>
          <input type="hidden" name="shno" value={document.shno} />
          <input type="hidden" name="version" value={document.version} />
        </>
      ) : null}

      {state.message ? (
        <p role="alert" tabIndex={-1} className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      {Object.keys(errors).length ? <p role="alert" tabIndex={-1} className="text-sm text-destructive">Could not save. Check the marked fields below.</p> : null}
      <p className="text-sm text-muted-foreground">Vendor, document date and each line’s item, quantity and price are required. Save creates an editable draft, not a submission.</p>
      <fieldset disabled={pending} className="min-w-0 space-y-6">

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="vendor-filter">Filter vendor choices</Label>
          <Input
            id="vendor-filter"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-describedby="vendor-filter-hint"
            aria-controls="document-vendor"
          />
          <p id="vendor-filter-hint" className="text-xs text-muted-foreground">Search code or name, then choose below. Your selected vendor stays available.</p>
          <p role="status" className="text-xs text-muted-foreground">{matches.length} matching vendors{matches.length === 0 ? ". Clear the filter to see all choices." : "."}</p>
          <Label htmlFor="document-vendor">Vendor</Label>
          <select
            id="document-vendor"
            name="vendorId"
            value={vendorId}
            onChange={(event) => setVendorId(event.target.value)}
            {...errorProps("vendorId", "document-vendor")}
            required
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">Choose a vendor</option>
            {visibleVendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.code} — {vendor.name}
              </option>
            ))}
          </select>
          <FieldError id="document-vendor-error" messages={errors.vendorId} />
          {!vendors.length ? <p className="text-sm">No active vendors. <a href="/vendors" className="underline">Create or reactivate a vendor</a> before saving.</p> : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="document-date">Document date</Label>
          <Input
            id="document-date"
            name="documentDate"
            type="date"
            defaultValue={document?.documentDate ?? ""}
            required
            {...errorProps("documentDate", "document-date")}
          />
          <FieldError id="document-date-error" messages={errors.documentDate} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="document-notes">Notes (optional, up to 500 characters)</Label>
        <Input id="document-notes" name="notes" defaultValue={document?.notes ?? ""} {...errorProps("notes", "document-notes")} />
        <FieldError id="document-notes-error" messages={errors.notes} />
      </div>

      <fieldset className="min-w-0 space-y-3">
        <legend className="text-sm font-semibold">Line items</legend>
        <p className="text-xs text-muted-foreground">Quantity must be greater than zero (up to 4 decimals). Price may be zero (up to 2 decimals). Use a decimal point, without separators.</p>
        <FieldError id="lines-error" messages={errors.lines} />
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div
              key={row.key}
              className="grid min-w-0 gap-3 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_110px_130px_auto] md:items-start"
            >
              <div className="space-y-1">
                <Label htmlFor={`item-${row.key}`}>Item {index + 1}</Label>
                <Input
                  id={`item-${row.key}`}
                  name="item"
                  defaultValue={row.item}
                   required
                  {...errorProps(`lines.${index}.item`, `item-${row.key}`)}
                 />
                <FieldError id={`item-${row.key}-error`} messages={errors[`lines.${index}.item`]} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`quantity-${row.key}`}>Quantity</Label>
                <Input
                  id={`quantity-${row.key}`}
                  name="quantity"
                  inputMode="decimal"
                  defaultValue={row.quantity}
                   required
                  {...errorProps(`lines.${index}.quantity`, `quantity-${row.key}`)}
                 />
                <FieldError id={`quantity-${row.key}-error`} messages={errors[`lines.${index}.quantity`]} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`price-${row.key}`}>Price</Label>
                <Input
                  id={`price-${row.key}`}
                  name="price"
                  inputMode="decimal"
                  defaultValue={row.price}
                   required
                  {...errorProps(`lines.${index}.price`, `price-${row.key}`)}
                 />
                <FieldError id={`price-${row.key}-error`} messages={errors[`lines.${index}.price`]} />
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                disabled={rows.length === 1}
                aria-label={`Remove line ${index + 1}`}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" disabled={rows.length >= 100} onClick={() => setRows((c) => [...c, newRow()])}>
          Add line
        </Button>
        <p className="text-xs text-muted-foreground">
          Amounts and totals are calculated on the server; the browser never supplies them.
        </p>
      </fieldset>
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : document ? "Save draft" : "Create draft"}
        </Button>
        <a
          href={document ? `/documents/${document.shno}` : "/documents"}
          className="text-sm text-muted-foreground hover:underline"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
