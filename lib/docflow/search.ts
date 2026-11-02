import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { SearchParams } from "@/lib/schemas/search";
import { listDocuments, type DocumentDto } from "./documents";

export type SearchResult = {
  items: DocumentDto[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

/**
 * PostgreSQL LIKE treats % and _ as wildcards and backslash as the default
 * escape character. Escaping user input keeps a search for "100%" literal
 * instead of matching everything.
 */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function buildWhere(params: SearchParams): Prisma.DocumentHeaderWhereInput {
  const where: Prisma.DocumentHeaderWhereInput = {};

  if (params.status) where.status = params.status;
  if (params.vendorId) where.vendorId = BigInt(params.vendorId);
  if (params.from || params.to) {
    where.documentDate = {
      ...(params.from ? { gte: new Date(`${params.from}T00:00:00.000Z`) } : {}),
      ...(params.to ? { lte: new Date(`${params.to}T00:00:00.000Z`) } : {}),
    };
  }

  if (params.q) {
    const needle = escapeLike(params.q);
    where.OR = [
      { documentNumber: { contains: needle, mode: "insensitive" } },
      { vendor: { name: { contains: needle, mode: "insensitive" } } },
      { vendor: { code: { contains: needle, mode: "insensitive" } } },
      { notes: { contains: needle, mode: "insensitive" } },
      { details: { some: { item: { contains: needle, mode: "insensitive" } } } },
    ];
  }

  return where;
}

export async function searchDocuments(params: SearchParams): Promise<SearchResult> {
  const where = buildWhere(params);
  const skip = (params.page - 1) * params.pageSize;

  const [total, headers] = await Promise.all([
    prisma.documentHeader.count({ where }),
    prisma.documentHeader.findMany({
      where,
      skip,
      take: params.pageSize,
      orderBy: [{ documentDate: "desc" }, { shno: "desc" }],
      include: {
        vendor: { select: { id: true, code: true, name: true } },
        details: { orderBy: { lineNo: "asc" } },
      },
    }),
  ]);

  return {
    items: headers.map((header) => ({
      shno: header.shno.toString(),
      documentNumber: header.documentNumber,
      documentDate: header.documentDate.toISOString().slice(0, 10),
      status: header.status,
      totalAmount: header.totalAmount.toFixed(2),
      lineCount: header.lineCount,
      notes: header.notes,
      version: header.version,
      vendor: {
        id: header.vendor.id.toString(),
        code: header.vendor.code,
        name: header.vendor.name,
      },
      lines: header.details.map((line) => ({
        lineNo: line.lineNo,
        item: line.item,
        quantity: line.quantity.toFixed(4),
        price: line.price.toFixed(2),
        amount: line.amount.toFixed(2),
      })),
    })),
    total,
    page: params.page,
    pageSize: params.pageSize,
    pageCount: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

/** Keep the simple list available for pages that do not need filtering. */
export { listDocuments };
