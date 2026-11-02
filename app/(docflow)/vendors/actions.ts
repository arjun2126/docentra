"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { DuplicateVendorCodeError } from "@/lib/docflow/errors";
import { createVendor, setVendorActive, updateVendor } from "@/lib/docflow/vendors";
import { parseVendorInput, type FieldErrors } from "@/lib/schemas/vendor";

export type VendorActionState = {
  ok?: boolean;
  fieldErrors?: FieldErrors;
  message?: string;
};

function readForm(formData: FormData) {
  return {
    code: String(formData.get("code") ?? ""),
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    address: String(formData.get("address") ?? ""),
    isActive: formData.get("isActive") === "on",
  };
}

export async function saveVendor(
  _previous: VendorActionState,
  formData: FormData,
): Promise<VendorActionState> {
  const parsed = parseVendorInput(readForm(formData));
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

  const id = String(formData.get("id") ?? "");
  try {
    if (id) await updateVendor(id, parsed.data);
    else await createVendor(parsed.data);
  } catch (error) {
    if (error instanceof DuplicateVendorCodeError) {
      return { fieldErrors: { code: [error.message] } };
    }
    // Never surface a database error: it leaks schema detail to the browser.
    return { message: "Could not save the vendor. Please try again." };
  }

  revalidatePath("/vendors");
  redirect("/vendors?saved=1");
}

export async function toggleVendorActive(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const next = formData.get("active") === "true";
  try {
    await setVendorActive(id, next);
  } catch {
    redirect("/vendors?error=toggle");
  }
  revalidatePath("/vendors");
  redirect("/vendors");
}
