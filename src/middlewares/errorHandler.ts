import type { Request, Response, NextFunction } from 'express';
import ApiError from '../helpers/ApiError.js';
export const errorHandler = (
    err: Error | ApiError,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    console.log("Error Middelware called")
    if (err instanceof ApiError) {
        return res.status(err.statusCode).json({
            success: false,
            message: err.message,
            errors: err.errors,
        });
    }

    // Unhandled errors
    console.error('Unhandled Error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        // ...(config.NODE_ENV === 'development' && { error: err.message }),
    });
};

// app.ts
// app.use(errorHandler); // Last middleware