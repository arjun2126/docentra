import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { DocumentValues } from "@/lib/schemas/document";
import {
  DocumentNotFoundError,
  ImmutableDocumentError,
  StaleDocumentError,
  VendorNotFoundError,
} from "./errors";
import { multiplyAmount, sumAmounts } from "./money";
import { assertTransition, isEditable } from "./workflow";

export type DocumentLineDto = {
  lineNo: number;
  item: string;
  quantity: string;
  price: string;
  amount: string;
};

export type DocumentDto = {
  shno: string;
  documentNumber: string;
  documentDate: string;
  status: string;
  totalAmount: string;
  lineCount: number;
  notes: string | null;
  version: number;
  vendor: { id: string; code: string; name: string };
  lines: DocumentLineDto[];
};

const headerInclude = {
  vendor: { select: { id: true, code: true, name: true } },
  details: { orderBy: { lineNo: "asc" } },
} satisfies Prisma.DocumentHeaderInclude;

type HeaderWithRelations = Prisma.DocumentHeaderGetPayload<{ include: typeof headerInclude }>;

function toDto(header: HeaderWithRelations): DocumentDto {
  return {
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
  };
}

function toDate(documentDate: string): Date {
  return new Date(`${documentDate}T00:00:00.000Z`);
}

/**
 * Document numbers are sequential per year: DOC-<year>-000123. The advisory
 * lock serialises allocation inside the transaction, and the unique constraint
 * remains the final backstop, so two concurrent creates cannot collide.
 */
async function allocateDocumentNumber(
  tx: Prisma.TransactionClient,
  year: number,
): Promise<string> {
  // Prisma cannot deserialise a void column, so the lock result is cast.
  await tx.$queryRaw`select pg_advisory_xact_lock(hashtext('docflow.document_number'))::text as locked`;
  const rows = await tx.$queryRaw<Array<{ next: bigint }>>`
    select coalesce(max((regexp_match(document_number, '(\\d+)$'))[1]::bigint), 0) + 1 as next
    from docflow.document_header
    where document_number like ${`DOC-${year}-%`}
  `;
  const next = rows[0]?.next ?? 1n;
  return `DOC-${year}-${next.toString().padStart(6, "0")}`;
}

function buildLines(lines: DocumentValues["lines"]) {
  const amounts = lines.map((line) => multiplyAmount(line.quantity, line.price));
  return {
    amounts,
    total: sumAmounts(amounts),
    rows: lines.map((line, index) => ({
      lineNo: index + 1,
      item: line.item,
      quantity: new Prisma.Decimal(line.quantity),
      price: new Prisma.Decimal(line.price),
      amount: new Prisma.Decimal(amounts[index]),
    })),
  };
}

export async function getDocument(shno: string): Promise<DocumentDto | null> {
  if (!/^\d+$/.test(shno)) return null;
  const header = await prisma.documentHeader.findUnique({
    where: { shno: BigInt(shno) },
    include: headerInclude,
  });
  return header ? toDto(header) : null;
}

export async function listDocuments(take = 25): Promise<DocumentDto[]> {
  const headers = await prisma.documentHeader.findMany({
    take,
    orderBy: [{ documentDate: "desc" }, { shno: "desc" }],
    include: headerInclude,
  });
  return headers.map(toDto);
}

export async function createDocument(input: DocumentValues): Promise<DocumentDto> {
  const vendor = await prisma.vendor.findUnique({ where: { id: BigInt(input.vendorId) } });
  if (!vendor || !vendor.isActive) throw new VendorNotFoundError(input.vendorId);

  const built = buildLines(input.lines);
  const year = Number(input.documentDate.slice(0, 4));

  return prisma.$transaction(async (tx) => {
    const documentNumber = await allocateDocumentNumber(tx, year);
    const header = await tx.documentHeader.create({
      data: {
        documentNumber,
        documentDate: toDate(input.documentDate),
        vendorId: BigInt(input.vendorId),
        status: "draft",
        notes: input.notes ?? null,
        totalAmount: new Prisma.Decimal(built.total),
        lineCount: built.rows.length,
      },
    });

    await tx.documentDetail.createMany({
      data: built.rows.map((row) => ({ ...row, shno: header.shno })),
    });

    const created = await tx.documentHeader.findUniqueOrThrow({
      where: { shno: header.shno },
      include: headerInclude,
    });
    // The trigger is authoritative for totals; verify rather than assume.
    return toDto(created);
  });
}

/**
 * Replace a draft's content atomically. A failed line must not leave the old
 * lines deleted, so the delete and the inserts share one transaction, and the
 * version check happens in the same statement that writes.
 */
export async function updateDocument(
  shno: string,
  expectedVersion: number,
  input: DocumentValues,
): Promise<DocumentDto> {
  if (!/^\d+$/.test(shno)) throw new DocumentNotFoundError(shno);
  const built = buildLines(input.lines);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.documentHeader.findUnique({ where: { shno: BigInt(shno) } });
    if (!existing) throw new DocumentNotFoundError(shno);
    if (!isEditable(existing.status)) throw new ImmutableDocumentError(existing.status);
    if (existing.version !== expectedVersion) {
      throw new StaleDocumentError(expectedVersion, existing.version);
    }

    const written = await tx.documentHeader.updateMany({
      where: { shno: BigInt(shno), version: expectedVersion, status: "draft" },
      data: {
        vendorId: BigInt(input.vendorId),
        documentDate: toDate(input.documentDate),
        notes: input.notes ?? null,
        version: { increment: 1 },
        updatedAt: new Date(),
      },
    });
    if (written.count !== 1) throw new StaleDocumentError(expectedVersion, existing.version);

    await tx.documentDetail.deleteMany({ where: { shno: BigInt(shno) } });
    await tx.documentDetail.createMany({
      data: built.rows.map((row) => ({ ...row, shno: BigInt(shno) })),
    });

    const updated = await tx.documentHeader.findUniqueOrThrow({
      where: { shno: BigInt(shno) },
      include: headerInclude,
    });
    return toDto(updated);
  });
}

export async function transitionDocument(
  shno: string,
  to: string,
  expectedVersion: number,
): Promise<DocumentDto> {
  if (!/^\d+$/.test(shno)) throw new DocumentNotFoundError(shno);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.documentHeader.findUnique({ where: { shno: BigInt(shno) } });
    if (!existing) throw new DocumentNotFoundError(shno);
    assertTransition(existing.status, to);
    if (existing.version !== expectedVersion) {
      throw new StaleDocumentError(expectedVersion, existing.version);
    }

    const written = await tx.documentHeader.updateMany({
      where: { shno: BigInt(shno), version: expectedVersion, status: existing.status },
      data: { status: to, version: { increment: 1 }, updatedAt: new Date() },
    });
    if (written.count !== 1) throw new StaleDocumentError(expectedVersion, existing.version);

    const updated = await tx.documentHeader.findUniqueOrThrow({
      where: { shno: BigInt(shno) },
      include: headerInclude,
    });
    return toDto(updated);
  });
}
