import crypto from 'crypto';
import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import type { UserResponse, User } from "@/api/v2/modules/auth/auth.schema.js";
import ApiError from './ApiError.js';


const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
export function generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex');
}

export function generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// ============================================
// Email Transporter
// ============================================

export const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
    },
});

export async function sendOtpEmail(email: string, otp: string): Promise<void> {
    const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to: email,
        subject: 'Your One-Time Password (OTP)',
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Verify Your Email</h2>
        <p style="color: #666; font-size: 16px;">Your one-time password (OTP) is:</p>
        <div style="background-color: #f5f5f5; padding: 20px; border-radius: 5px; text-align: center; margin: 20px 0;">
          <h1 style="color: #2563eb; letter-spacing: 2px; margin: 0;">${otp}</h1>
        </div>
        <p style="color: #666;">
          <strong>This OTP expires in 15 minutes.</strong>
        </p>
        <p style="color: #999; font-size: 12px;">
          Do not share this code with anyone. We will never ask you for this code.
        </p>
      </div>
    `,
    };

    try {
        // await transporter.sendMail(mailOptions);
        console.log(`OTP email sent to ${email} with OTP: ${otp}`);
        return
    } catch (error) {
        console.error('Error sending OTP email:', error);
        throw new ApiError(500, 'Failed to send OTP email');
    }
}

export function generateAccessToken(userId: string, email: string, role: string): string {
    return jwt.sign(
        { userId, email, role, type: 'access' },
        JWT_SECRET,
        { expiresIn: '15m' }
    );
}

export function generateRefreshTokenJwt(userId: string, refreshTokenHash: string): string {
    return jwt.sign(
        { userId, refreshTokenHash, type: 'refresh' },
        JWT_SECRET,
        { expiresIn: '30d' }
    );
}

export function verifyToken(token: string): any {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch {
        throw new Error('Invalid or expired token');
    }
}

export function formatUserResponse(user: User): UserResponse {
    return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isOnboarded: user.isOnboarded,
        isEmailVerified: user.isEmailVerified,
    };
}