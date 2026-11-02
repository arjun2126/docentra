"use client";

import { useActionState, useState } from "react";

import {
  saveDocument,
  type DocumentActionState,
} from "@/app/(docflow)/documents/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DocumentDto } from "@/lib/docflow/documents";

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
            quantity: String(Number(line.quantity)),
            price: Number(line.price).toFixed(2),
          }),
        )
      : [newRow(), newRow()],
  );

  const errors = state.fieldErrors ?? {};
  const errorList = Object.entries(errors).flatMap(([field, messages]) =>
    messages.map((message) => `${field}: ${message}`),
  );

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {document ? (
        <>
          <input type="hidden" name="shno" value={document.shno} />
          <input type="hidden" name="version" value={document.version} />
        </>
      ) : null}

      {state.message ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      {errorList.length ? (
        <ul role="alert" className="space-y-1 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorList.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="document-vendor">Vendor</Label>
          <select
            id="document-vendor"
            name="vendorId"
            defaultValue={document?.vendor.id ?? ""}
            required
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">Choose a vendor</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.code} — {vendor.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="document-date">Document date</Label>
          <Input
            id="document-date"
            name="documentDate"
            type="date"
            defaultValue={document?.documentDate ?? ""}
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="document-notes">Notes</Label>
        <Input id="document-notes" name="notes" defaultValue={document?.notes ?? ""} />
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Line items</legend>
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div
              key={row.key}
              className="grid gap-2 rounded-md border p-3 sm:grid-cols-[1fr_110px_130px_auto] sm:items-end"
            >
              <div className="space-y-1">
                <Label htmlFor={`item-${row.key}`}>Item {index + 1}</Label>
                <Input
                  id={`item-${row.key}`}
                  name="item"
                  defaultValue={row.item}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`quantity-${row.key}`}>Quantity</Label>
                <Input
                  id={`quantity-${row.key}`}
                  name="quantity"
                  inputMode="decimal"
                  defaultValue={row.quantity}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`price-${row.key}`}>Price</Label>
                <Input
                  id={`price-${row.key}`}
                  name="price"
                  inputMode="decimal"
                  defaultValue={row.price}
                  required
                />
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
        <Button type="button" variant="outline" onClick={() => setRows((c) => [...c, newRow()])}>
          Add line
        </Button>
        <p className="text-xs text-muted-foreground">
          Amounts and totals are calculated on the server; the browser never supplies them.
        </p>
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
