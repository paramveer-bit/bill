// src/api/v1/modules/category/category.schema.ts
import { z } from 'zod';
import type { Decimal } from '@/lib/generated/prisma/internal/prismaNamespace';
// ============ BASE SCHEMA ============
export const categoryBaseSchema = z.object({
    name: z.string()
        .min(1, "Category name is required")
        .max(100, "Category name too long"),

    description: z.string()
        .max(500, "Description too long")
        .nullable(),

    parentId: z.string()
        .nullable()
});

// ============ CREATE SCHEMA ============
export const createCategorySchema = categoryBaseSchema.extend({
    parentId: z.string()
        .nullable()
        .transform((val) => (val === '' ? null : val)), // Convert empty string to null
});

// ============ UPDATE SCHEMA ============
export const updateCategorySchema = createCategorySchema;

// ============ LIST/FILTER SCHEMA ============
export const listCategoriesSchema = z.object({
    flat: z.enum(['true', 'false'])
        .optional()
        .transform(val => val === 'true'),
});

// ============ TYPES (Generated from schemas) ============
export type CategoryBase = z.infer<typeof categoryBaseSchema>;

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type ListCategoriesInput = z.infer<typeof listCategoriesSchema>;

export type Category = CategoryBase & {
    id: string;
    createdAt: Date;
    updatedAt: Date;
};

export type CategoryWithRelations = Category & {
    parent: Category | null;
    children: Category[];
    products?: Array<{
        id: string;
        name: string;
        sku: string | null;
        currentSellPrice: Decimal | null;
    }>;
};