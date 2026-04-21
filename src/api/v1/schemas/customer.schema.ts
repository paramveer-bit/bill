import { z } from "zod"

export const customerSchema = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Invalid email address"),
    phone: z.string().min(10, "Phone number must be at least 10 digits"),
    gstNumber: z.string(),
    address: z.string(),
    balance: z.number().default(0),
    town: z.string().min(5, "Town name is necessary")
});