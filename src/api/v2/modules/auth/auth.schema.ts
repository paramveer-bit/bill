import { z } from 'zod';

// ============================================
// Base Schemas (mirroring Prisma model fields)
// ============================================

export const userSchema = z.object({
    id: z.string(),
    email: z.string(),
    password: z.string(),
    name: z.string().nullable(),
    role: z.string(),
    isOnboarded: z.boolean(),
    isEmailVerified: z.boolean(),
    lastLoginAt: z.date().nullable(),
    lastPasswordChangeAt: z.date().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
});
export type User = z.infer<typeof userSchema>;

export const refreshTokenSchema = z.object({
    id: z.string(),
    token: z.string(),
    userId: z.string(),
    expiresAt: z.date(),
    isRevoked: z.boolean(),
    revokedAt: z.date().nullable(),
    createdAt: z.date(),
    sessionId: z.string(),
});
export type RefreshToken = z.infer<typeof refreshTokenSchema>;

export const sessionSchema = z.object({
    id: z.string(),
    userId: z.string(),
    ipAddress: z.string().nullable(),
    userAgent: z.string().nullable(),
    isActive: z.boolean(),
    lastActivityAt: z.date(),
    createdAt: z.date(),
    expiresAt: z.date().nullable(),
});
export type Session = z.infer<typeof sessionSchema>;

export const otpVerificationSchema = z.object({
    id: z.string(),
    email: z.string(),
    otpHash: z.string(),
    otpExpiry: z.date(),
    attempts: z.number(),
    maxAttempts: z.number(),
    isVerified: z.boolean(),
    verifiedAt: z.date().nullable(),
    createdAt: z.date(),
    expiresAt: z.date(),
});
export type OtpVerification = z.infer<typeof otpVerificationSchema>;

// ============================================
// OTP Schemas
// ============================================

export const requestOtpSchema = z.object({
    id: z.string()
});
export type RequestOtpInput = z.infer<typeof requestOtpSchema>;

export const verifyOtpSchema = z.object({
    id: z.string().uuid('Invalid ID format'),
    otp: z.string().min(4).max(10),
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

// ============================================
// Auth Schemas
// ============================================

export const completeRegistrationSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
    name: z.string().min(2, 'Name must be at least 2 characters'),
    role: z.enum(['ADMIN', 'USER', 'MANAGER']).default('USER'),
}).refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
});
export type CompleteRegistrationInput = z.infer<typeof completeRegistrationSchema>;

export const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshTokenInputSchema = z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
});
export type RefreshTokenInput = z.infer<typeof refreshTokenInputSchema>;

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters'),
    confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: 'New passwords do not match',
    path: ['confirmPassword'],
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// ============================================
// Response Types
// ============================================

export interface UserResponse {
    id: string;
    email: string;
    name: string | null;
    role: string;
    isOnboarded: boolean;
    isEmailVerified: boolean;
}

export interface AuthResponse {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: UserResponse;
}

export interface OtpResponse {
    message: string;
    expiresIn: number;
}

export interface VerifyOtpResponse {
    verified: boolean;
    tempToken?: string;
    attemptsLeft?: number;
}

export interface TokenResponse {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}

export interface MessageResponse {
    message: string;
}