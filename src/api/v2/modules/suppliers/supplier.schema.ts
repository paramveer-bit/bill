// src/api/v1/modules/supplier/supplier.schema.ts
import { z } from 'zod';
import { Decimal } from "@/lib/generated/prisma/internal/prismaNamespaceBrowser.js";
import type { Decimal as decimal } from '@/lib/generated/prisma/internal/prismaNamespace';

// ============ BASE SCHEMA ============
export const supplierBaseSchema = z.object({
    name: z.string()
        .min(1, "Supplier name is required")
        .max(200, "Supplier name too long"),

    contactName: z.string()
        .max(100, "Contact name too long")
        .optional()
        .nullable(),

    phone: z.string()
        .max(20, "Phone number too long")
        .optional()
        .nullable(),

    email: z.string()
        .email("Invalid email format")
        .optional()
        .nullable(),

    gstNumber: z.string()
        .optional()
        .nullable(),

    address: z.string()
        .max(500, "Address too long")
        .optional()
        .nullable(),
});

// ============ CREATE SCHEMA ============
export const createSupplierSchema = supplierBaseSchema.extend({
    openingBalance: z.union([z.string(), z.number()])
        .transform((val) => new Decimal(val))
        .refine((val) => val.gte(0), "Sell price cannot be negative")
        .nullable(),
});

// ============ UPDATE SCHEMA ============
export const updateSupplierSchema = supplierBaseSchema.partial();

// ============ LIST/FILTER SCHEMA ============
export const listSuppliersSchema = z.object({
    search: z.string().optional(),
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    sortBy: z.string().default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
});


// ============ TYPES (Generated from schemas) ============
export type SupplierBase = z.infer<typeof supplierBaseSchema>;

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
export type ListSuppliersInput = z.infer<typeof listSuppliersSchema>;

export type Supplier = SupplierBase & {
    id: string;
    balance: decimal;
    openingBalance: decimal;
    createdAt: Date;
    createdById: string;
};

export type SupplierWithRelations = Supplier & {
    createdBy?: {
        id: string;
        name: string | null;
        email: string;
    } | null;
    purchases?: Array<{
        id: string;
        invoiceNo: string | null;
        totalAmount: decimal;
        purchaseDate: Date;
    }>;
    payments?: Array<{
        id: string;
        amount: decimal;
        paymentMode: string;
        paymentDate: Date;
    }>;
};

export type SupplierResponse = {
    id: string;
    name: string;
    contactName: string | null;
    phone: string | null;
    email: string | null;
    gstNumber: string | null;
    address: string | null;
    balance: decimal;
    openingBalance: decimal;
    createdAt: string;
    createdById: string;
};

export type SupplierStats = {
    supplierId: string;
    supplierName: string;
    totalPurchases: number;
    totalPayments: number;
    outstandingBalance: number;
    lastPurchaseDate: string | null;
    totalTransactions: number;
};

export type SupplierWithStats = SupplierWithRelations & {
    stats: SupplierStats;
};