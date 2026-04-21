
import {
    UserRepository,
    RefreshTokenRepository,
    OtpVerificationRepository,
    SessionRepository,
    AuthBatchRepository,
    PasswordRepository,
} from './auth.repository.js';
import ApiError from '@/helpers/ApiError.js';
import type {
    RequestOtpInput,
    VerifyOtpInput,
    CompleteRegistrationInput,
    LoginInput,
    ChangePasswordInput,
    AuthResponse,
    OtpResponse,
    VerifyOtpResponse,
    TokenResponse,
    UserResponse,
    User,
} from './auth.schema.js';

import { generateSecureToken, generateOtp, sendOtpEmail, generateAccessToken, generateRefreshTokenJwt, verifyToken, formatUserResponse } from '@/helpers/auth.helpers.js';

// ============================================
// Environment Variables
// ============================================

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const REFRESH_TOKEN_EXPIRY = parseInt(process.env.REFRESH_TOKEN_EXPIRY || '2592000000'); // 30 days
const ACCESS_TOKEN_EXPIRY = parseInt(process.env.ACCESS_TOKEN_EXPIRY || '900000');       // 15 minutes
const OTP_EXPIRY = parseInt(process.env.OTP_EXPIRY || '900000');                         // 15 minutes
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || '5');
const OTP_REQUEST_LIMIT = parseInt(process.env.OTP_REQUEST_LIMIT || '5');                // Max per hour



// ============================================
// OTP Service
// ============================================
//checked
export async function requestOtp(data: RequestOtpInput): Promise<OtpResponse> {
    const { id } = data;

    const existingUser = await UserRepository.findById(id);
    if (!existingUser) {
        throw new ApiError(404, 'User not found for OTP request');
    }
    if (existingUser && existingUser.isEmailVerified) {
        throw new ApiError(400, 'Email already registered. Please login instead.');
    }
    const email = existingUser?.email
    const recentOtpCount = await OtpVerificationRepository.countRecentByEmail(email, 60);
    if (recentOtpCount >= OTP_REQUEST_LIMIT) {
        throw new ApiError(429, 'Too many OTP requests. Please try again after 1 hour.');
    }

    const otp = generateOtp();
    const otpHash = await PasswordRepository.hash(otp);

    await OtpVerificationRepository.create({
        email,
        otpHash,
        otpExpiry: new Date(Date.now() + OTP_EXPIRY),
        expiresAt: new Date(Date.now() + OTP_EXPIRY),
        maxAttempts: OTP_MAX_ATTEMPTS,
    });

    // send otp functionality------------------------------------------------------
    await sendOtpEmail(email, otp);

    return {
        message: 'OTP sent successfully to your email',
        expiresIn: Math.floor(OTP_EXPIRY / 1000),
    };

}

//here user not updated as verified because we want to verify otp first and then complete registration where user will be marked as verified. This is done to handle the case where user requests otp but does not complete registration, so we can keep track of such cases and also allow them to request new otp if needed without any issues.
//checked
export async function verifyOtp(data: VerifyOtpInput, ipAddress?: string, userAgent?: string): Promise<AuthResponse> {
    const { id, otp } = data;
    const user = await UserRepository.findById(id);
    if (!user) {
        throw new ApiError(404, 'User not found for OTP verification');
    }
    const otpRecord = await OtpVerificationRepository.findActiveByEmail(user.email);
    if (!otpRecord) {
        // console.log("No active OTP record found for email:", user.email);
        throw new ApiError(400, 'OTP not found or expired. Please request a new OTP.');
    }

    if (otpRecord.attempts >= otpRecord.maxAttempts) {
        throw new ApiError(429, 'Maximum attempts exceeded. Please request a new OTP.');
    }

    const isValid = await PasswordRepository.compare(otp, otpRecord.otpHash);
    if (!isValid) {
        // console.log("incrementing attempts for otp record id:", otpRecord.id);
        await OtpVerificationRepository.incrementAttempts(otpRecord.id);
        const updatedRecord = await OtpVerificationRepository.findById(otpRecord.id);
        const attemptsLeft = updatedRecord!.maxAttempts - updatedRecord!.attempts;
        throw new ApiError(400, `Invalid OTP. Attempts left: ${attemptsLeft}`);
    }

    await OtpVerificationRepository.markAsVerified(otpRecord.id);
    await UserRepository.verifyEmail(user.id);
    const session = await SessionRepository.create({
        userId: user.id,
        ipAddress: ipAddress || '',
        userAgent: userAgent || '',
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY),
    });
    const refreshTokenString = generateSecureToken();
    const refreshTokenHash = await PasswordRepository.hash(refreshTokenString);

    const refreshToken = generateRefreshTokenJwt(user.id, refreshTokenHash)
    await RefreshTokenRepository.create({
        userId: user.id,
        token: refreshTokenHash,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY),
        sessionId: session.id,
    });



    const accessToken = generateAccessToken(user.id, user.email, user.role);

    await UserRepository.updateLastLogin(user.id);

    return {
        accessToken,
        refreshToken: refreshToken,
        expiresIn: Math.floor(ACCESS_TOKEN_EXPIRY / 1000),
        user: formatUserResponse(user),
    };

}

// ============================================
// Registration Service
// ============================================
//checked 
export async function completeRegistration(
    data: CompleteRegistrationInput,): Promise<any> {


    const { email, password, name, role } = data;

    const existingUser = await UserRepository.findByEmail(email);
    if (existingUser && existingUser.isEmailVerified) {
        throw new ApiError(400, 'Email already registered');
    }
    if (existingUser && !existingUser.isEmailVerified) {
        await UserRepository.deletePermanently(existingUser.id);
    }

    const strengthFeedback = PasswordRepository.getStrengthFeedback(password);
    if (!strengthFeedback.isStrong) {
        throw new ApiError(400, `Weak password. ${strengthFeedback.feedback.join(', ')}`);
    }

    const passwordHash = await PasswordRepository.hash(password);

    const user = await UserRepository.create({ email, passwordHash, name, role });

    //send otp
    const res = await requestOtp({ id: user.id });
    return user;

}

// ============================================
// Login Service
// ============================================

export async function login(
    data: LoginInput,
    ipAddress?: string,
    userAgent?: string
): Promise<AuthResponse> {
    const { email, password } = data;


    const user = await UserRepository.findByEmail(email);
    if (!user || !user.password) {
        throw new ApiError(400, 'Invalid email or password');
    }

    if (!user.isEmailVerified) {
        throw new ApiError(400, 'Email not verified. Please verify your email first.');
    }

    const isValidPassword = await PasswordRepository.compare(password, user.password);
    if (!isValidPassword) {
        throw new ApiError(400, 'Invalid email or password');
    }
    const session = await SessionRepository.create({
        userId: user.id,
        ipAddress: ipAddress || '',
        userAgent: userAgent || '',
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY),
    });
    const refreshTokenString = generateSecureToken();
    const refreshTokenHash = await PasswordRepository.hash(refreshTokenString);
    const refreshToken = generateRefreshTokenJwt(user.id, refreshTokenHash)

    await RefreshTokenRepository.create({
        userId: user.id,
        token: refreshTokenHash,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY),
        sessionId: session.id,
    });



    const accessToken = generateAccessToken(user.id, user.email, user.role);

    await UserRepository.updateLastLogin(user.id);

    return {
        accessToken,
        refreshToken: refreshToken,
        expiresIn: Math.floor(ACCESS_TOKEN_EXPIRY / 1000),
        user: formatUserResponse(user),
    };

}

// ============================================
// Token Refresh Service
// ============================================

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {

    const { userId, refreshTokenHash } = verifyToken(refreshToken);
    // console.log(userId + "-----------------" + refreshTokenHash);
    if (!userId) {
        throw new ApiError(401, 'Invalid refresh token');
    }
    const validToken = await RefreshTokenRepository.findByUserIdOne(userId, refreshTokenHash);
    // console.log(validToken)

    if (!validToken) {
        throw new ApiError(400, 'Invalid or expired refresh token');
    }

    if (validToken.expiresAt < new Date()) {
        throw new ApiError(400, 'Refresh token expired');
    }

    const user = await UserRepository.findById(validToken.userId);
    if (!user) {
        throw new ApiError(400, 'User not found');
    }

    const newRefreshTokenString = generateSecureToken();
    const newRefreshTokenHash = await PasswordRepository.hash(newRefreshTokenString);

    const newRefreshToken = generateRefreshTokenJwt(user.id, newRefreshTokenHash)
    await RefreshTokenRepository.updateAccessToken(
        validToken.id,
        newRefreshTokenHash,
        new Date(Date.now() + REFRESH_TOKEN_EXPIRY),
    );

    const accessToken = generateAccessToken(user.id, user.email, user.role);

    return {
        accessToken,
        refreshToken: newRefreshToken,
        expiresIn: Math.floor(ACCESS_TOKEN_EXPIRY / 1000),
    };

}

// ============================================
// Logout Service
// ============================================

export async function logout(userId: string, refreshToken: string): Promise<void> {

    const tokens = await RefreshTokenRepository.findByUserId(userId);

    for (const token of tokens) {
        const isMatch = await PasswordRepository.compare(refreshToken, token.token);
        if (isMatch && !token.isRevoked) {
            await RefreshTokenRepository.revoke(token.id);
            // Only deactivate the session tied to THIS token
            if (token.sessionId) {
                await SessionRepository.deactivate(token.sessionId);
            }
            break;

        }
    }


}

export async function logoutAllDevices(userId: string): Promise<void> {
    try {
        await RefreshTokenRepository.revokeAllByUserId(userId);
        await SessionRepository.deactivateAllByUserId(userId);
    } catch (error: any) {
        throw new Error(error.message || 'Failed to logout all devices');
    }
}

// ============================================
// Password Management
// ============================================

export async function changePassword(
    userId: string,
    data: ChangePasswordInput
): Promise<void> {
    const { currentPassword, newPassword } = data;


    const user = await UserRepository.findById(userId);
    if (!user || !user.password) {
        throw new ApiError(404, 'User not found');
    }

    const isValidPassword = await PasswordRepository.compare(currentPassword, user.password);
    if (!isValidPassword) {
        throw new ApiError(400, 'Current password is incorrect');
    }

    const strengthFeedback = PasswordRepository.getStrengthFeedback(newPassword);
    if (!strengthFeedback.isStrong) {
        throw new ApiError(400, `Weak password. ${strengthFeedback.feedback.join(', ')}`);
    }

    const newPasswordHash = await PasswordRepository.hash(newPassword);
    await UserRepository.updatePassword(userId, newPasswordHash);
    await logoutAllDevices(userId);

}

export async function getCurrentUser(userId: string): Promise<UserResponse> {
    const user = await UserRepository.findById(userId);
    if (!user) {
        throw new ApiError(404, 'User not found');
    }
    return formatUserResponse(user);
}

export async function getUserSessions(userId: string) {
    return await SessionRepository.findActiveByUserId(userId);
}

export async function revokeSession(sessionId: string, userId: string): Promise<void> {
    const session = await SessionRepository.findById(sessionId);
    if (!session || session.userId !== userId) {
        throw new ApiError(404, 'Session not found');
    }
    await SessionRepository.deactivate(sessionId);

}

// ============================================
// Cleanup & Audit
// ============================================

export async function cleanupExpiredTokens(): Promise<void> {

    const result = await AuthBatchRepository.cleanupExpired();
    console.log('Cleanup completed:', result);

}

export async function getSecurityAudit(userId: string) {

    return await AuthBatchRepository.getSecurityAudit(userId);

}

export async function getUserAuthSummary(userId: string) {

    return await AuthBatchRepository.getUserAuthSummary(userId);

}