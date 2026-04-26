import type { Request, Response, NextFunction } from "express";
import jwt from 'jsonwebtoken';
import ApiError from "@/helpers/ApiError.js";
import asyncHandler from "@/helpers/asynchandeler.js";
/**
 * Authentication middleware
 * Verifies JWT token and adds user info to request
 */
export const authMiddleware = asyncHandler((req: Request, res: Response, next: NextFunction) => {

    const token = req.headers.authorization?.split(' ')[1];
    // console.log("Auth token received:", token);
    if (!token) {
        throw new ApiError(401, 'No authorization token provided');
    }

    try {
        const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
        const decoded = jwt.verify(token, JWT_SECRET);

        if (!decoded || typeof decoded === 'string' || !decoded.userId) {
            throw new ApiError(401, 'Invalid token payload');
        }

        req.user = {
            id: decoded.userId,
            email: decoded.email,
            role: decoded.role,
        };

        next();
    } catch (error: any) {
        if (error.name === 'TokenExpiredError') {
            throw new ApiError(401, 'Token has expired');
        }
        throw new ApiError(401, 'Authentication failed');
    }
})

/**
 * Optional auth middleware
 * Does not fail if token is missing, but verifies if present
 */
export function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (token) {
            const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded as any;
        }

        next();
    } catch (error) {
        console.error('Error in optionalAuthMiddleware:', error);
        // Continue even if token is invalid
        next();
    }
}