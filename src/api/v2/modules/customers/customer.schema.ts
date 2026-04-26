import { Decimal } from "@/lib/generated/prisma/internal/prismaNamespaceBrowser.js";
import { z } from "zod"

const customerSchema = z.object({
    id: z.string(),
    name: z.string(),
    email: z.string().nullable(),      // Allow null
    phone: z.string().nullable(),      // Allow null
    gstNumber: z.string().nullable(),  // Allow null
    address: z.string().nullable(),
    town: z.string(),
    openingBalance: z.union([z.string(), z.number()])
        .transform((val) => new Decimal(val))
        .refine((val) => val.gte(0), "Sell price cannot be negative")
        .nullable(),  // Use Decimal type
    createdAt: z.date()
});
export type Customer = z.infer<typeof customerSchema>;


// ============ CREATE SCHEMA ============
export const createCustomerSchema = customerSchema.omit({ id: true, createdAt: true, balance: true }).extend({
    name: z.string().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
    email: z.string().email("Invalid email address"),
    phone: z.string().regex(/^\+?[0-9]{10,15}$/, "Invalid phone number"),
    gstNumber: z.string().nullable().default(null),
    address: z.string().trim().min(1, "Address is required").nullable().default(null),
    town: z.string().min(5, "Town name is necessary"),
    openingBalance: z.number().min(0, "Balance cannot be negative").default(0)
});

// ============ UPDATE SCHEMA ============
export const updateCustomerSchema = customerSchema
    .omit({ id: true, createdAt: true, openingBalance: true })
    .partial();
// All fields optional for updates


// ============ LIST/FILTER SCHEMA ============
export const listCustomersSchema = z.object({
    page: z.coerce.number().optional(),
    limit: z.coerce.number().min(1).max(100).optional(),
    search: z.string().optional(), // search by name or email
    town: z.string().optional(),
});

// ============ TYPES (Generated from schemas) ============

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersInput = z.infer<typeof listCustomersSchema>;