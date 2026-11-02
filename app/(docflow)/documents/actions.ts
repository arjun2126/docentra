"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createDocument,
  transitionDocument,
  updateDocument,
} from "@/lib/docflow/documents";
import {
  DomainError,
  ImmutableDocumentError,
  StaleDocumentError,
} from "@/lib/docflow/errors";
import { parseDocumentInput, type DocumentValues } from "@/lib/schemas/document";
import type { FieldErrors } from "@/lib/schemas/vendor";

export type DocumentActionState = {
  fieldErrors?: FieldErrors;
  message?: string;
};

function readLines(formData: FormData) {
  const items = formData.getAll("item").map((value) => String(value));
  const quantities = formData.getAll("quantity").map((value) => String(value));
  const prices = formData.getAll("price").map((value) => String(value));
  return items.map((item, index) => ({
    item,
    quantity: quantities[index] ?? "",
    price: prices[index] ?? "",
  }));
}

function readInput(formData: FormData): unknown {
  return {
    vendorId: String(formData.get("vendorId") ?? ""),
    documentDate: String(formData.get("documentDate") ?? ""),
    notes: String(formData.get("notes") ?? ""),
    lines: readLines(formData),
  };
}

function describe(error: unknown): DocumentActionState {
  if (error instanceof StaleDocumentError) {
    return { message: `${error.message} Your input was not saved.` };
  }
  if (error instanceof ImmutableDocumentError || error instanceof DomainError) {
    return { message: error.message };
  }
  return { message: "Could not save the document. Please try again." };
}

/** Save a new draft, or replace an existing draft's content. */
export async function saveDocument(
  _previous: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const parsed = parseDocumentInput(readInput(formData));
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };

  const shno = String(formData.get("shno") ?? "");
  const version = Number(formData.get("version") ?? "0");
  const values: DocumentValues = parsed.data;

  let saved;
  try {
    saved = shno
      ? await updateDocument(shno, version, values)
      : await createDocument(values);
  } catch (error) {
    return describe(error);
  }

  revalidatePath("/documents");
  revalidatePath("/");
  redirect(`/documents/${saved.shno}`);
}

export async function changeDocumentStatus(formData: FormData): Promise<void> {
  const shno = String(formData.get("shno") ?? "");
  const to = String(formData.get("to") ?? "");
  const version = Number(formData.get("version") ?? "0");

  try {
    await transitionDocument(shno, to, version);
  } catch (error) {
    const message =
      error instanceof DomainError ? error.message : "Could not update the document.";
    redirect(`/documents/${shno}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/documents");
  revalidatePath(`/documents/${shno}`);
  revalidatePath("/");
  redirect(`/documents/${shno}`);
}
