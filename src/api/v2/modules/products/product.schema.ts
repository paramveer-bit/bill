// src/api/v1/modules/product/product.schema.ts
import { z } from 'zod';
import type { Decimal as decimal } from '@/lib/generated/prisma/internal/prismaNamespace';
import { Decimal } from "@/lib/generated/prisma/internal/prismaNamespaceBrowser.js";

// ============ UNIT CONVERSION SCHEMA ============
export const unitConversionSchema = z.object({
    unitName: z.string()
        .min(1, "Unit name is required")
        .max(50, "Unit name too long"),

    conversionQty: z.number()
        .int("Conversion quantity must be an integer")
        .positive("Conversion quantity must be a positive integer"),
});

// ============ BASE SCHEMA ============
export const productBaseSchema = z.object({
    sku: z.string()
        .max(50, "SKU too long")
        .optional()
        .nullable(),

    name: z.string()
        .min(1, "Product name is required")
        .max(200, "Product name too long"),

    baseUnit: z.string()
        .min(1, "Base unit is required")
        .max(50, "Base unit name too long"),

    currentSellPrice: z.instanceof(Decimal)
        .refine((val) => val.gte(0), "Sell price cannot be negative")
        .nullable(),
    taxRate: z.instanceof(Decimal)
        .refine((val) => val.gte(0), "Tax rate cannot be negative")
        .refine((val) => val.lte(100), "Tax rate cannot exceed 100")
        .nullable(),

    isStockItem: z.boolean()
        .default(false),

    categoryId: z.string()
        .optional()
        .nullable(),
});

// ============ CREATE SCHEMA ============
export const createProductSchema = productBaseSchema.extend({
    unitConversions: z.array(unitConversionSchema)
        .optional()
        .default([]),
});

// ============ UPDATE SCHEMA ============
export const updateProductSchema = productBaseSchema
    .extend({
        unitConversions: z.array(unitConversionSchema).optional(),
    })
    .partial();

// ============ LIST/FILTER SCHEMA ============
export const listProductsSchema = z.object({
    categoryId: z.string().optional(),
    search: z.string().optional(),
    lowStockThreshold: z.string().optional().transform(val => val ? Number(val) : undefined),
    page: z.number().min(1).default(1),
    limit: z.number().min(1).max(100).default(20),
});




// ============ TYPES (Generated from schemas) ============
export type UnitConversion = z.infer<typeof unitConversionSchema>;

export type ProductBase = z.infer<typeof productBaseSchema>;

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsInput = z.infer<typeof listProductsSchema>;

export type Product = ProductBase & {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    createdById: string;
};

export type ProductWithRelations = Product & {
    category: {
        id: string;
        name: string;
    } | null;
    createdBy: {
        id: string;
        name: string | null;
        email: string;
    } | null;
    unitConversions?: UnitConversion[];
    purchaseBatches?: Array<{
        qtyRemaining: number;
    }>;
};

export type ProductWithStock = ProductWithRelations & {
    totalStockPcs: number;
};

export type ProductStockInfo = {
    productId: string;
    productName: string;
    baseUnit: string;
    totalStockPcs: number;
    currentSellPrice: decimal;
    taxRate: decimal;
    createdBy: string;
};

export type CategoryHierarchyWithProducts = {
    id: string;
    name: string;
    productCount: number;
    products: ProductWithRelations[];
    children: Array<{
        id: string;
        name: string;
        products: ProductWithRelations[];
    }>;
};