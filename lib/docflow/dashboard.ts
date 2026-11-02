import { prisma } from "@/lib/prisma";

export const DOCUMENT_STATUSES = ["draft", "submitted", "approved", "rejected"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export type StatusSummary = {
  status: DocumentStatus;
  count: number;
  total: string;
};

export type VendorMetric = {
  vendorId: string;
  code: string;
  name: string;
  count: number;
  total: string;
};

export type RecentDocument = {
  shno: string;
  documentNumber: string;
  documentDate: string;
  vendorName: string;
  vendorCode: string;
  status: string;
  totalAmount: string;
};

export type DashboardData = {
  totalDocuments: number;
  vendorCount: number;
  activeVendorCount: number;
  byStatus: StatusSummary[];
  awaitingApprovalValue: string;
  approvedValue: string;
  approvedThisMonth: string;
  approvedThisMonthCount: number;
  topVendors: VendorMetric[];
  recent: RecentDocument[];
};

/**
 * Money stays a decimal string end to end. Converting to a float here would
 * reintroduce exactly the rounding the database constraints exist to prevent.
 * Two decimal places are a numeric convention, not a currency: no symbol, code
 * or locale formatting is applied anywhere.
 */
export function amountToString(value: unknown): string {
  if (value === null || value === undefined) return "0.00";
  const decimal = value as { toFixed?: (digits: number) => string };
  if (typeof decimal.toFixed === "function") return decimal.toFixed(2);
  return String(value);
}

function startOfMonth(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function getDashboard(now = new Date()): Promise<DashboardData> {
  const [groups, vendorCount, activeVendorCount, recent, topGroups, monthAggregate] =
    await Promise.all([
      prisma.documentHeader.groupBy({
        by: ["status"],
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
      prisma.vendor.count(),
      prisma.vendor.count({ where: { isActive: true } }),
      prisma.documentHeader.findMany({
        take: 5,
        orderBy: [{ documentDate: "desc" }, { shno: "desc" }],
        include: { vendor: { select: { name: true, code: true } } },
      }),
      prisma.documentHeader.groupBy({
        by: ["vendorId"],
        _count: { _all: true },
        _sum: { totalAmount: true },
        orderBy: [{ _count: { vendorId: "desc" } }, { vendorId: "asc" }],
        take: 5,
      }),
      prisma.documentHeader.aggregate({
        where: { status: "approved", documentDate: { gte: startOfMonth(now) } },
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
    ]);

  const byStatus: StatusSummary[] = DOCUMENT_STATUSES.map((status) => {
    const group = groups.find((row) => row.status === status);
    return {
      status,
      count: group?._count._all ?? 0,
      total: amountToString(group?._sum.totalAmount),
    };
  });

  const vendorsById = new Map(
    (
      await prisma.vendor.findMany({
        where: { id: { in: topGroups.map((row) => row.vendorId) } },
        select: { id: true, code: true, name: true },
      })
    ).map((vendor) => [vendor.id.toString(), vendor]),
  );

  return {
    totalDocuments: byStatus.reduce((sum, row) => sum + row.count, 0),
    vendorCount,
    activeVendorCount,
    byStatus,
    awaitingApprovalValue: byStatus.find((row) => row.status === "submitted")?.total ?? "0.00",
    approvedValue: byStatus.find((row) => row.status === "approved")?.total ?? "0.00",
    approvedThisMonth: amountToString(monthAggregate._sum.totalAmount),
    approvedThisMonthCount: monthAggregate._count._all,
    topVendors: topGroups.map((row) => {
      const vendor = vendorsById.get(row.vendorId.toString());
      return {
        vendorId: row.vendorId.toString(),
        code: vendor?.code ?? "—",
        name: vendor?.name ?? "Unknown vendor",
        count: row._count._all,
        total: amountToString(row._sum.totalAmount),
      };
    }),
    recent: recent.map((row) => ({
      shno: row.shno.toString(),
      documentNumber: row.documentNumber,
      documentDate: row.documentDate.toISOString().slice(0, 10),
      vendorName: row.vendor.name,
      vendorCode: row.vendor.code,
      status: row.status,
      totalAmount: amountToString(row.totalAmount),
    })),
  };
}
