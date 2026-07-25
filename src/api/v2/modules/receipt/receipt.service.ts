// src/api/v1/modules/receipt/receipt.service.ts
import { ReceiptRepository } from './receipt.repository.js';
import ApiError from '@/helpers/ApiError.js';
import type {
    CreateReceiptInput,
    ListReceiptsInput,
    ReceiptWithRelations,
    DailyReceiptSummary,
} from './receipt.schema.js';
import PrismaClient from '@/prismaClient/index.js';
import type { AuthUser } from '../auth.schema';
import { validPaymentModes } from '../constants.js';
import { CustomerRepository } from '../customers/customer.repository.js';


export interface CustomerLedgerQuery {
    startDate?: string;
    endDate?: string;
    page?: string;
    limit?: string;
}
/**
 * Service layer - Contains all business logic
 * Calls repository for data access
 * 
 * ⚠️ NOTE: All methods receive AuthUser (from middleware)
 */
export class ReceiptService {

    // ============ CREATE RECEIPT ============
    async createReceipt(data: CreateReceiptInput, authUser: AuthUser): Promise<ReceiptWithRelations> {
        // Business logic: Validate customer exists
        const customer = await CustomerRepository.findById(data.customerId, authUser.id);

        if (!customer) {
            throw new ApiError(404, 'Customer not found');
        }

        // Business logic: Validate amount
        if (data.amount.toNumber() <= 0) {
            throw new ApiError(400, 'Receipt amount must be positive');
        }

        // Business logic: Validate payment mode
        if (!validPaymentModes.includes(data.paymentMode)) {
            throw new ApiError(400, `Invalid payment mode. Allowed: ${validPaymentModes.join(', ')}`);
        }

        // Create receipt (with user association)
        return ReceiptRepository.create({
            ...data,
            createdById: authUser.id,
        });
    }

    // ============ GET ALL RECEIPTS ============
    async getReceipts(params: ListReceiptsInput, authUser: AuthUser): Promise<any> {
        const { search, customerId, dateFilter, startDate, endDate, page, limit, sortBy, sortOrder } = params;

        // Build where clause
        const where: any = {};

        // Customer filter
        if (customerId) {
            where.customerId = customerId;
        }

        // Search logic
        if (search) {
            where.OR = [
                { customer: { name: { contains: search, mode: 'insensitive' } } },
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
        } else if (dateFilter && dateFilter !== 'all') {
            dateRange = this.getDateRange(dateFilter);
        }

        if (dateRange) {
            where.receiptDate = dateRange;
        }

        // Sorting
        const sortField = sortBy || 'receiptDate';
        const sortDir = sortOrder === 'asc' ? 'asc' : 'desc';
        const orderBy = { [sortField]: sortDir };

        // Pagination
        const skip = (page - 1) * limit;

        // Get data in parallel
        const [receipts, totalRecords, totalSum] = await Promise.all([
            ReceiptRepository.findMany({
                where,
                orderBy,
                skip,
                take: limit,
                createdById: authUser.id, // ← Filter by user
            }),
            ReceiptRepository.count({
                where,
                createdById: authUser.id,
            }),
            ReceiptRepository.aggregateSum({
                where,
                createdById: authUser.id,
            }),
        ]);

        const totalPages = Math.ceil(totalRecords / limit);

        return {
            receipts,
            meta: {
                page,
                limit,
                totalRecords: totalRecords,
                totalPages,
            },
            summary: {
                receiptsCount: totalRecords,
                totalReceived: totalSum,
            },
        };
    }

    // ============ GET RECEIPT BY ID ============
    async getReceiptById(id: string, authUser: AuthUser): Promise<ReceiptWithRelations> {
        // Validate ID
        if (!id?.trim()) {
            throw new ApiError(400, 'Receipt ID is required');
        }

        const receipt = await ReceiptRepository.findById(id);

        if (!receipt) {
            throw new ApiError(404, 'Receipt not found');
        }

        // ⚠️ SECURITY: Verify user owns this receipt
        if (receipt.createdById !== authUser.id) {
            throw new ApiError(403, 'You do not have access to this receipt');
        }

        return receipt;
    }

    // ============ DELETE RECEIPT ============
    async deleteReceipt(id: string, authUser: AuthUser): Promise<void> {
        // Validate ID
        if (!id?.trim()) {
            throw new ApiError(400, 'Receipt ID is required');
        }

        const receipt = await ReceiptRepository.findByIdMinimal(id);

        if (!receipt) {
            throw new ApiError(400, 'Receipt not found');
        }

        // ⚠️ SECURITY: Verify user owns this receipt
        if (receipt.createdById !== authUser.id) {
            throw new ApiError(403, 'You do not have access to this receipt');
        }

        await ReceiptRepository.delete(id);
    }

    // ============ GET CUSTOMER RECEIPTS ============
    async getCustomerReceipts(customerId: string, authUser: AuthUser): Promise<any> {
        // Validate customer ID
        if (!customerId?.trim()) {
            throw new ApiError(400, 'Customer ID is required');
        }

        // Verify customer exists
        const customer = await PrismaClient.customer.findUnique({
            where: { id: customerId },
        });

        if (!customer) {
            throw new ApiError(404, 'Customer not found');
        }

        // Get receipts (only user's receipts)
        const receipts = await ReceiptRepository.findByCustomer(customerId, authUser.id);

        // Get summary
        const { totalReceived, receiptCount } = await ReceiptRepository.getCustomerReceiptsSummary(
            customerId,
            authUser.id
        );

        return {
            customer: {
                id: customer.id,
                name: customer.name,
                email: customer.email,
                phone: customer.phone,
                balance: customer.balance,
            },
            receipts,
            summary: {
                totalReceived,
                totalReceipts: receiptCount,
            }
        };
    }


    // ============ GET CUSTOMER LEDGER ============
    async getCustomerLedger(
        id: string,
        query: CustomerLedgerQuery,
        authUser: AuthUser
    ): Promise<any> {
        if (!id?.trim()) {
            throw new ApiError(400, 'Customer ID is required');
        }

        const customer = await CustomerRepository.findById(id, authUser.id);
        if (!customer) {
            throw new ApiError(404, 'Customer not found');
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
        const prevAggregates = await ReceiptRepository.getLedgerAggregatesBefore(id, start);
        const balanceBF =
            Number(customer.openingBalance) + prevAggregates.sales - prevAggregates.receipts;

        // 4. Current period transactions
        const { sales, receipts } = await ReceiptRepository.getLedgerTransactionsInRange(
            id,
            start,
            end
        );

        // 5. Merge + running balance
        // Sale = debit (customer owes more), Receipt = credit (customer owes less)
        const ledgerEntries = [
            ...sales.map((s) => ({
                date: s.saleDate,
                type: 'SALE',
                desc: `Inv #${s.invoiceNo}`,
                debit: Number(s.totalAmount),
                credit: 0,
            })),
            ...receipts.map((r) => ({
                remarks: r.remarks,
                date: r.receiptDate,
                type: r.paymentMode === 'Discount' ? r.paymentMode : 'RECEIPT',
                desc: r.paymentMode,
                debit: 0,
                credit: Number(r.amount),
            })),
        ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        let runningBal = balanceBF;
        const fullLedger = ledgerEntries.map((e) => {
            runningBal = runningBal + e.debit - e.credit;
            return { ...e, runningBalance: parseFloat(runningBal.toFixed(2)) };
        });

        // 6. Paginate merged result
        const total = fullLedger.length;
        const paginatedLedger = fullLedger.slice(skip, skip + limit);

        return {
            customerName: customer.name,
            balanceBF: parseFloat(balanceBF.toFixed(2)),
            currentBalance: Number(customer.balance),
            ledger: paginatedLedger,
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

    // // ============ GET DAILY RECEIPT SUMMARY ============
    // async getDailyReceiptSummary(days: number, authUser: AuthUser): Promise<DailyReceiptSummary[]> {
    //     // Validate days
    //     const numDays = Math.min(Math.max(1, days), 365); // Between 1-365 days

    //     const startDate = new Date();
    //     startDate.setDate(startDate.getDate() - numDays);

    //     // Get receipts from repository
    //     const receipts = await ReceiptRepository.getDailySummary(startDate, authUser.id);

    //     // Group by date
    //     const dailySummary: {
    //         [key: string]: {
    //             date: string;
    //             totalAmount: number;
    //             count: number;
    //             byPaymentMode: Record<string, number>;
    //         };
    //     } = {};

    //     receipts.forEach((receipt) => {
    //         const dateKey = receipt.receiptDate.toISOString().split('T')[0];

    //         if (!dailySummary[dateKey]) {
    //             dailySummary[dateKey] = {
    //                 date: dateKey,
    //                 totalAmount: 0,
    //                 count: 0,
    //                 byPaymentMode: {},
    //             };
    //         }

    //         const amount = receipt.amount.toNumber();
    //         dailySummary[dateKey].totalAmount += amount;
    //         dailySummary[dateKey].count += 1;

    //         const mode = receipt.paymentMode;
    //         if (!dailySummary[dateKey].byPaymentMode[mode]) {
    //             dailySummary[dateKey].byPaymentMode[mode] = 0;
    //         }
    //         dailySummary[dateKey].byPaymentMode[mode] += amount;
    //     });

    //     return Object.values(dailySummary).sort((a, b) => a.date.localeCompare(b.date));
    // }

    // ============ HELPER: Get Date Range ============
    private getDateRange(filter: string): { gte?: Date; lte?: Date } | undefined {
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
}