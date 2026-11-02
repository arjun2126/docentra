import Link from "next/link";
import { notFound } from "next/navigation";

import { changeDocumentStatus } from "@/app/(docflow)/documents/actions";
import { DownloadPdf } from "@/components/documents/download-pdf";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDocument } from "@/lib/docflow/documents";
import { allowedTransitions } from "@/lib/docflow/workflow";

export const dynamic = "force-dynamic";

const LABELS: Record<string, string> = {
  submitted: "Submit for approval",
  approved: "Approve",
  rejected: "Reject",
  draft: "Reopen as draft",
};

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ shno: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { shno } = await params;
  const { error } = await searchParams;
  const document = await getDocument(shno);
  if (!document) notFound();

  const transitions = allowedTransitions(document.status);
  const editable = document.status === "draft";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="font-mono text-xs text-muted-foreground">{document.documentNumber}</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {document.vendor.name}
          </h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <StatusBadge status={document.status} />
            <span>{document.documentDate}</span>
            <span>version {document.version}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DownloadPdf shno={document.shno} documentNumber={document.documentNumber} />
          {editable ? (
            <Link href={`/documents/${document.shno}/edit`}>
              <Button variant="outline">Edit draft</Button>
            </Link>
          ) : null}
          {transitions.map((to) => (
            <form key={to} action={changeDocumentStatus}>
              <input type="hidden" name="shno" value={document.shno} />
              <input type="hidden" name="to" value={to} />
              <input type="hidden" name="version" value={document.version} />
              <Button type="submit" variant={to === "rejected" ? "destructive" : "default"}>
                {LABELS[to] ?? to}
              </Button>
            </form>
          ))}
        </div>
      </header>

      {error ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {document.status !== "draft" ? (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          {document.status === "approved"
            ? "This document is approved and can no longer be edited."
            : "Only drafts can be edited. Reopen the document as a draft to make changes."}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Line items</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Line items</caption>
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-medium">#</th>
                <th scope="col" className="py-2 pr-3 font-medium">Item</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Quantity</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Price</th>
                <th scope="col" className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {document.lines.map((line) => (
                <tr key={line.lineNo}>
                  <td className="py-2 pr-3 tabular-nums">{line.lineNo}</td>
                  <td className="py-2 pr-3">{line.item}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{line.quantity}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{line.price}</td>
                  <td className="py-2 text-right tabular-nums">{line.amount}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-semibold">
                <td colSpan={4} className="py-2 pr-3 text-right">
                  Total
                </td>
                <td className="py-2 text-right tabular-nums">{document.totalAmount}</td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      {document.notes ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm">{document.notes}</CardContent>
        </Card>
      ) : null}
    </div>
  );
}
