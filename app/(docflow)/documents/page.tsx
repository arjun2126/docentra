import Link from "next/link";

import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listDocuments } from "@/lib/docflow/documents";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const documents = await listDocuments(50);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground">
            Draft, submit and approve vendor purchase documents.
          </p>
        </div>
        <Link href="/documents/new">
          <Button>New document</Button>
        </Link>
      </header>

      <Card>
        <CardContent className="overflow-x-auto pt-6">
          {documents.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              No documents yet. Create the first draft.
            </p>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">Documents</caption>
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-medium">Number</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Date</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Vendor</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Status</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Lines</th>
                  <th scope="col" className="py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {documents.map((doc) => (
                  <tr key={doc.shno}>
                    <td className="py-2 pr-3 font-mono text-xs">
                      <Link href={`/documents/${doc.shno}`} className="hover:underline">
                        {doc.documentNumber}
                      </Link>
                    </td>
                    <td className="py-2 pr-3">{doc.documentDate}</td>
                    <td className="py-2 pr-3">{doc.vendor.name}</td>
                    <td className="py-2 pr-3">
                      <StatusBadge status={doc.status} />
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{doc.lineCount}</td>
                    <td className="py-2 text-right tabular-nums">{doc.totalAmount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
