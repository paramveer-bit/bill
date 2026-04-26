// src/api/v1/modules/purchase/purchase.schema.ts
import { z } from 'zod';
import { Decimal } from "@/lib/generated/prisma/internal/prismaNamespaceBrowser.js";
import type { Decimal as decimal } from '@/lib/generated/prisma/internal/prismaNamespace';

// ============ BATCH SCHEMA ============
export const purchaseBatchSchema = z.object({
    productId: z.string().min(1, 'Product ID is required'),
    qtyReceived: z.number().int().positive('Quantity must be a positive integer'),
    unitCost: z.union([z.string(), z.number()])
        .transform((val) => new Decimal(val))
        .refine((val) => val.gte(0), "Sell price cannot be negative"),
    sellingPrice: z.union([z.string(), z.number()])
        .transform((val) => new Decimal(val))
        .refine((val) => val.gte(0), "Sell price cannot be negative"),
    mrp: z.union([z.string(), z.number()])
        .transform((val) => new Decimal(val))
        .refine((val) => val.gte(0), "Sell price cannot be negative")
});

// ============ CREATE SCHEMA ============
export const createPurchaseSchema = z.object({
    supplierId: z.string().min(1, 'Supplier ID is required'),

    invoiceNo: z.string().max(100, 'Invoice number too long').optional().nullable(),

    purchaseDate: z
        .string()
        .datetime()
        .optional()
        .nullable()
        .transform((val) => (val ? new Date(val) : new Date())),

    totalAmount: z.union([z.string(), z.number()])
        .transform((val) => new Decimal(val))
        .refine((val) => val.gte(0), "Sell price cannot be negative"),

    batches: z
        .array(purchaseBatchSchema)
        .min(1, 'At least one batch is required'),
});

// ============ LIST / FILTER SCHEMA ============
export const listPurchasesSchema = z.object({
    supplierId: z.string().optional(),
    invoiceNo: z.string().optional(),
    search: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    dateFilter: z
        .enum(['1day', 'week', 'month', 'prevmonth', 'quarter', 'all'])
        .optional(),
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
});


// ============ TYPES ============
export type PurchaseBatchInput = z.infer<typeof purchaseBatchSchema>;
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type ListPurchasesInput = z.infer<typeof listPurchasesSchema>;

export type PurchaseWithRelations = {
    id: string;
    supplierId: string;
    invoiceNo: string | null;
    purchaseDate: Date;
    totalAmount: decimal; // Decimal from Prisma
    createdAt: Date;
    createdById: string;
    supplier?: {
        id: string;
        name: string;
    } | null;
    batches?: PurchaseBatchWithProduct[];
};

export type PurchaseBatchWithProduct = {
    id: string;
    productId: string;
    purchaseId: string | null;
    qtyReceived: number;
    qtyRemaining: number;
    unitCost: decimal;
    receivedAt: Date;
    sellingPrice: decimal | null;
    mrp: decimal;
    product?: {
        id: string;
        name: string;
        sku: string | null;
        baseUnit: string;
    } | null;
};

export type PurchaseListItem = {
    id: string;
    invoiceNo: string | null;
    purchaseDate: Date;
    totalAmount: decimal;
    createdAt: Date;
    supplier: { id: string; name: string } | null;
    // batchCount: number;
};

export type PurchaseListMeta = {
    page: number;
    limit: number;
    totalRecords: number;
    totalPages: number;
};
