// src/api/v1/modules/supplier-payment/supplier-payment.service.ts
import { SupplierPaymentRepository } from './supplier-payment.repository.js';
import ApiError from '@/helpers/ApiError.js';
import { SupplierRepository } from '../suppliers/supplier.repository.js';

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

// ── Date range helper ─────────────────────────────────────────────────────────
function getDateRange(filter: string): { gte?: Date; lte?: Date } | undefined {
    const now = new Date();

    switch (filter) {
        case '1day': {
            const gte = new Date(now);
            gte.setDate(gte.getDate() - 1);
            return { gte };
        }
        case 'week': {
            const gte = new Date(now);
            gte.setDate(gte.getDate() - 7);
            return { gte };
        }
        case 'month': {
            const gte = new Date(now.getFullYear(), now.getMonth(), 1);
            const lte = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            return { gte, lte };
        }
        case 'prevmonth': {
            const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
            const m = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
            const gte = new Date(y, m, 1);
            const lte = new Date(y, m + 1, 0, 23, 59, 59, 999);
            return { gte, lte };
        }
        case 'quarter': {
            const q = Math.floor(now.getMonth() / 3);
            const gte = new Date(now.getFullYear(), q * 3, 1);
            const lte = new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999);
            return { gte, lte };
        }
        default:
            return undefined;
    }
}

export interface SupplierLedgerQuery {
    startDate?: string;
    endDate?: string;
    page?: string;
    limit?: string;
}

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
                totalCount: total,
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



    async getSupplierLedger(
        id: string,
        query: SupplierLedgerQuery,
        authUser: AuthUser
    ): Promise<any> {
        // Business logic: Validate ID
        if (!id?.trim()) {
            throw new ApiError(400, 'Supplier ID is required');
        }

        // Verify supplier exists
        const supplier = await SupplierRepository.findByIdMinimal(id);
        if (!supplier) {
            throw new ApiError(404, 'Supplier not found');
        }

        // ⚠️ SECURITY: Verify user owns this supplier (was missing in original)
        if (supplier.createdById !== authUser.id) {
            throw new ApiError(403, 'You do not have access to this supplier');
        }

        // 1. Pagination
        const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10) || 20));
        const skip = (page - 1) * limit;

        // 2. Default date range (Indian FY: April 1 start)
        const now = new Date();
        const currentYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
        const defaultStartDate = new Date(currentYear, 3, 1);

        const start = query.startDate ? new Date(query.startDate) : defaultStartDate;
        const end = query.endDate ? new Date(query.endDate) : new Date();
        end.setHours(23, 59, 59, 999);

        // 3. Balance B/F
        const prevAggregates = await SupplierPaymentRepository.getLedgerAggregatesBefore(id, start);
        const balanceBF =
            Number(supplier.openingBalance) + prevAggregates.purchases - prevAggregates.payments;

        // 4. Current period transactions
        const { purchases, payments } = await SupplierPaymentRepository.getLedgerTransactionsInRange(
            id,
            start,
            end
        );

        // 5. Merge + running balance
        const allTransactions = [
            ...purchases.map((p) => ({
                date: p.purchaseDate,
                type: 'PURCHASE',
                desc: `Purchase Invoice #${p.invoiceNo || p.id}`,
                credit: Number(p.totalAmount) || 0,
                debit: 0,
                id: `purchase-${p.id}`,
            })),
            ...payments.map((p) => ({
                date: p.paymentDate,
                type: p.paymentMode === 'Credit Note' ? p.paymentMode : 'PAYMENT',
                desc: `Payment ${p.paymentMode}${p.checkNo ? ` - Chq #${p.checkNo}` : p.reference ? ` - ${p.reference}` : ''
                    }`,
                credit: 0,
                debit: Number(p.amount) || 0,
                id: `payment-${p.id}`,
                remarks: p.remarks,
            })),
        ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        let runningBalance = balanceBF;
        const fullLedger = allTransactions.map((txn) => {
            runningBalance = runningBalance + txn.debit - txn.credit;
            return { ...txn, runningBalance: parseFloat(runningBalance.toFixed(2)) };
        });

        // 6. Paginate merged result
        const total = fullLedger.length;
        const paginatedLedger = fullLedger.slice(skip, skip + limit);

        // 7. Period summary
        const totalPurchases = purchases.reduce((sum, p) => sum + (Number(p.totalAmount) || 0), 0);
        const totalPayments = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

        // 8. Return assembled result (controller just wraps this in ApiResponse)
        return {
            supplierName: supplier.name,
            gstNumber: supplier.gstNumber,
            balanceBF: parseFloat(balanceBF.toFixed(2)),
            currentBalance: Number(supplier.balance),
            ledger: paginatedLedger,
            summary: {
                totalPurchases: parseFloat(totalPurchases.toFixed(2)),
                totalPayments: parseFloat(totalPayments.toFixed(2)),
                periodChange: parseFloat((totalPurchases - totalPayments).toFixed(2)),
            },
            meta: {
                page,
                limit,
                totalRecords: total,
                totalPages: Math.ceil(total / limit),
                dateRange: {
                    start: start.toISOString().split('T')[0],
                    end: end.toISOString().split('T')[0],
                },
            },
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