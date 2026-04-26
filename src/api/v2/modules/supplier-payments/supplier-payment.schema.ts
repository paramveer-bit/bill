// src/api/v1/modules/supplier-payment/supplier-payment.schema.ts
import { z } from 'zod';
import { Decimal } from "@/lib/generated/prisma/internal/prismaNamespaceBrowser.js";
import type { Decimal as decimal } from '@/lib/generated/prisma/internal/prismaNamespace';

// ============ BASE SCHEMA ============
export const supplierPaymentBaseSchema = z.object({
    supplierId: z.string()
        .min(1, "Supplier ID is required"),

    amount: z.instanceof(Decimal)
        .refine((val) => val.gt(0), "Payment amount must be greater than zero"),


    paymentMode: z.string()
        .min(1, "Payment mode is required")
        .max(50, "Payment mode too long"),

    paymentDate: z.date()
        .optional()
        .or(z.string().datetime())
        .transform((val) => {
            if (!val) return new Date();
            if (typeof val === 'string') return new Date(val);
            return val;
        }),

    checkNo: z.string()
        .max(50, "Check number too long")
        .optional()
        .nullable(),

    transactionId: z.string()
        .max(100, "Transaction ID too long")
        .optional()
        .nullable(),

    remarks: z.string()
        .max(500, "Remarks too long")
        .optional()
        .nullable(),

    reference: z.string()
        .max(100, "Reference too long")
        .optional()
        .nullable(),
});

// ============ CREATE SCHEMA ============
export const createSupplierPaymentSchema = supplierPaymentBaseSchema;

// ============ UPDATE SCHEMA ============
export const updateSupplierPaymentSchema = supplierPaymentBaseSchema.partial();

// ============ LIST/FILTER SCHEMA ============
export const listSupplierPaymentsSchema = z.object({
    supplierId: z.string().optional(),
    paymentMode: z.string().optional(),
    search: z.string().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(30),
    sortBy: z.string().default('paymentDate'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ============ SUPPLIER PAYMENT STATS SCHEMA ============
export const supplierPaymentStatsSchema = z.object({
    supplierId: z.string(),
    days: z.number().min(1).max(365).default(30),
});


// ============ TYPES (Generated from schemas) ============
export type SupplierPaymentBase = z.infer<typeof supplierPaymentBaseSchema>;

export type CreateSupplierPaymentInput = z.infer<typeof createSupplierPaymentSchema>;
export type UpdateSupplierPaymentInput = z.infer<typeof updateSupplierPaymentSchema>;
export type ListSupplierPaymentsInput = z.infer<typeof listSupplierPaymentsSchema>;

export type SupplierPayment = SupplierPaymentBase & {
    id: string;
    createdAt: Date;
    createdById: string;
};

export type SupplierPaymentWithRelations = SupplierPayment & {
    supplier?: {
        id: string;
        name: string;
        email: string | null;
        phone: string | null;
    } | null;
    createdBy?: {
        id: string;
        name: string | null;
        email: string;
    } | null;
};

export type SupplierPaymentResponse = {
    id: string;
    supplierId: string;
    supplierName?: string;
    amount: decimal;
    paymentMode: string;
    paymentDate: string;
    checkNo: string | null;
    transactionId: string | null;
    remarks: string | null;
    reference: string | null;
    createdAt: string;
    createdById: string;
    supplier?: {
        id: string;
        name: string;
        email: string | null;
        phone: string | null;
    };
};

export type DailyPaymentSummary = {
    date: string;
    totalAmount: decimal;
    count: number;
    byPaymentMode: Record<string, decimal>;
};

export type SupplierPaymentStats = {
    supplierId: string;
    supplierName: string;
    totalAmount: decimal;
    paymentCount: number;
    averageAmount: decimal;
    period: string;
    byPaymentMode: Record<string, decimal>;
};