// src/api/v1/modules/receipt/receipt.repository.ts
import PrismaClient from '@/prismaClient/index.js';
import type {
    CreateReceiptInput,
    Receipt,
    ReceiptWithRelations,
} from './receipt.schema.js';

/**
 * Repository layer - ONLY database operations
 * No business logic here!
 */

const receiptInclude = {
    customer: {
        select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            town: true,
            balance: true,
        },
    },
    createdBy: {
        select: {
            id: true,
            name: true,
            email: true,
        },
    },
} as const;

export class ReceiptRepository {

    // ============ CREATE ============ used
    static async create(data: CreateReceiptInput & { createdById: string; }): Promise<ReceiptWithRelations> {
        const { createdById, ...receiptData } = data;

        return PrismaClient.$transaction(async (tx) => {
            // 1. Create receipt
            const newReceipt = await tx.receipt.create({
                data: {
                    customerId: receiptData.customerId,
                    amount: receiptData.amount,
                    paymentMode: receiptData.paymentMode,
                    receiptDate: receiptData.receiptDate || new Date(),
                    remarks: receiptData.remarks || null,
                    createdById,
                },
                include: receiptInclude,
            });

            // 2. Reduce customer balance (they owe less now)
            await tx.customer.update({
                where: { id: receiptData.customerId },
                data: {
                    balance: {
                        decrement: receiptData.amount,
                    },
                },
            });

            return newReceipt;
        });
    }

    // ============ READ MANY ============ used
    static async findMany(filters: {
        where: any;
        orderBy: any;
        skip?: number;
        take?: number;
        createdById?: string;
    }): Promise<ReceiptWithRelations[]> {
        const where = {
            ...filters.where,
            ...(filters.createdById ? { createdById: filters.createdById } : {}),
        };

        return PrismaClient.receipt.findMany({
            where,
            orderBy: filters.orderBy,
            ...(filters.skip !== undefined ? { skip: filters.skip } : {}),
            ...(filters.take !== undefined ? { take: filters.take } : {}),
            include: receiptInclude,
        });
    }

    // ============ COUNT ============ used
    static async count(filters: {
        where: any;
        createdById: string;
    }): Promise<number> {
        const where = {
            ...filters.where,
            ...(filters.createdById ? { createdById: filters.createdById } : {}),
        };

        return PrismaClient.receipt.count({ where });
    }

    // ============ AGGREGATE (SUM) ============ used
    static async aggregateSum(filters: {
        where: any;
        createdById: string;
    }): Promise<number> {
        const where = {
            ...filters.where,
            ...(filters.createdById ? { createdById: filters.createdById } : {}),
        };

        const result = await PrismaClient.receipt.aggregate({
            where,
            _sum: { amount: true },
        });

        return result._sum?.amount?.toNumber() || 0;
    }

    // ============ READ ONE ============used
    static async findById(id: string): Promise<ReceiptWithRelations | null> {
        return PrismaClient.receipt.findUnique({
            where: { id },
            include: receiptInclude,
        });
    }

    // ============ READ ONE - MINIMAL ============used
    static async findByIdMinimal(id: string): Promise<Receipt | null> {
        return PrismaClient.receipt.findUnique({
            where: { id },
        });
    }

    // ============ CHECK OWNERSHIP ============
    static async isOwnedBy(receiptId: string, userId: string): Promise<boolean> {
        const count = await PrismaClient.receipt.count({
            where: {
                id: receiptId,
                createdById: userId,
            },
        });
        return count > 0;
    }

    // ============ DELETE ============used
    static async delete(id: string): Promise<void> {
        const receipt = await PrismaClient.receipt.findUnique({
            where: { id },
        });

        if (!receipt) return;

        await PrismaClient.$transaction(async (tx) => {
            // 1. Delete receipt
            await tx.receipt.delete({
                where: { id },
            });

            // 2. Restore customer balance
            await tx.customer.update({
                where: { id: receipt.customerId },
                data: {
                    balance: {
                        increment: receipt.amount,
                    },
                },
            });
        });
    }

    // ============ FIND BY CUSTOMER ============used
    static async findByCustomer(
        customerId: string,
        userId: string
    ): Promise<ReceiptWithRelations[]> {
        return PrismaClient.receipt.findMany({
            where: {
                customerId,
                createdById: userId,
            },
            orderBy: { receiptDate: 'desc' },
            include: receiptInclude,
        });
    }

    // ============ GET DAILY SUMMARY ============
    static async getDailySummary(
        startDate: Date,
        userId: string
    ): Promise<Array<{
        receiptDate: Date;
        amount: any;
        paymentMode: string;
    }>> {
        return PrismaClient.receipt.findMany({
            where: {
                receiptDate: { gte: startDate },
                createdById: userId,
            },
            select: {
                receiptDate: true,
                amount: true,
                paymentMode: true,
            },
            orderBy: { receiptDate: 'asc' },
        });
    }

    // ============ GET CUSTOMER RECEIPTS SUMMARY ============ used
    static async getCustomerReceiptsSummary(
        customerId: string,
        userId: string
    ): Promise<{
        totalReceived: number;
        receiptCount: number;
    }> {
        const result = await PrismaClient.receipt.aggregate({
            where: {
                customerId,
                createdById: userId,
            },
            _sum: { amount: true },
            _count: true,
        });

        return {
            totalReceived: result._sum?.amount?.toNumber() || 0,
            receiptCount: result._count || 0,
        };
    }
}