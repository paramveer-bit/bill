import asyncHandler from "@/helpers/asynchandeler.js";
import ApiError from "@/helpers/ApiError.js";
import ApiResponse from "@/helpers/ApiResponse.js";
import type { Request, Response } from "express";
import {
    requestOtpSchema,
    verifyOtpSchema,
    completeRegistrationSchema,
    loginSchema,
    refreshTokenSchema,
    changePasswordSchema,
} from "./auth.schema.js";
import * as authService from './auth.service.js';
import { formatUserResponse, verifyToken } from "@/helpers/auth.helpers.js";

// Helper function to extract IP and user agent
function getClientInfo(req: Request) {
    const ipAddress =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
        req.socket.remoteAddress ||
        'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    return { ipAddress, userAgent };
}

// ============================================
// OTP Controllers
// ============================================

/**
 * POST /api/v2/auth/otp/request
 * Request OTP for registration
 */
export const requestOtp = asyncHandler(async (req: Request, res: Response) => {
    // Validate request
    const validatedData = requestOtpSchema.parse(req.body);

    if (!validatedData) {
        throw new ApiError(400, 'Invalid request data');
    }
    // Call service 
    const result = await authService.requestOtp(validatedData);

    return res.status(200).json(
        new ApiResponse('OTP sent successfully', result)
    );

})

/**
 * POST /api/v2/auth/otp/verify
 * Verify OTP
 */
export const verifyOtp = asyncHandler(async (req: Request, res: Response) => {

    // Validate request
    const validatedData = verifyOtpSchema.parse(req.body);

    if (!validatedData) {
        throw new ApiError(400, 'Invalid request data');
    }

    // Get client info
    const { ipAddress, userAgent } = getClientInfo(req);

    // Call service
    const result = await authService.verifyOtp(validatedData, ipAddress, userAgent);

    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });


    return res.status(200).json(new ApiResponse("OTP verification result", result));

})

// ============================================
// Registration Controllers
// ============================================

/**
 * POST /api/v2/auth/register
 * Complete user registration
 */ //checked
export const register = asyncHandler(async (req: Request, res: Response) => {

    // Validate request
    const validatedData = completeRegistrationSchema.parse(req.body);
    if (!validatedData) {
        throw new ApiError(400, 'Invalid request data', validatedData);
    }
    // Call service
    const result = await authService.completeRegistration(validatedData);


    return res.status(201).json(
        new ApiResponse('Registration completed successfully', { user: formatUserResponse(result) })
    );
})

// ============================================
// Login Controllers
// ============================================

/**
 * POST /api/v2/auth/login
 * User login
 */
export const login = asyncHandler(async (req: Request, res: Response) => {

    // Validate request
    const validatedData = loginSchema.parse(req.body);

    if (!validatedData) {
        throw new ApiError(400, 'Invalid request data');
    }

    // Get client info
    const { ipAddress, userAgent } = getClientInfo(req);

    // Call service
    const result = await authService.login(validatedData, ipAddress, userAgent);

    // Set refresh token as httpOnly cookie
    res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    return res.status(200).json(
        new ApiResponse('Login successful', result)
    );
})

// ============================================
// Token Controllers
// ============================================

/**
 * POST /api/v2/auth/refresh
 * Refresh access token
 */
export const refresh = asyncHandler(async (req: Request, res: Response) => {
    // Get refresh token from cookie or body
    const refreshToken =
        req.cookies.refreshToken ||
        req.body.refreshToken ||
        req.headers.authorization?.split(' ')[1];

    // console.log("Refresh token received:", refreshToken);
    if (!refreshToken) {
        throw new ApiError(400, 'Refresh token required');
    }


    // Call service
    const result = await authService.refreshAccessToken(refreshToken);

    // Update refresh token cookie
    res.cookie('refreshToken', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    return res.status(200).json(
        new ApiResponse('Token refreshed successfully', result)
    );
})

// ============================================
// Logout Controllers
// ============================================

/**
 * POST /api/v2/auth/logout
 * User logout
 */
export const logout = asyncHandler(async (req: Request, res: Response) => {

    const userId = req.user?.id;

    if (!userId) {
        throw new ApiError(401, 'Unauthorized');
    }

    const refreshToken =
        req.cookies.refreshToken ||
        req.body.refreshToken ||
        req.headers.authorization?.split(' ')[1];

    if (!refreshToken) {
        throw new ApiError(400, 'Refresh token required for logout');
    }

    // Call service
    await authService.logout(userId, refreshToken);

    // Clear refresh token cookie
    res.clearCookie('refreshToken');

    return res.status(200).json(
        new ApiResponse('Logout successful', { message: 'Logged out successfully' })
    );

})

/**
 * POST /api/v2/auth/logout-all
 * Logout from all devices
 */
export const logoutAll = asyncHandler(async (req: Request, res: Response) => {

    const userId = req.user?.id;

    if (!userId) {
        throw new ApiError(401, 'Unauthorized');
    }

    // Call service
    await authService.logoutAllDevices(userId);

    // Clear refresh token cookie
    res.clearCookie('refreshToken');

    return res.status(200).json(
        new ApiResponse('Logout from all devices successful', { message: 'Logged out from all devices successfully' })
    );

})

// ============================================
// User Info Controllers
// ============================================

/**
 * GET /api/v2/auth/me
 * Get current user info
 */
export const getCurrentUser = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;

    if (!userId) {
        throw new ApiError(401, 'Unauthorized');
    }

    // Call service
    const user = await authService.getCurrentUser(userId);

    return res.status(200).json(new ApiResponse('User info retrieved successfully', user));
});


/**
 * GET /api/v2/auth/sessions
 * Get user sessions
 */
export const getSessions = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;

    if (!userId) {
        throw new ApiError(401, 'Unauthorized');
    }

    // Call service
    const sessions = await authService.getUserSessions(userId);

    return res.status(200).json(new ApiResponse('Sessions retrieved successfully', sessions));

})

/**
 * DELETE /api/v2/auth/sessions/:sessionId
 * Revoke specific session
 */
export const revokeSession = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const { sessionId } = req.params;

    if (!userId) {
        throw new ApiError(400, "User Id is required")
    }

    if (!sessionId) {
        throw new ApiError(400, "Session Id is required")
    }

    // Call service
    await authService.revokeSession(sessionId, userId);

    return res.status(200).json(new ApiResponse('Session revoked successfully', { message: 'Session revoked successfully' }));
})

// ============================================
// Password Management Controllers
// ============================================

/**
 * POST /api/v2/auth/change-password
 * Change user password
 */
export const changePassword = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;

    if (!userId) {
        throw new ApiError(401, 'Unauthorized');
    }

    // Validate request
    const validatedData = changePasswordSchema.parse(req.body);

    // Call service
    await authService.changePassword(userId, validatedData);

    // Clear refresh token cookie (force re-login)
    res.clearCookie('refreshToken');

    return res.status(200).json(new ApiResponse('Password changed successfully', { message: 'Password changed successfully. Please login again.' }));
})

// ============================================
// Health Check
// ============================================

/**
 * GET /api/v2/auth/health
 * Auth service health check
 */
export const healthCheck = asyncHandler(async (req: Request, res: Response) => {
    return res.status(200).json(new ApiResponse('Auth service is running', { status: 'Auth service is running' }));
});