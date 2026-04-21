import { z } from "zod";

export const receiptSchema = z.object({
    customerId: z.string().min(1, "customerId is required"),
    amount: z.number().positive("amount must be positive"),
    paymentMode: z.string().min(1, "paymentMode is required"),
    receiptDate: z.string().optional(),
    remarks: z.string().optional().nullable(),
});