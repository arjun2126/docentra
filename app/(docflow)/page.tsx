import Link from "next/link";

import { StatusBadge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getDashboard } from "@/lib/docflow/dashboard";

export const dynamic = "force-dynamic";

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="min-w-0 border-t-2 border-t-brand/30" role="group" aria-label={label}>
      <div className="space-y-3 p-5">
        <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
        <p className="break-all text-2xl font-semibold tracking-tight tabular-nums" data-kpi-value>{value}</p>
        {hint ? <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
      </div>
    </Card>
  );
}

export default async function DashboardPage() {
  const data = await getDashboard();
  const statusColors = { draft: "bg-slate-500", submitted: "bg-blue-600", approved: "bg-emerald-600", rejected: "bg-red-600" };

  return (
    <div className="space-y-8">
      <header className="page-header">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand">DocFlow overview</p>
          <h1>Dashboard</h1>
          <p className="text-sm text-muted-foreground">Your documents, activity and approvals at a glance.</p>
        </div>
        <Link href="/documents/new" className={buttonVariants()}>New document</Link>
      </header>

      <section
        aria-label="Summary"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
      >
        <Stat label="Documents" value={String(data.totalDocuments)} hint="Across all statuses" />
        <Stat
          label="Vendors"
          value={String(data.vendorCount)}
          hint={`${data.activeVendorCount} active`}
        />
        <Stat
          label="Awaiting approval"
          value={data.awaitingApprovalValue}
          hint="Total amount · submitted"
        />
        <Stat
          label="Approved value"
          value={data.approvedValue}
          hint="Total amount · approved"
        />
        <Stat
          label="Approved this month"
          value={data.approvedThisMonth}
          hint={`${data.approvedThisMonthCount} document(s) · by document date`}
        />
      </section>

      <section aria-label="Document activity" className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card>
          <CardHeader>
            <h2 id="status-heading" className="text-base font-semibold">
              Documents by status
            </h2>
            <p className="text-sm text-muted-foreground">{data.totalDocuments} documents · share of total</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div aria-hidden="true" className="flex h-4 overflow-hidden rounded-full bg-muted" data-status-chart>
              {data.byStatus.map((row) => <span key={row.status} data-status={row.status} className={statusColors[row.status]} style={{ width: `${data.totalDocuments ? row.count / data.totalDocuments * 100 : 0}%` }} />)}
            </div>
            {data.totalDocuments === 0 ? <p className="text-sm text-muted-foreground">No documents yet. Status shares appear when you create a document.</p> : null}
            <ul aria-label="Status legend" className="divide-y">
              {data.byStatus.map((row) => (
                <li key={row.status} className="flex items-center justify-between gap-3 py-3 text-sm" data-status-row={row.status}>
                  <span className="flex items-center gap-2 capitalize"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${statusColors[row.status]}`} />{row.status}</span>
                  <span className="text-right tabular-nums"><strong className="font-semibold">{row.count}</strong><span className="ml-3 text-muted-foreground">{data.totalDocuments ? Math.round(row.count / data.totalDocuments * 100) : 0}%</span></span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold">Recent documents</h2>
            <Link href="/documents" className="w-fit text-sm font-medium text-brand hover:underline">View all documents →</Link>
          </CardHeader>
          <CardContent>
            {data.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No documents yet. Create your first draft to get started.
              </p>
            ) : (
              <ul className="divide-y">
                {data.recent.map((doc) => (
                  <li
                    key={doc.shno}
                    className="flex flex-wrap items-center justify-between gap-3 py-4"
                  >
                    <div className="min-w-0 flex-1 basis-48">
                      <Link
                        href={`/documents/${doc.shno}`}
                        className="block text-sm font-semibold text-brand hover:underline"
                      >
                        {doc.documentNumber}
                      </Link>
                      <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">
                        {doc.vendorName} · {doc.documentDate}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm tabular-nums">{doc.totalAmount}</span>
                      <StatusBadge status={doc.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="top-vendors-heading">
        <Card>
          <CardHeader>
            <h2 id="top-vendors-heading" className="text-base font-semibold">
              Top vendors by document count
            </h2>
          </CardHeader>
          <CardContent className="table-scroll" tabIndex={0} role="region" aria-label="Top vendors table">
            {data.topVendors.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No vendors with documents yet.
              </p>
            ) : (
              <table className="data-table min-w-[480px]">
                <caption className="sr-only">Top vendors by document count</caption>
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-medium">Vendor</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Documents</th>
                    <th scope="col" className="py-2 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.topVendors.map((vendor) => (
                    <tr key={vendor.vendorId}>
                      <td className="py-2 pr-3">
                        <span className="font-medium">{vendor.name}</span>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {vendor.code}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{vendor.count}</td>
                      <td className="py-2 text-right tabular-nums">{vendor.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
