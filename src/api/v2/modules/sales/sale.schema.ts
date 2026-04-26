// src/api/v1/modules/sale/sale.schema.ts
import { z } from 'zod';
import { Decimal } from "@/lib/generated/prisma/internal/prismaNamespaceBrowser.js";
import type { Decimal as decimal } from '@/lib/generated/prisma/internal/prismaNamespace';

// ============ SALE LINE SCHEMA ============
export const saleLineSchema = z.object({
    productId: z.string().min(1, 'Product ID is required'),
    qty: z.number().int().positive('Quantity must be a positive integer'),
    unitQty: z.number().int().positive('Unit quantity must be a positive integer'),
    unitName: z.string().min(1, 'Unit name is required'),
    unitSellPrice: z.instanceof(Decimal)
        .refine((val) => val.gt(0), 'Unit sell price must be greater than zero'),
});

// ============ CREATE SCHEMA ============
export const createSaleSchema = z.object({
    customerId: z.string().min(1, 'Customer ID is required'),

    saleDate: z
        .string()
        .datetime()
        .or(z.string().min(1))
        .transform((val) => new Date(val)),

    lines: z.array(saleLineSchema).min(1, 'At least one line item is required'),
});

// ============ LIST / FILTER SCHEMA ============
export const listSalesSchema = z.object({
    search: z.string().optional(),
    dateFilter: z
        .enum(['1day', 'week', 'month', 'prevmonth', 'quarter', 'all'])
        .optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    customerId: z.string().optional(),
    sortBy: z
        .enum(['saleDate', 'totalAmount', 'invoiceNo', 'createdAt'])
        .default('saleDate'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(30),
});


// ============ TYPES ============
export type SaleLineInput = z.infer<typeof saleLineSchema>;
export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type ListSalesInput = z.infer<typeof listSalesSchema>;

// Internal planning types for FIFO allocation
export type AllocationPlan = {
    purchaseBatchId: string;
    qtyAllocated: number;
    unitCost: decimal;
};

export type LinePlan = {
    productId: string;
    productName: string;
    qty: number;
    unitQty: number;
    unitName: string;
    unitSellPrice: decimal;
    lineTotal: decimal;
    costAllocated: decimal;
    allocations: AllocationPlan[];
};

export type SaleListMeta = {
    page: number;
    limit: number;
    totalRecords: number;
    totalPages: number;
};

export type SalesSummary = {
    today: { amount: number; count: number };
    month: { amount: number; count: number };
    allTime: { amount: number; count: number };
};