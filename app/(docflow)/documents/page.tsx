import Link from "next/link";

import { StatusBadge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { searchDocuments } from "@/lib/docflow/search";
import { listVendors } from "@/lib/docflow/vendors";
import { parseSearchParams, searchQueryString } from "@/lib/schemas/search";

export const dynamic = "force-dynamic";

const STATUSES = ["draft", "submitted", "approved", "rejected"] as const;

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const parsed = parseSearchParams(raw);

  // Invalid filters fall back to defaults but are reported, never silent.
  const fallback = parseSearchParams({});
  if (!fallback.ok) throw new Error("search defaults are invalid");
  const active = parsed.ok ? parsed.data : fallback.data;

  const [result, vendors] = await Promise.all([
    searchDocuments(active),
    listVendors({ includeInactive: true }),
  ]);

  const hasFilters = Boolean(
    active.q || active.status || active.vendorId || active.from || active.to,
  );
  const pageHref = (page: number) =>
    `/documents${searchQueryString({ ...active, page })}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
          <p className="text-sm text-muted-foreground">
            Draft, submit and approve vendor purchase documents.
          </p>
        </div>
        <Link href="/documents/new" className={buttonVariants()}>New document</Link>
      </header>

      {!parsed.ok ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Some filters were ignored:{" "}
          {Object.values(parsed.fieldErrors).flat().join(" ")}
        </p>
      ) : null}

      <Card>
        <CardContent className="pt-6">
          <form method="get" action="/documents" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <div className="space-y-1 xl:col-span-2">
              <Label htmlFor="filter-q">Search</Label>
              <input
                id="filter-q"
                name="q"
                defaultValue={active.q ?? ""}
                placeholder="Number, vendor or item"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filter-status">Status</Label>
              <select
                id="filter-status"
                name="status"
                defaultValue={active.status ?? ""}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Any</option>
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="filter-vendor">Vendor</Label>
              <select
                id="filter-vendor"
                name="vendorId"
                defaultValue={active.vendorId ?? ""}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Any</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="filter-from">From</Label>
              <input
                id="filter-from"
                name="from"
                type="date"
                defaultValue={active.from ?? ""}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filter-to">To</Label>
              <input
                id="filter-to"
                name="to"
                type="date"
                defaultValue={active.to ?? ""}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="flex flex-wrap items-end gap-2 sm:col-span-2 xl:col-span-6">
              <input type="hidden" name="pageSize" value={active.pageSize} />
              <Button type="submit">Apply filters</Button>
              {hasFilters ? (
                <Link href="/documents" className="text-sm text-muted-foreground hover:underline">
                  Clear
                </Link>
              ) : null}
              <span className="ml-auto text-sm text-muted-foreground">
                {result.total} match{result.total === 1 ? "" : "es"}
              </span>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="table-scroll pt-6" tabIndex={0} role="region" aria-label="Documents table">
          {result.items.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              {hasFilters
                ? "No documents match these filters."
                : "No documents yet. Create the first draft."}
            </p>
          ) : (
            <table className="data-table min-w-[720px]">
              <caption className="sr-only">Documents matching the current filters</caption>
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
                {result.items.map((doc) => (
                  <tr key={doc.shno}>
                    <td className="whitespace-nowrap font-mono text-xs">
                      <Link href={`/documents/${doc.shno}`} className="hover:underline">
                        {doc.documentNumber}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap">{doc.documentDate}</td>
                    <td className="min-w-48 max-w-80 break-words">{doc.vendor.name}</td>
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

      {result.pageCount > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-between gap-3">
          {result.page > 1 ? (
            <Link href={pageHref(result.page - 1)} className="text-sm text-brand hover:underline">
              Previous
            </Link>
          ) : (
            <span aria-disabled="true" className="text-sm text-muted-foreground">
              Previous
            </span>
          )}
          <span className="text-sm text-muted-foreground">
            Page {result.page} of {result.pageCount}
          </span>
          {result.page < result.pageCount ? (
            <Link href={pageHref(result.page + 1)} className="text-sm text-brand hover:underline">
              Next
            </Link>
          ) : (
            <span aria-disabled="true" className="text-sm text-muted-foreground">
              Next
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
