import { z } from "zod";
export const supplierSchema = z.object({
    name: z.string().min(1, "Name is required"),
    contactName: z.string().nullable(),
    email: z.string().email("Invalid email address").nullable(),
    phone: z.string().min(10, "Phone number must be at least 10 digits").nullable(),
    gstNumber: z.string().nullable(),
    address: z.string().nullable(),
    openingBalance: z.number().default(0), // CHANGE #1: Added openingBalance field
});


export const supplierPaymentSchema = z.object({
    supplierId: z.string().uuid("Supplier ID must be a valid UUID"),
    amount: z.number().positive("Amount must be greater than 0"),
    paymentMode: z.enum(["Cash", "Bank Transfer", "UPI", "Cheque"]).default("Cash"),
    paymentDate: z.string().datetime("Invalid date format"),
    checkNo: z.string().optional().nullable(),
    transactionId: z.string().optional().nullable(),
    remarks: z.string().optional().nullable(),
    reference: z.string().optional().nullable(),
}).refine(
    (data) => {
        // If payment mode is Cheque, checkNo should be provided
        if (data.paymentMode === "Cheque" && !data.checkNo) {
            return false;
        }
        return true;
    },
    {
        message: "Check number is required for Cheque payments",
        path: ["checkNo"],
    }
);