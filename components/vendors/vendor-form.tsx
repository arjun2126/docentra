"use client";

import { useActionState } from "react";

import {
  saveVendor,
  type VendorActionState,
} from "@/app/(docflow)/vendors/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { VendorDto } from "@/lib/docflow/vendors";

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p id={id} className="text-xs text-destructive">
      {messages.join(" ")}
    </p>
  );
}

export function VendorForm({ vendor }: { vendor?: VendorDto }) {
  const [state, formAction, pending] = useActionState<VendorActionState, FormData>(
    saveVendor,
    {},
  );
  const errors = state.fieldErrors ?? {};
  const describe = (field: string) =>
    errors[field]?.length ? `vendor-${field}-error` : undefined;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">
          {vendor ? `Edit ${vendor.name}` : "New vendor"}
        </h2>
        {vendor ? (
          <a href="/vendors" className="text-sm text-muted-foreground hover:underline">
            Cancel
          </a>
        ) : null}
      </div>

      {vendor ? <input type="hidden" name="id" value={vendor.id} /> : null}

      {state.message ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="vendor-code">Vendor code</Label>
        <Input
          id="vendor-code"
          name="code"
          defaultValue={vendor?.code ?? ""}
          required
          autoComplete="off"
          aria-invalid={Boolean(errors.code?.length)}
          aria-describedby={describe("code")}
        />
        <FieldError id="vendor-code-error" messages={errors.code} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="vendor-name">Name</Label>
        <Input
          id="vendor-name"
          name="name"
          defaultValue={vendor?.name ?? ""}
          required
          aria-invalid={Boolean(errors.name?.length)}
          aria-describedby={describe("name")}
        />
        <FieldError id="vendor-name-error" messages={errors.name} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="vendor-email">Email</Label>
          <Input
            id="vendor-email"
            name="email"
            type="email"
            defaultValue={vendor?.email ?? ""}
            aria-invalid={Boolean(errors.email?.length)}
            aria-describedby={describe("email")}
          />
          <FieldError id="vendor-email-error" messages={errors.email} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vendor-phone">Phone</Label>
          <Input
            id="vendor-phone"
            name="phone"
            defaultValue={vendor?.phone ?? ""}
            aria-invalid={Boolean(errors.phone?.length)}
            aria-describedby={describe("phone")}
          />
          <FieldError id="vendor-phone-error" messages={errors.phone} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="vendor-address">Address</Label>
        <Input
          id="vendor-address"
          name="address"
          defaultValue={vendor?.address ?? ""}
          aria-invalid={Boolean(errors.address?.length)}
          aria-describedby={describe("address")}
        />
        <FieldError id="vendor-address-error" messages={errors.address} />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="vendor-active"
          name="isActive"
          type="checkbox"
          defaultChecked={vendor?.isActive ?? true}
          className="h-4 w-4 rounded border-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        <Label htmlFor="vendor-active">Active</Label>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : vendor ? "Save changes" : "Create vendor"}
      </Button>
    </form>
  );
}
