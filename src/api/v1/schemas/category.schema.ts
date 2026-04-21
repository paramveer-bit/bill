import { z } from "zod"

export const categorySchema = z.object({
    name: z.string().min(1, "Name is required"),
    description: z.string(),
    parentId: z.string().nullable(),

});