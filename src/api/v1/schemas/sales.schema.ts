import { z } from "zod";


export const saleLineSchema = z.object({
    productId: z.string().min(1),
    qty: z.number().int().positive(),        // base unit qty  (e.g. 24 Pcs)
    unitQty: z.number().int().positive(),    // display qty    (e.g. 2 Cases)
    unitName: z.string().min(1),             // display unit   (e.g. "Case")
    unitSellPrice: z.number().positive(),    // price per BASE unit
});

export const createSaleSchema = z.object({
    customerId: z.string().min(1),
    saleDate: z.string().min(1),
    lines: z.array(saleLineSchema).min(1),
});