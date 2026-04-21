import type { AuthUser } from "./auth.schema.js";
import type { Request } from "express";
import ApiError from "@/helpers/ApiError.js";


export const getAuthUser = (req: Request): AuthUser => {
    const authUser = req.user as AuthUser | undefined;
    if (!authUser || !authUser.id) {
        throw new ApiError(401, 'Authentication required');
    }
    return authUser;
};
