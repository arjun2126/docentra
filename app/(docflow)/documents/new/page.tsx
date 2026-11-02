import { DocumentForm } from "@/components/documents/document-form";
import { Card, CardContent } from "@/components/ui/card";
import { listVendors } from "@/lib/docflow/vendors";

export const dynamic = "force-dynamic";

export default async function NewDocumentPage() {
  const vendors = await listVendors();
  const options = vendors.map((vendor) => ({
    id: vendor.id,
    name: vendor.name,
    code: vendor.code,
  }));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">New document</h1>
        <p className="text-sm text-muted-foreground">
          One vendor per document. Line amounts and totals are computed on the server.
        </p>
      </header>

      <Card>
        <CardContent className="pt-6">
          {options.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Create a vendor before adding documents.
            </p>
          ) : (
            <DocumentForm vendors={options} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
