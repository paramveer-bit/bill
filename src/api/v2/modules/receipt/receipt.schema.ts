// src/api/v1/modules/receipt/receipt.schema.ts
import { z } from 'zod';
import { Decimal } from "@/lib/generated/prisma/internal/prismaNamespaceBrowser.js";
import type { Decimal as decimal } from '@/lib/generated/prisma/internal/prismaNamespace';

// ============ BASE SCHEMA ============
export const receiptBaseSchema = z.object({
    customerId: z.string()
        .min(1, "Customer ID is required"),

    amount: z.instanceof(Decimal)
        .refine((val) => val.gte(0), "Amount cannot be negative"),

    paymentMode: z.string()
        .min(1, "Payment mode is required")
        .max(50, "Payment mode too long"),

    receiptDate: z.date()
        .optional()
        .or(z.string().datetime())
        .transform((val) => {
            if (!val) return new Date();
            if (typeof val === 'string') return new Date(val);
            return val;
        }),

    remarks: z.string()
        .max(500, "Remarks too long")
        .optional()
        .nullable(),
});

// ============ CREATE SCHEMA ============
export const createReceiptSchema = receiptBaseSchema;

// ============ UPDATE SCHEMA ============
export const updateReceiptSchema = receiptBaseSchema.partial();

// ============ LIST/FILTER SCHEMA ============
export const listReceiptsSchema = z.object({
    search: z.string().optional(),
    customerId: z.string().optional(),
    dateFilter: z.enum(['all', '1day', 'week', 'month', 'prevmonth', 'quarter'])
        .default('all'),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    page: z.number().min(1).default(1),
    limit: z.number().min(1).max(100).default(30),
    sortBy: z.string().default('receiptDate'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

;

// ============ TYPES (Generated from schemas) ============
export type ReceiptBase = z.infer<typeof receiptBaseSchema>;

export type CreateReceiptInput = z.infer<typeof createReceiptSchema>;
export type UpdateReceiptInput = z.infer<typeof updateReceiptSchema>;
export type ListReceiptsInput = z.infer<typeof listReceiptsSchema>;

export type Receipt = ReceiptBase & {
    id: string;
    createdAt: Date;
    createdById: string;
};

export type ReceiptWithRelations = Receipt & {
    customer?: {
        id: string;
        name: string;
        email: string | null;
        phone: string | null;
        town: string;
        balance: decimal;
    } | null;
    createdBy?: {
        id: string;
        name: string | null;
        email: string;
    } | null;
};

export type ReceiptResponse = {
    id: string;
    customerId: string;
    customerName?: string;
    amount: number;
    paymentMode: string;
    receiptDate: string;
    remarks: string | null;
    createdAt: string;
    createdById: string;
    customer?: {
        id: string;
        name: string;
        email: string | null;
        phone: string | null;
        town: string;
        balance: number;
    };
};

export type ReceiptSummary = {
    totalSpend: number;
    totalReceipts: number;
    averageAmount: number;
};

export type DailyReceiptSummary = {
    date: string;
    totalAmount: number;
    count: number;
    byPaymentMode: Record<string, number>;
};