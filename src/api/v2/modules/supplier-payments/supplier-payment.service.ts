// src/api/v1/modules/supplier-payment/supplier-payment.service.ts
import { SupplierPaymentRepository } from './supplier-payment.repository.js';
import ApiError from '@/helpers/ApiError.js';
import type {
    CreateSupplierPaymentInput,
    UpdateSupplierPaymentInput,
    ListSupplierPaymentsInput,
    SupplierPaymentWithRelations,
    DailyPaymentSummary,
    SupplierPaymentStats,
} from './supplier-payment.schema.js';
import PrismaClient from '@/prismaClient/index.js';
import type { AuthUser } from '../auth.schema.js';
import { validPaymentModes } from "../constants.js"
/**
 * Service layer - Contains all business logic
 * Calls repository for data access
 * 
 * ⚠️ NOTE: All methods receive AuthUser (from middleware)
 * This ensures data isolation per user
 */
export class SupplierPaymentService {

    // ============ CREATE SUPPLIER PAYMENT ============
    async createSupplierPayment(
        data: CreateSupplierPaymentInput,
        authUser: AuthUser
    ): Promise<SupplierPaymentWithRelations> {
        // Business logic: Validate supplier exists
        const supplier = await PrismaClient.supplier.findUnique({
            where: { id: data.supplierId },
        });

        if (!supplier) {
            throw new ApiError(404, 'Supplier not found');
        }

        // ⚠️ SECURITY: Verify user owns this supplier
        const isOwned = await SupplierPaymentRepository.isSupplierOwnedBy(
            data.supplierId,
            authUser.id
        );
        if (!isOwned) {
            throw new ApiError(403, 'You do not have access to this supplier');
        }

        // Business logic: Validate amount
        if (data.amount.toNumber() <= 0) {
            throw new ApiError(400, 'Payment amount must be positive');
        }

        // Business logic: Validate payment mode
        if (!validPaymentModes.includes(data.paymentMode)) {
            throw new ApiError(400, `Invalid payment mode. Allowed: ${validPaymentModes.join(', ')}`);
        }

        // Create payment (with user association)
        return SupplierPaymentRepository.create({
            ...data,
            createdById: authUser.id,
        });
    }

    // ============ GET ALL SUPPLIER PAYMENTS ============
    async getSupplierPayments(
        params: ListSupplierPaymentsInput,
        authUser: AuthUser
    ): Promise<any> {
        const { search, supplierId, paymentMode, startDate, endDate, page, limit, sortBy, sortOrder } = params;

        // Build where clause
        const where: any = {};

        // Supplier filter
        if (supplierId) {
            where.supplierId = supplierId;
        }

        // Payment mode filter
        if (paymentMode) {
            where.paymentMode = paymentMode;
        }

        // Search logic
        if (search) {
            where.OR = [
                { supplier: { name: { contains: search, mode: 'insensitive' } } },
                { reference: { contains: search, mode: 'insensitive' } },
                { remarks: { contains: search, mode: 'insensitive' } },
                { paymentMode: { contains: search, mode: 'insensitive' } },
            ];
        }

        // Date filtering
        let dateRange: { gte?: Date; lte?: Date } | undefined;

        if (startDate || endDate) {
            dateRange = {
                ...(startDate ? { gte: new Date(startDate) } : {}),
                ...(endDate ? { lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)) } : {}),
            };
        } else {
            // Default: Current Month
            const now = new Date();
            const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            dateRange = { gte: currentMonth, lte: nextMonth };
        }

        if (dateRange) {
            where.paymentDate = dateRange;
        }

        // Sorting
        const sortField = sortBy || 'paymentDate';
        const sortDir = sortOrder === 'asc' ? 'asc' : 'desc';
        const orderBy = { [sortField]: sortDir };

        // Pagination
        const skip = (page - 1) * limit;

        // Get data in parallel
        const [payments, total, totalSum] = await Promise.all([
            SupplierPaymentRepository.findMany({
                where,
                orderBy,
                skip,
                take: limit,
                createdById: authUser.id, // ← Filter by user
            }),
            SupplierPaymentRepository.count({
                where,
                createdById: authUser.id,
            }),
            SupplierPaymentRepository.aggregateSum({
                where,
                createdById: authUser.id,
            }),
        ]);

        const totalPages = Math.ceil(total / limit);

        return {
            payments,
            meta: {
                page,
                limit,
                totalRecords: total,
                totalPages: totalPages,
            },
            summary: {
                totalAmount: totalSum,

            }
        };
    }

    // ============ GET SUPPLIER PAYMENT BY ID ============
    async getSupplierPaymentById(id: string, authUser: AuthUser): Promise<SupplierPaymentWithRelations> {
        // Validate ID
        if (!id?.trim()) {
            throw new ApiError(400, "Payment ID is required");
        }

        const payment = await SupplierPaymentRepository.findById(id);

        if (!payment) {
            throw new ApiError(404, "Payment not found");
        }

        // ⚠️ SECURITY: Verify user owns this payment
        if (payment.createdById !== authUser.id) {
            throw new ApiError(403, "You do not have access to this payment");
        }

        return payment;
    }

    // ============ UPDATE SUPPLIER PAYMENT ============
    async updateSupplierPayment(
        id: string,
        data: UpdateSupplierPaymentInput,
        authUser: AuthUser
    ): Promise<SupplierPaymentWithRelations> {
        // Validate ID
        if (!id?.trim()) {
            throw new ApiError(400, "Invalid payment ID");
        }

        const existingPayment = await SupplierPaymentRepository.findByIdMinimal(id);
        if (!existingPayment) {
            throw new ApiError(404, "Payment not found");
        }

        // ⚠️ SECURITY: Verify user owns this payment
        if (existingPayment.createdById !== authUser.id) {
            throw new ApiError(403, "You do not have access to this payment");
        }

        // Business logic: If supplier is being updated, verify ownership
        if (data.supplierId) {
            const isSupplierOwned = await SupplierPaymentRepository.isSupplierOwnedBy(
                data.supplierId,
                authUser.id
            );
            if (!isSupplierOwned) {
                throw new ApiError(403, "You do not have access to this supplier");
            }
        }

        // Business logic: Validate payment mode if provided
        if (data.paymentMode) {
            if (!validPaymentModes.includes(data.paymentMode)) {
                throw new ApiError(400, `Invalid payment mode. Allowed: ${validPaymentModes.join(', ')}`);
            }
        }

        // Update the payment
        return SupplierPaymentRepository.update(id, data);
    }

    // ============ DELETE SUPPLIER PAYMENT ============
    async deleteSupplierPayment(id: string, authUser: AuthUser): Promise<void> {
        // Validate ID
        if (!id?.trim()) {
            throw new ApiError(400, "Invalid payment ID");
        }

        const existingPayment = await SupplierPaymentRepository.findByIdMinimal(id);
        if (!existingPayment) {
            throw new ApiError(404, "Payment not found");
        }

        // ⚠️ SECURITY: Verify user owns this payment
        if (existingPayment.createdById !== authUser.id) {
            throw new ApiError(403, "You do not have access to this payment");
        }

        // Delete the payment
        await SupplierPaymentRepository.delete(id);
    }

    // ============ GET SUPPLIER PAYMENTS ============
    async getSupplierPaymentsBySupplier(supplierId: string, authUser: AuthUser): Promise<any> {
        // Validate supplier ID
        if (!supplierId?.trim()) {
            throw new ApiError(400, "Supplier ID is required");
        }

        // Verify supplier exists and user owns it
        const supplier = await PrismaClient.supplier.findUnique({
            where: { id: supplierId },
        });

        if (!supplier) {
            throw new ApiError(404, "Supplier not found");
        }

        if (supplier.createdById !== authUser.id) {
            throw new ApiError(403, "You do not have access to this supplier");
        }

        // Get payments
        const payments = await SupplierPaymentRepository.findBySupplier(supplierId, authUser.id);

        // Get summary
        const { totalAmount, paymentCount } = await SupplierPaymentRepository.getSupplierPaymentsSummary(
            supplierId,
            authUser.id
        );

        return {
            supplier: {
                id: supplier.id,
                name: supplier.name,
                email: supplier.email,
                phone: supplier.phone,
                balance: supplier.balance.toNumber(),
            },
            payments,
            totalPaid: totalAmount,
            paymentCount,
        };
    }

    // ============ GET DAILY PAYMENT SUMMARY ============
    // async getDailyPaymentSummary(days: number, authUser: AuthUser): Promise<DailyPaymentSummary[]> {
    //     // Validate days
    //     const numDays = Math.min(Math.max(1, days), 365);

    //     const startDate = new Date();
    //     startDate.setDate(startDate.getDate() - numDays);

    //     // Get payments from repository
    //     const payments = await SupplierPaymentRepository.getDailySummary(startDate, authUser.userId);

    //     // Group by date
    //     const dailySummary: {
    //         [key: string]: {
    //             date: string;
    //             totalAmount: number;
    //             count: number;
    //             byPaymentMode: Record<string, number>;
    //         };
    //     } = {};

    //     payments.forEach((payment) => {
    //         const dateKey = payment.paymentDate.toISOString().split('T')[0];

    //         if (!dailySummary[dateKey]) {
    //             dailySummary[dateKey] = {
    //                 date: dateKey,
    //                 totalAmount: 0,
    //                 count: 0,
    //                 byPaymentMode: {},
    //             };
    //         }

    //         const amount = payment.amount.toNumber();
    //         dailySummary[dateKey].totalAmount += amount;
    //         dailySummary[dateKey].count += 1;

    //         const mode = payment.paymentMode;
    //         if (!dailySummary[dateKey].byPaymentMode[mode]) {
    //             dailySummary[dateKey].byPaymentMode[mode] = 0;
    //         }
    //         dailySummary[dateKey].byPaymentMode[mode] += amount;
    //     });

    //     return Object.values(dailySummary).sort((a, b) => a.date.localeCompare(b.date));
    // }

    // ============ GET PAYMENT STATISTICS ============
    // async getPaymentStats(days: number, authUser: AuthUser): Promise<SupplierPaymentStats | null> {
    //     // This is used for general stats across all payments
    //     // Not specific to a supplier
    //     const numDays = Math.min(Math.max(1, days), 365);

    //     const startDate = new Date();
    //     startDate.setDate(startDate.getDate() - numDays);

    //     const summary = await this.getDailyPaymentSummary(numDays, authUser);

    //     const totalAmount = summary.reduce((sum, day) => sum + day.totalAmount, 0);
    //     const totalCount = summary.reduce((sum, day) => sum + day.count, 0);
    //     const averageAmount = totalCount > 0 ? totalAmount / totalCount : 0;

    //     // Group by payment mode
    //     const byPaymentMode: Record<string, number> = {};
    //     summary.forEach((day) => {
    //         Object.entries(day.byPaymentMode).forEach(([mode, amount]) => {
    //             byPaymentMode[mode] = (byPaymentMode[mode] || 0) + amount;
    //         });
    //     });

    //     return {
    //         supplierId: 'all',
    //         supplierName: 'All Suppliers',
    //         totalAmount,
    //         paymentCount: totalCount,
    //         averageAmount,
    //         period: `${numDays} days`,
    //         byPaymentMode,
    //     };
    // }
}