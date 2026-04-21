import { z } from "zod";

const batchSchema = z.object({
    productId: z.string().min(1),
    qtyReceived: z.number().int().positive(),
    unitCost: z.number().positive(),
    sellingPrice: z.number().positive(),   // always required
    mrp: z.number().positive(),   // always required
});
export const purchaseMasterSchema = z.object({
    supplierId: z.string().min(1),
    invoiceNo: z.string(),
    purchaseDate: z.string(),
    totalAmount: z.number().positive(),
    batches: z.array(batchSchema).min(1, "At least one batch is required"),
});