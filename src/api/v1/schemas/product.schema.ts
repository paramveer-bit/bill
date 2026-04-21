import { z } from "zod";
const unitConversionSchema = z.object({
    unitName: z.string().min(1, "Unit name is required"),
    conversionQty: z.number().int().positive("Conversion quantity must be a positive integer"),
});


export const productSchema = z.object({
    sku: z.string().optional(),
    name: z.string().min(1, "Name is required"),
    baseUnit: z.string().min(1, "Base unit is required"),  // e.g. "Pcs"
    currentSellPrice: z.number().positive(),
    taxRate: z.number().min(0).max(100),
    isStockItem: z.boolean().optional(),
    categoryId: z.string().optional().nullable(),
    unitConversions: z.array(unitConversionSchema), // e.g. [{ unitName: "Case", conversionQty: 300 }]
});