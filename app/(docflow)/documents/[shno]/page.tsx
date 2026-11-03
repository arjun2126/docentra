import Link from "next/link";
import { notFound } from "next/navigation";

import { changeDocumentStatus } from "@/app/(docflow)/documents/actions";
import { DownloadPdf } from "@/components/documents/download-pdf";
import { StatusBadge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmedAction } from "@/components/ui/confirmed-action";
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
const SUMMARIES: Record<string, string> = {
  submitted: "Submit this draft for approval? It will no longer be editable. A submitted document must be rejected before it can be reopened as a draft.",
  approved: "Approve this document? Approval is final: it cannot be edited, rejected or reopened afterward.",
  rejected: "Reject this submitted document? It can then be reopened as a draft for revision; this does not delete it.",
  draft: "Reopen this rejected document as an editable draft? It will need to be submitted again for approval.",
};

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ shno: string }>;
  searchParams: Promise<{ error?: string; saved?: string; changed?: string }>;
}) {
  const { shno } = await params;
  const { error, saved, changed } = await searchParams;
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
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <StatusBadge status={document.status} />
            <span>{document.documentDate}</span>
            <span>version {document.version}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DownloadPdf shno={document.shno} documentNumber={document.documentNumber} />
          {editable ? (
            <Link href={`/documents/${document.shno}/edit`} className={buttonVariants({ variant: "outline" })}>Edit draft</Link>
          ) : null}
          {transitions.map((to) => (
            <ConfirmedAction key={to} action={changeDocumentStatus} fields={{ shno: document.shno, to, version: String(document.version) }} label={LABELS[to] ?? to} summary={`${document.documentNumber} · ${document.vendor.name} · ${document.lineCount} line(s) · Total ${document.totalAmount}. ${SUMMARIES[to]}`} />
          ))}
        </div>
      </header>
      {saved || changed === document.status ? <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{saved ? "Draft saved." : `Document is now ${document.status}.`}</p> : null}

      {error ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {document.status !== "draft" ? (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-foreground">
          {document.status === "approved"
            ? "This document is approved and can no longer be edited."
            : document.status === "submitted"
              ? "This document is awaiting approval and cannot be edited or reopened directly. Reject it before reopening as a draft for changes."
              : "This document was rejected. Reopen as a draft to make changes, then submit it again."}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Line items</CardTitle>
        </CardHeader>
        <CardContent className="table-scroll" tabIndex={0} role="region" aria-label="Line items table">
          <table className="data-table min-w-[600px]">
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
                  <td className="min-w-56 max-w-xl break-words">{line.item}</td>
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
          <CardContent className="whitespace-pre-wrap break-words text-sm leading-relaxed">{document.notes}</CardContent>
        </Card>
      ) : null}
    </div>
  );
}
