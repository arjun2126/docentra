import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { DuplicateVendorCodeError, VendorNotFoundError } from "./errors";
import type { VendorValues } from "@/lib/schemas/vendor";

/** Plain, serialisable vendor shape for server components. */
export type VendorDto = {
  id: string;
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  documentCount: number;
  createdAt: string;
};

function toDto(vendor: {
  id: bigint;
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: Date;
  _count?: { documents: number };
}): VendorDto {
  return {
    id: vendor.id.toString(),
    code: vendor.code,
    name: vendor.name,
    email: vendor.email,
    phone: vendor.phone,
    address: vendor.address,
    isActive: vendor.isActive,
    documentCount: vendor._count?.documents ?? 0,
    createdAt: vendor.createdAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

export async function listVendors(
  options: { query?: string; includeInactive?: boolean } = {},
): Promise<VendorDto[]> {
  const query = options.query?.trim();
  const vendors = await prisma.vendor.findMany({
    where: {
      ...(options.includeInactive ? {} : { isActive: true }),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" as const } },
              { code: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    include: { _count: { select: { documents: true } } },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  return vendors.map(toDto);
}

export async function getVendor(id: string): Promise<VendorDto | null> {
  if (!/^\d+$/.test(id)) return null;
  const vendor = await prisma.vendor.findUnique({
    where: { id: BigInt(id) },
    include: { _count: { select: { documents: true } } },
  });
  return vendor ? toDto(vendor) : null;
}

export async function createVendor(input: VendorValues): Promise<VendorDto> {
  try {
    const created = await prisma.vendor.create({
      data: {
        code: input.code,
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
        isActive: input.isActive,
      },
      include: { _count: { select: { documents: true } } },
    });
    return toDto(created);
  } catch (error) {
    if (isUniqueViolation(error)) throw new DuplicateVendorCodeError(input.code);
    throw error;
  }
}

export async function updateVendor(
  id: string,
  input: VendorValues,
): Promise<VendorDto> {
  const existing = await getVendor(id);
  if (!existing) throw new VendorNotFoundError(id);

  try {
    const updated = await prisma.vendor.update({
      where: { id: BigInt(id) },
      data: {
        code: input.code,
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
        isActive: input.isActive,
        updatedAt: new Date(),
      },
      include: { _count: { select: { documents: true } } },
    });
    return toDto(updated);
  } catch (error) {
    if (isUniqueViolation(error)) throw new DuplicateVendorCodeError(input.code);
    throw error;
  }
}

/**
 * Deactivation is a soft state change, never a delete: documents keep their
 * vendor, and history stays readable.
 */
export async function setVendorActive(
  id: string,
  isActive: boolean,
): Promise<VendorDto> {
  const existing = await getVendor(id);
  if (!existing) throw new VendorNotFoundError(id);

  const updated = await prisma.vendor.update({
    where: { id: BigInt(id) },
    data: { isActive, updatedAt: new Date() },
    include: { _count: { select: { documents: true } } },
  });
  return toDto(updated);
}
