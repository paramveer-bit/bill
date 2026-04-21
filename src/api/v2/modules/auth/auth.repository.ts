import PrismaClient from '@/prismaClient/index.js';
import bcrypt from 'bcrypt';
import type {
    User,
    RefreshToken,
    Session,
    OtpVerification,
} from './auth.schema.js';

// ============================================
// User Repository
// ============================================

export class UserRepository {
    //used
    static async findById(id: string): Promise<User | null> {
        return PrismaClient.user.findUnique({
            where: { id },
            include: {
                refreshTokens: {
                    where: { isRevoked: false, expiresAt: { gt: new Date() } },
                    select: { id: true, expiresAt: true },
                },
                sessions: {
                    where: { isActive: true },
                    select: { id: true, createdAt: true, ipAddress: true, userAgent: true },
                },
            },
        });
    }

    // used
    static async findByEmail(email: string): Promise<User | null> {
        return PrismaClient.user.findUnique({
            where: { email },
        });
    }



    static async findByIdWithDetails(id: string): Promise<User | null> {
        return PrismaClient.user.findUnique({
            where: { id },
            include: {
                refreshTokens: true,
                sessions: true,
            },
        });
    }

    static async create(data: {
        email: string;
        passwordHash: string;
        name: string;
        role: string;
    }): Promise<User> {
        return PrismaClient.user.create({
            data: {
                email: data.email,
                password: data.passwordHash,
                name: data.name,
                role: data.role,
                isEmailVerified: false,
                isOnboarded: false,
            },
        });
    }

    // static async upsert(data: {
    //     email: string;
    //     passwordHash?: string;
    //     name?: string;
    //     role?: string;
    // }): Promise<User> {
    //     return PrismaClient.user.upsert({
    //         where: { email: data.email },
    //         update: {
    //             password: data.passwordHash,
    //             name: data.name,
    //             role: data.role,
    //             isEmailVerified: true,
    //         },
    //         create: {
    //             email: data.email,
    //             password: data.passwordHash,
    //             name: data.name || '',
    //             role: data.role || 'USER',
    //             isEmailVerified: false,
    //             isOnboarded: false,
    //         },
    //     });
    // }

    static async update(
        id: string,
        data: Partial<{
            email: string;
            password: string;
            name: string;
            role: string;
            isOnboarded: boolean;
            isEmailVerified: boolean;
            lastLoginAt: Date;
            lastPasswordChangeAt: Date;
        }>
    ): Promise<User> {
        return PrismaClient.user.update({
            where: { id },
            data,
        });
    }
    //used
    static async updatePassword(id: string, passwordHash: string): Promise<User> {
        return PrismaClient.user.update({
            where: { id },
            data: {
                password: passwordHash,
                lastPasswordChangeAt: new Date(),
            },
        });
    }

    static async emailExists(email: string): Promise<boolean> {
        const user = await PrismaClient.user.findUnique({
            where: { email },
            select: { id: true },
        });
        return !!user;
    }

    static async isEmailVerified(email: string): Promise<boolean> {
        const user = await PrismaClient.user.findUnique({
            where: { email },
            select: { isEmailVerified: true },
        });
        return user?.isEmailVerified ?? false;
    }

    static async verifyEmail(id: string): Promise<User> {
        return PrismaClient.user.update({
            where: { id },
            data: { isEmailVerified: true },
        });
    }

    static async completeOnboarding(id: string): Promise<User> {
        return PrismaClient.user.update({
            where: { id },
            data: { isOnboarded: true },
        });
    }

    //used
    static async updateLastLogin(id: string): Promise<User> {
        return PrismaClient.user.update({
            where: { id },
            data: { lastLoginAt: new Date() },
        });
    }

    static async count(): Promise<number> {
        return PrismaClient.user.count();
    }

    static async findAll(skip: number = 0, take: number = 10): Promise<User[]> {
        return PrismaClient.user.findMany({
            skip,
            take,
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                isEmailVerified: true,
                isOnboarded: true,
                lastLoginAt: true,
                createdAt: true,
                password: true,
                lastPasswordChangeAt: true,
                updatedAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });
    }

    static async delete(id: string): Promise<User> {
        return PrismaClient.user.update({
            where: { id },
            data: { password: '' },
        });
    }

    static async deletePermanently(id: string): Promise<User> {
        const user = await PrismaClient.user.delete({
            where: { id },
        });
        await PrismaClient.otpVerification.deleteMany({ where: { email: user.email } });
        await PrismaClient.refreshToken.deleteMany({ where: { userId: id } });
        await PrismaClient.session.deleteMany({ where: { userId: id } });
        return user;

    }
}

// ============================================
// Refresh Token Repository
// ============================================

export class RefreshTokenRepository {
    static async create(data: {
        userId: string;
        token: string;
        expiresAt: Date;
        sessionId: string;
    }): Promise<RefreshToken> {
        return PrismaClient.refreshToken.create({
            data: {
                userId: data.userId,
                token: data.token,
                expiresAt: data.expiresAt,
                sessionId: data.sessionId,
            }
        });
    }

    static async findById(id: string): Promise<RefreshToken | null> {
        return PrismaClient.refreshToken.findUnique({
            where: { id },
        });
    }

    //used
    static async findByUserId(userId: string): Promise<RefreshToken[]> {
        return PrismaClient.refreshToken.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });
    }

    static async findActiveByUserId(userId: string): Promise<RefreshToken[]> {
        return PrismaClient.refreshToken.findMany({
            where: {
                userId,
                isRevoked: false,
                expiresAt: { gt: new Date() },
            },
        });
    }

    static async updateAccessToken(id: string, token: string, expiresAt: Date): Promise<RefreshToken> {
        return PrismaClient.refreshToken.update({
            where: { id },
            data: {
                token,
                expiresAt,
            },
        });
    }

    static async update(
        id: string,
        data: Partial<{
            isRevoked: boolean;
            revokedAt: Date;
        }>
    ): Promise<RefreshToken> {
        return PrismaClient.refreshToken.update({
            where: { id },
            data,
        });
    }

    //used
    static async revoke(id: string): Promise<RefreshToken> {
        return PrismaClient.refreshToken.update({
            where: { id },
            data: {
                isRevoked: true,
                revokedAt: new Date(),
            },
        });
    }
    //used
    static async revokeAllByUserId(userId: string) {
        return PrismaClient.refreshToken.updateMany({
            where: { userId, isRevoked: false },
            data: {
                isRevoked: true,
                revokedAt: new Date(),
            },
        });
    }

    static async deleteExpired() {
        return PrismaClient.refreshToken.deleteMany({
            where: { expiresAt: { lt: new Date() } },
        });
    }

    static async countActiveByUserId(userId: string): Promise<number> {
        return PrismaClient.refreshToken.count({
            where: {
                userId,
                isRevoked: false,
                expiresAt: { gt: new Date() },
            },
        });
    }

    //used
    static async findByUserIdOne(
        userId: string,
        token: string
    ): Promise<RefreshToken | null> {
        return PrismaClient.refreshToken.findFirst({
            where: { userId, token, isRevoked: false, expiresAt: { gt: new Date() } },
            orderBy: { createdAt: 'desc' },
        });
    }
}

// ============================================
// OTP Verification Repository
// ============================================

export class OtpVerificationRepository {
    static async create(data: {
        email: string;
        otpHash: string;
        otpExpiry: Date;
        expiresAt: Date;
        maxAttempts: number;
    }): Promise<OtpVerification> {
        await PrismaClient.otpVerification.deleteMany({
            where: { email: data.email, isVerified: false },
        });

        return PrismaClient.otpVerification.create({
            data: {
                email: data.email,
                otpHash: data.otpHash,
                otpExpiry: data.otpExpiry,
                expiresAt: data.expiresAt,
                attempts: 0,
                maxAttempts: data.maxAttempts,
                isVerified: false,
            },
        });
    }

    //used
    static async findById(id: string): Promise<OtpVerification | null> {
        return PrismaClient.otpVerification.findUnique({
            where: { id },
        });
    }

    //used
    static async findActiveByEmail(email: string): Promise<OtpVerification | null> {
        return PrismaClient.otpVerification.findFirst({
            where: {
                email,
                isVerified: false,
                otpExpiry: { gt: new Date() },
            },
        });
    }

    //used
    static async findVerifiedByEmail(email: string): Promise<OtpVerification | null> {
        return PrismaClient.otpVerification.findFirst({
            where: { email, isVerified: true },
        });
    }

    static async update(
        id: string,
        data: Partial<{
            attempts: number;
            isVerified: boolean;
            verifiedAt: Date;
        }>
    ): Promise<OtpVerification> {
        return PrismaClient.otpVerification.update({
            where: { id },
            data,
        });
    }

    //used
    static async markAsVerified(id: string): Promise<OtpVerification> {
        return PrismaClient.otpVerification.update({
            where: { id },
            data: {
                isVerified: true,
                verifiedAt: new Date(),
            },
        });
    }

    //used
    static async incrementAttempts(id: string): Promise<OtpVerification> {
        return PrismaClient.otpVerification.update({
            where: { id },
            data: { attempts: { increment: 1 } },
        });
    }

    static async delete(id: string): Promise<OtpVerification> {
        return PrismaClient.otpVerification.delete({
            where: { id },
        });
    }

    static async deleteExpired() {
        return PrismaClient.otpVerification.deleteMany({
            where: { expiresAt: { lt: new Date() } },
        });
    }

    // used
    static async countRecentByEmail(
        email: string,
        minutesBack: number = 60
    ): Promise<number> {
        const timeAgo = new Date(Date.now() - minutesBack * 60 * 1000);
        return PrismaClient.otpVerification.count({
            where: { email, createdAt: { gte: timeAgo } },
        });
    }

    static async findAll(skip: number = 0, take: number = 10): Promise<OtpVerification[]> {
        return PrismaClient.otpVerification.findMany({
            skip,
            take,
            orderBy: { createdAt: 'desc' },
        });
    }
}

// ============================================
// Session Repository
// ============================================

export class SessionRepository {
    static async create(data: {
        userId: string;
        ipAddress?: string;
        userAgent?: string;
        expiresAt?: Date;
    }): Promise<Session> {
        return PrismaClient.session.create({
            data: {
                userId: data.userId,
                ipAddress: data.ipAddress == null ? null : data.ipAddress,
                userAgent: data.userAgent == null ? null : data.userAgent,
                isActive: true,
                expiresAt: data.expiresAt == null ? null : data.expiresAt,
            },
        });
    }

    static async findById(id: string): Promise<Session | null> {
        return PrismaClient.session.findUnique({
            where: { id },
        });
    }

    //used
    static async findActiveByUserId(userId: string): Promise<Session[]> {
        return PrismaClient.session.findMany({
            where: { userId, isActive: true },
            orderBy: { lastActivityAt: 'desc' },
        });
    }

    static async findByUserId(
        userId: string,
        skip: number = 0,
        take: number = 10
    ): Promise<Session[]> {
        return PrismaClient.session.findMany({
            where: { userId },
            skip,
            take,
            orderBy: { createdAt: 'desc' },
        });
    }

    static async update(
        id: string,
        data: Partial<{
            isActive: boolean;
            lastActivityAt: Date;
        }>
    ): Promise<Session> {
        return PrismaClient.session.update({
            where: { id },
            data,
        });
    }

    static async updateLastActivity(id: string): Promise<Session> {
        return PrismaClient.session.update({
            where: { id },
            data: { lastActivityAt: new Date() },
        });
    }

    //used
    static async deactivate(id: string): Promise<Session> {
        return PrismaClient.session.update({
            where: { id },
            data: { isActive: false },
        });
    }
    //used
    static async deactivateAllByUserId(userId: string) {
        return PrismaClient.session.updateMany({
            where: { userId, isActive: true },
            data: { isActive: false },
        });
    }

    static async deleteExpired() {
        return PrismaClient.session.deleteMany({
            where: { expiresAt: { lt: new Date() } },
        });
    }

    static async countActiveByUserId(userId: string): Promise<number> {
        return PrismaClient.session.count({
            where: { userId, isActive: true },
        });
    }

    static async findByIpAddress(ipAddress: string): Promise<Session[]> {
        return PrismaClient.session.findMany({
            where: { ipAddress },
        });
    }

    static async countMultipleSessionsByIp(ipAddress: string): Promise<number> {
        return PrismaClient.session.count({
            where: { ipAddress, isActive: true },
        });
    }
}

// ============================================
// Batch Operations
// ============================================

export class AuthBatchRepository {
    static async cleanupExpired() {
        const deletedOtps = await OtpVerificationRepository.deleteExpired();
        const deletedTokens = await RefreshTokenRepository.deleteExpired();
        const deletedSessions = await SessionRepository.deleteExpired();

        return { deletedOtps, deletedTokens, deletedSessions };
    }

    static async getUserAuthSummary(userId: string) {
        const user = await UserRepository.findById(userId);
        const activeTokens = await RefreshTokenRepository.countActiveByUserId(userId);
        const activeSessions = await SessionRepository.countActiveByUserId(userId);

        return {
            userId,
            email: user?.email,
            isEmailVerified: user?.isEmailVerified,
            isOnboarded: user?.isOnboarded,
            lastLoginAt: user?.lastLoginAt,
            activeTokens,
            activeSessions,
            role: user?.role,
        };
    }

    static async revokeAllAuth(userId: string) {
        const revokedTokens = await RefreshTokenRepository.revokeAllByUserId(userId);
        const deactivatedSessions = await SessionRepository.deactivateAllByUserId(userId);

        return {
            revokedTokensCount: revokedTokens.count,
            deactivatedSessionsCount: deactivatedSessions.count,
        };
    }

    static async getSecurityAudit(userId: string) {
        const user = await UserRepository.findByIdWithDetails(userId);
        const sessions = await SessionRepository.findByUserId(userId);
        const tokens = await RefreshTokenRepository.findByUserId(userId);

        return {
            userId,
            user: {
                email: user?.email,
                lastPasswordChangeAt: user?.lastPasswordChangeAt,
                lastLoginAt: user?.lastLoginAt,
            },
            sessions: sessions.map((s) => ({
                id: s.id,
                ipAddress: s.ipAddress,
                userAgent: s.userAgent,
                isActive: s.isActive,
                createdAt: s.createdAt,
                lastActivityAt: s.lastActivityAt,
                expiresAt: s.expiresAt,
            })),
            tokens: tokens.map((t) => ({
                id: t.id,
                isRevoked: t.isRevoked,
                expiresAt: t.expiresAt,
                revokedAt: t.revokedAt,
                createdAt: t.createdAt,
            })),
        };
    }
}

// ============================================
// Password Repository
// ============================================

export class PasswordRepository {

    // used
    static async hash(password: string, rounds: number = 10): Promise<string> {
        return bcrypt.hash(password, rounds);
    }

    static async compare(password: string, hash: string): Promise<boolean> {
        return bcrypt.compare(password, hash);
    }

    static isStrong(password: string): boolean {
        return (
            password.length >= 8 &&
            /[A-Z]/.test(password) &&
            /[a-z]/.test(password) &&
            /\d/.test(password) &&
            /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
        );
    }

    static getStrengthFeedback(password: string): { isStrong: boolean; feedback: string[] } {
        const feedback: string[] = [];

        if (password.length < 8) feedback.push('Password must be at least 8 characters long');
        if (!/[A-Z]/.test(password)) feedback.push('Password must contain at least one uppercase letter');
        if (!/[a-z]/.test(password)) feedback.push('Password must contain at least one lowercase letter');
        if (!/\d/.test(password)) feedback.push('Password must contain at least one number');
        if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
            feedback.push('Password must contain at least one special character');
        }

        return { isStrong: feedback.length === 0, feedback };
    }
}

export default {
    user: UserRepository,
    refreshToken: RefreshTokenRepository,
    otpVerification: OtpVerificationRepository,
    session: SessionRepository,
    batch: AuthBatchRepository,
    password: PasswordRepository,
};