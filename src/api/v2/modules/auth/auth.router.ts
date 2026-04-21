import { Router } from 'express';
import jwt from 'jsonwebtoken';
import * as authController from './auth.controller.js';
import { authMiddleware } from "@/middelwares/auth.middelware.js";
const router = Router();

// ============================================
// Middleware
// ============================================



// ============================================
// Public Routes (No Auth Required)
// ============================================

/**
 * POST /api/v2/auth/otp/request
 * Request OTP for registration
 */
router.post('/otp/resend', authController.requestOtp);//checked and implemented

/**
 * POST /api/v2/auth/otp/verify
 * Verify OTP code
 */
router.post('/otp/verify', authController.verifyOtp);//checked and implemented

/**
 * POST /api/v2/auth/register
 * Complete registration with verified OTP
 * Headers: Authorization: Bearer {tempToken}
 */
router.post('/register', authController.register);//checked and implemented

/**
 * POST /api/v2/auth/login
 * Login with email and password
 */
router.post('/login', authController.login);//checked and implemented

/**
 * POST /api/v2/auth/refresh
 * Refresh access token using refresh token
 */
router.get('/refresh', authController.refresh);//checked and implemented

/**
 * GET /api/v2/auth/health
 * Health check
 */
router.get('/health', authController.healthCheck);

// ============================================
// Protected Routes (Auth Required)
// ============================================

/**
 * POST /api/v2/auth/logout
 * Logout current session
 */
router.post('/logout', authMiddleware, authController.logout);

/**
 * POST /api/v2/auth/logout-all
 * Logout all devices/sessions
 */
router.post('/logout-all', authMiddleware, authController.logoutAll);

/**
 * GET /api/v2/auth/me
 * Get current user information
 */
router.get('/me', authMiddleware, authController.getCurrentUser);

/**
 * GET /api/v2/auth/sessions
 * Get all active sessions for current user
 */
router.get('/sessions', authMiddleware, authController.getSessions);

/**
 * DELETE /api/v2/auth/sessions/:sessionId
 * Revoke specific session
 */
router.delete('/sessions/:sessionId', authMiddleware, authController.revokeSession);

/**
 * POST /api/v2/auth/change-password
 * Change user password
 */
router.post('/change-password', authMiddleware, authController.changePassword);


export default router;