import { notFound, redirect } from "next/navigation";

import { DocumentForm } from "@/components/documents/document-form";
import { Card, CardContent } from "@/components/ui/card";
import { getDocument } from "@/lib/docflow/documents";
import { listVendors } from "@/lib/docflow/vendors";
import { isEditable } from "@/lib/docflow/workflow";

export const dynamic = "force-dynamic";

export default async function EditDocumentPage({
  params,
}: {
  params: Promise<{ shno: string }>;
}) {
  const { shno } = await params;
  const document = await getDocument(shno);
  if (!document) notFound();
  if (!isEditable(document.status)) redirect(`/documents/${document.shno}`);

  const vendors = await listVendors({ includeInactive: true });
  const options = vendors.map((vendor) => ({
    id: vendor.id,
    name: vendor.name,
    code: vendor.code,
  }));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="font-mono text-xs text-muted-foreground">{document.documentNumber}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Edit draft</h1>
        <p className="text-sm text-muted-foreground">
          Saving replaces the line items and recalculates totals on the server.
        </p>
      </header>

      <Card>
        <CardContent className="pt-6">
          <DocumentForm vendors={options} document={document} />
        </CardContent>
      </Card>
    </div>
  );
}
