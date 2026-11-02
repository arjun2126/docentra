import Link from "next/link";

import { toggleVendorActive } from "@/app/(docflow)/vendors/actions";
import { VendorForm } from "@/components/vendors/vendor-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getVendor, listVendors } from "@/lib/docflow/vendors";

export const dynamic = "force-dynamic";

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; edit?: string; saved?: string }>;
}) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const [vendors, editing] = await Promise.all([
    listVendors({ query, includeInactive: true }),
    params.edit ? getVendor(params.edit) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Vendors</h1>
          <p className="text-sm text-muted-foreground">
            Suppliers referenced by DocFlow documents. Deactivating keeps history intact.
          </p>
        </div>
        <form className="flex w-full items-center gap-2 sm:w-auto" action="/vendors" method="get">
          <label htmlFor="vendor-search" className="sr-only">
            Search vendors
          </label>
          <Input
            id="vendor-search"
            name="q"
            defaultValue={query}
            placeholder="Search code or name"
            className="min-w-0 flex-1 sm:w-56"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
      </header>

      {params.saved ? (
        <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Vendor saved.
        </p>
      ) : null}

      <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">
              {query ? `Results for “${query}”` : "All vendors"}
            </CardTitle>
          </CardHeader>
          <CardContent className="table-scroll" tabIndex={0} role="region" aria-label="Vendors table">
            {vendors.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">
                {query
                  ? "No vendors match that search."
                  : "No vendors yet. Use the vendor form to create the first one."}
              </p>
            ) : (
              <table className="data-table min-w-[660px]">
                <caption className="sr-only">Vendors</caption>
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-medium">Code</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Name</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Documents</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Status</th>
                    <th scope="col" className="py-2 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {vendors.map((vendor) => (
                    <tr key={vendor.id}>
                      <td className="py-2 pr-3 font-mono text-xs">{vendor.code}</td>
                      <td className="min-w-48 max-w-80 break-words">
                        <span className="font-medium">{vendor.name}</span>
                        {vendor.email ? (
                          <span className="block text-xs text-muted-foreground">
                            {vendor.email}
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{vendor.documentCount}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={
                            vendor.isActive
                              ? "text-emerald-700"
                              : "text-muted-foreground"
                          }
                        >
                          {vendor.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="py-2">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/vendors?edit=${vendor.id}`}
                            className="text-sm text-brand hover:underline"
                          >
                            Edit
                          </Link>
                          <form action={toggleVendorActive}>
                            <input type="hidden" name="id" value={vendor.id} />
                            <input
                              type="hidden"
                              name="active"
                              value={vendor.isActive ? "false" : "true"}
                            />
                            <button
                              type="submit"
                              className="text-sm text-muted-foreground hover:underline"
                            >
                              {vendor.isActive ? "Deactivate" : "Reactivate"}
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <VendorForm vendor={editing ?? undefined} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
