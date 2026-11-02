import Link from "next/link";

import { StatusBadge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tracking-tight">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const data = await getDashboard();
  const maxCount = Math.max(1, ...data.byStatus.map((row) => row.count));

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Live totals from the DocFlow database.
        </p>
      </header>

      <section
        aria-label="Summary"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <Stat label="Documents" value={String(data.totalDocuments)} />
        <Stat
          label="Vendors"
          value={String(data.vendorCount)}
          hint={`${data.activeVendorCount} active`}
        />
        <Stat
          label="Awaiting approval"
          value={data.awaitingApprovalValue}
          hint="Submitted, unformatted amount"
        />
        <Stat
          label="Approved value"
          value={data.approvedValue}
          hint="Unformatted amount"
        />
      </section>

      <section aria-labelledby="status-heading" className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle id="status-heading" className="text-base">
              Documents by status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.byStatus.map((row) => (
              <div key={row.status} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <StatusBadge status={row.status} />
                  <span className="font-medium">{row.count}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{ width: `${Math.round((row.count / maxCount) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent documents</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No documents yet. Run <code>npm run db:seed</code> for sample data.
              </p>
            ) : (
              <ul className="divide-y">
                {data.recent.map((doc) => (
                  <li
                    key={doc.shno}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/documents/${doc.shno}`}
                        className="block truncate text-sm font-medium hover:underline"
                      >
                        {doc.documentNumber}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">
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
    </div>
  );
}
