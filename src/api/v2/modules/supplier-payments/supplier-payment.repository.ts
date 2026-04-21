// src/api/v1/modules/supplier-payment/supplier-payment.repository.ts
import PrismaClient from '@/prismaClient/index.js';
import { Decimal } from 'decimal.js';
import type {
    CreateSupplierPaymentInput,
    SupplierPayment,
    SupplierPaymentWithRelations,
    UpdateSupplierPaymentInput
} from './supplier-payment.schema.js';

/**
 * Repository layer - ONLY database operations
 * No business logic here!
 */

const supplierPaymentInclude = {
    supplier: {
        select: {
            id: true,
            name: true,
            email: true,
            phone: true,
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

export class SupplierPaymentRepository {

    // ============ CREATE ============used
    static async create(
        data: CreateSupplierPaymentInput & {
            createdById: string;
        }
    ): Promise<SupplierPaymentWithRelations> {
        const { createdById, ...paymentData } = data;

        return PrismaClient.$transaction(async (tx) => {
            // 1. Create payment
            const newPayment = await tx.supplierPayment.create({
                data: {
                    supplierId: paymentData.supplierId,
                    amount: new Decimal(paymentData.amount),
                    paymentMode: paymentData.paymentMode,
                    paymentDate: paymentData.paymentDate || new Date(),
                    checkNo: paymentData.checkNo || null,
                    transactionId: paymentData.transactionId || null,
                    remarks: paymentData.remarks || null,
                    reference: paymentData.reference || null,
                    createdById,
                },
                include: supplierPaymentInclude,
            });

            // 2. Reduce supplier balance by payment amount
            await tx.supplier.update({
                where: { id: paymentData.supplierId },
                data: {
                    balance: {
                        decrement: new Decimal(paymentData.amount),
                    },
                },
            });

            return newPayment;
        });
    }

    // ============ READ MANY ============ used
    static async findMany(filters: {
        where: any;
        orderBy: any;
        skip?: number;
        take?: number;
        createdById?: string;
    }): Promise<SupplierPaymentWithRelations[]> {
        const where = {
            ...filters.where,
            ...(filters.createdById ? { createdById: filters.createdById } : {}),
        };

        return PrismaClient.supplierPayment.findMany({
            where,
            orderBy: filters.orderBy,
            ...(filters.skip !== undefined ? { skip: filters.skip } : {}),
            ...(filters.take !== undefined ? { take: filters.take } : {}),
            include: supplierPaymentInclude,
        });
    }

    // ============ COUNT ============used
    static async count(filters: {
        where: any;
        createdById?: string;
    }): Promise<number> {
        const where = {
            ...filters.where,
            ...(filters.createdById ? { createdById: filters.createdById } : {}),
        };

        return PrismaClient.supplierPayment.count({ where });
    }

    // ============ AGGREGATE (SUM) ============ used
    static async aggregateSum(filters: {
        where: any;
        createdById?: string;
    }): Promise<number> {
        const where = {
            ...filters.where,
            ...(filters.createdById ? { createdById: filters.createdById } : {}),
        };

        const result = await PrismaClient.supplierPayment.aggregate({
            where,
            _sum: { amount: true },
        });

        return result._sum?.amount?.toNumber() || 0;
    }

    // ============ READ ONE ============used
    static async findById(id: string): Promise<SupplierPaymentWithRelations | null> {
        return PrismaClient.supplierPayment.findUnique({
            where: { id },
            include: supplierPaymentInclude,
        });
    }

    // ============ READ ONE - MINIMAL ============
    static async findByIdMinimal(id: string): Promise<SupplierPayment | null> {
        return PrismaClient.supplierPayment.findUnique({
            where: { id },
        });
    }

    // ============ CHECK OWNERSHIP ============
    static async isOwnedBy(paymentId: string, userId: string): Promise<boolean> {
        const count = await PrismaClient.supplierPayment.count({
            where: {
                id: paymentId,
                createdById: userId,
            },
        });
        return count > 0;
    }

    // ============ UPDATE ============ used
    static async update(
        id: string,
        data: UpdateSupplierPaymentInput
    ): Promise<SupplierPaymentWithRelations> {
        const oldPayment = await PrismaClient.supplierPayment.findUnique({
            where: { id },
            select: { supplierId: true, amount: true },
        });

        if (!oldPayment) {
            throw new Error('Payment not found');
        }

        const updateData: any = {};

        // Build update data
        if (data.supplierId !== undefined) {
            updateData.supplierId = data.supplierId;
        }
        if (data.amount !== undefined) {
            updateData.amount = new Decimal(data.amount);
        }
        if (data.paymentDate !== undefined) {
            updateData.paymentDate = data.paymentDate;
        }
        if (data.paymentMode !== undefined) {
            updateData.paymentMode = data.paymentMode;
        }
        if (data.checkNo !== undefined) {
            updateData.checkNo = data.checkNo;
        }
        if (data.transactionId !== undefined) {
            updateData.transactionId = data.transactionId;
        }
        if (data.remarks !== undefined) {
            updateData.remarks = data.remarks;
        }
        if (data.reference !== undefined) {
            updateData.reference = data.reference;
        }

        return PrismaClient.$transaction(async (tx) => {
            // Update payment
            const updatedPayment = await tx.supplierPayment.update({
                where: { id },
                data: updateData,
                include: supplierPaymentInclude,
            });

            // If amount changed, adjust supplier balance
            if (data.amount !== undefined && data.amount.toNumber() !== oldPayment.amount.toNumber()) {
                const oldAmount = new Decimal(oldPayment.amount);
                const newAmount = new Decimal(data.amount);
                const difference = oldAmount.minus(newAmount);

                await tx.supplier.update({
                    where: { id: oldPayment.supplierId },
                    data: {
                        balance: {
                            increment: difference,
                        },
                    },
                });
            }

            return updatedPayment;
        });
    }

    // ============ DELETE ============ used
    static async delete(id: string): Promise<void> {
        const payment = await PrismaClient.supplierPayment.findUnique({
            where: { id },
        });

        if (!payment) return;

        await PrismaClient.$transaction(async (tx) => {
            // Delete payment
            await tx.supplierPayment.delete({
                where: { id },
            });

            // Restore supplier balance
            await tx.supplier.update({
                where: { id: payment.supplierId },
                data: {
                    balance: {
                        increment: payment.amount,
                    },
                },
            });
        });
    }

    // ============ FIND BY SUPPLIER ============ used
    static async findBySupplier(
        supplierId: string,
        userId: string
    ): Promise<SupplierPaymentWithRelations[]> {
        return PrismaClient.supplierPayment.findMany({
            where: {
                supplierId,
                createdById: userId,
            },
            orderBy: { paymentDate: 'desc' },
            include: supplierPaymentInclude,
        });
    }

    // ============ GET DAILY SUMMARY ============
    static async getDailySummary(
        startDate: Date,
        userId: string
    ): Promise<Array<{
        paymentDate: Date;
        amount: any;
        paymentMode: string;
    }>> {
        return PrismaClient.supplierPayment.findMany({
            where: {
                paymentDate: { gte: startDate },
                createdById: userId,
            },
            select: {
                paymentDate: true,
                amount: true,
                paymentMode: true,
            },
            orderBy: { paymentDate: 'asc' },
        });
    }

    // ============ GET SUPPLIER PAYMENTS SUMMARY ============ used
    static async getSupplierPaymentsSummary(
        supplierId: string,
        userId: string
    ): Promise<{
        totalAmount: number;
        paymentCount: number;
    }> {
        const result = await PrismaClient.supplierPayment.aggregate({
            where: {
                supplierId,
                createdById: userId,
            },
            _sum: { amount: true },
            _count: true,
        });

        return {
            totalAmount: result._sum?.amount?.toNumber() || 0,
            paymentCount: result._count || 0,
        };
    }

    // ============ CHECK SUPPLIER OWNERSHIP ============ used
    // Verify user owns the supplier
    static async isSupplierOwnedBy(supplierId: string, userId: string): Promise<boolean> {
        const count = await PrismaClient.supplier.count({
            where: {
                id: supplierId,
                createdById: userId,
            },
        });
        return count > 0;
    }
}