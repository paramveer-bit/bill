import { z } from "zod"

// ============ AUTH USER SCHEMA ============
export const authUserSchema = z.object({
    id: z.string(),
    email: z.string().email(),
    role: z.string(),
});

export type AuthUser = z.infer<typeof authUserSchema>;



