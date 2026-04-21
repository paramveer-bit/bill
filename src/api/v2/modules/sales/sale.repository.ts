// src/api/v1/modules/sale/sale.repository.ts
import PrismaClient from '@/prismaClient/index.js';
import { Decimal } from 'decimal.js';
import type { LinePlan, SalesSummary } from './sale.schema.js';

/**
 * Repository layer — ONLY database operations.
 * No business logic here!
 */

// ── Reusable select for list view ────────────────────────────────────────────
const saleListSelect = {
    id: true,
    invoiceNo: true,
    saleDate: true,
    totalAmount: true,
    createdAt: true,
    customerName: true,
    customerPhone: true,
    customer: {
        select: { id: true, name: true, phone: true, town: true },
    },
    _count: { select: { lines: true } },
} as const;

// ── Reusable include for full sale detail ─────────────────────────────────────
const saleFullInclude = {
    customer: {
        select: { id: true, name: true, phone: true, town: true, balance: true },
    },
    lines: {
        include: {
            product: {
                select: { id: true, name: true, sku: true, baseUnit: true },
            },
            allocations: {
                select: {
                    qtyAllocated: true,
                    unitCost: true,
                    purchaseBatch: { select: { id: true, receivedAt: true } },
                },
            },
        },
        orderBy: { id: 'asc' as const },
    },
} as const;

export class SaleRepository {

    // ============ GENERATE INVOICE NUMBER ============
    // Format: DDMMYY-00001 — resets each day
    static async generateInvoiceNo(): Promise<string> {
        const now = new Date();
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const yy = String(now.getFullYear()).slice(2);
        const prefix = `${dd}${mm}${yy}-`;

        const count = await PrismaClient.sale.count({
            where: { invoiceNo: { startsWith: prefix } },
        });

        return `${prefix}${String(count + 1).padStart(5, '0')}`;
    }

    // ============ CREATE SALE (with FIFO allocation) ============ used
    static async create(params: {
        customerId: string;
        saleDate: Date;
        totalAmount: number;
        linePlans: LinePlan[];
        customer: {
            name: string;
            gstNumber: string | null;
            phone: string | null;
            address: string | null;
        };
        createdById: string;
    }): Promise<any> {
        const { customerId, saleDate, totalAmount, linePlans, customer, createdById } = params;

        return PrismaClient.$transaction(async (tx) => {
            const invoiceNo = await SaleRepository.generateInvoiceNo();

            // 1. Create Sale + Lines + Allocations
            const newSale = await tx.sale.create({
                data: {
                    invoiceNo,
                    customerId,
                    saleDate,
                    totalAmount,
                    createdById,
                    // Customer snapshot fields
                    customerName: customer.name,
                    customerGST: customer.gstNumber ?? null,
                    customerPhone: customer.phone ?? null,
                    customerAddress: customer.address ?? null,
                    lines: {
                        create: linePlans.map((lp) => ({
                            productId: lp.productId,
                            productName: lp.productName,
                            qty: lp.qty,
                            unitQty: lp.unitQty,
                            unitname: lp.unitName,
                            unitSellPrice: lp.unitSellPrice,
                            taxRate: null,
                            lineTotal: lp.lineTotal,
                            costAllocated: lp.costAllocated,
                            allocations: {
                                create: lp.allocations.map((a) => ({
                                    purchaseBatchId: a.purchaseBatchId,
                                    qtyAllocated: a.qtyAllocated,
                                    unitCost: a.unitCost,
                                })),
                            },
                        })),
                    },
                },
                include: {
                    lines: { include: { allocations: true } },
                },
            });

            // 2. Decrement batch stock (FIFO)
            for (const lp of linePlans) {
                for (const alloc of lp.allocations) {
                    await tx.purchaseBatch.update({
                        where: { id: alloc.purchaseBatchId },
                        data: { qtyRemaining: { decrement: alloc.qtyAllocated } },
                    });
                }
            }

            // 3. Increment customer balance (amount owed by customer)
            await tx.customer.update({
                where: { id: customerId },
                data: { balance: { increment: totalAmount } },
            });

            return newSale;
        });
    }

    // ============ READ MANY (list view) ============ used
    static async findMany(filters: {
        where: any;
        orderBy: any;
        skip: number;
        take: number;
        createdById: string;
    }): Promise<any[]> {
        return PrismaClient.sale.findMany({
            where: { ...filters.where, createdById: filters.createdById },
            orderBy: filters.orderBy,
            skip: filters.skip,
            take: filters.take,
            select: saleListSelect,
        });
    }

    // ============ COUNT ============ used
    static async count(filters: {
        where: any;
        createdById: string;
    }): Promise<number> {
        return PrismaClient.sale.count({
            where: { ...filters.where, createdById: filters.createdById },
        });
    }

    // ============ AGGREGATE TOTAL SPEND ============ used
    static async aggregateTotalSpend(filters: {
        where: any;
        createdById: string;
    }): Promise<number> {
        const result = await PrismaClient.sale.aggregate({
            where: { ...filters.where, createdById: filters.createdById },
            _sum: { totalAmount: true },
        });
        return Number(result._sum?.totalAmount ?? 0);
    }

    // ============ COUNT DISTINCT LINE ITEMS ============ used
    static async countDistinctLineItems(filters: {
        where: any;
        createdById: string;
    }): Promise<number> {
        const saleWhere = { ...filters.where, createdById: filters.createdById };
        const rows = await PrismaClient.saleLine.groupBy({
            by: ['productId'],
            where: { sale: saleWhere },
        });
        return rows.length;
    }

    // ============ READ ONE (full detail) ============ used
    static async findById(id: string): Promise<any | null> {
        return PrismaClient.sale.findUnique({
            where: { id },
            include: saleFullInclude,
        });
    }

    // ============ READ ONE (for delete — includes allocations) ============
    static async findByIdForDelete(id: string): Promise<{
        id: string;
        customerId: string | null;
        totalAmount: any;
        createdById: string;
        lines: Array<{
            id: string;
            allocations: Array<{
                purchaseBatchId: string;
                qtyAllocated: number;
            }>;
        }>;
    } | null> {
        return PrismaClient.sale.findUnique({
            where: { id },
            select: {
                id: true,
                customerId: true,
                totalAmount: true,
                createdById: true,
                lines: {
                    select: {
                        id: true,
                        allocations: {
                            select: {
                                purchaseBatchId: true,
                                qtyAllocated: true,
                            },
                        },
                    },
                },
            },
        });
    }

    // ============ DELETE SALE (reverses FIFO + customer balance) ============ used
    static async delete(sale: {
        id: string;
        customerId: string | null;
        totalAmount: any;
        lines: Array<{
            id: string;
            allocations: Array<{ purchaseBatchId: string; qtyAllocated: number }>;
        }>;
    }): Promise<void> {
        await PrismaClient.$transaction(async (tx) => {
            // 1. Restore batch stock
            for (const line of sale.lines) {
                for (const alloc of line.allocations) {
                    await tx.purchaseBatch.update({
                        where: { id: alloc.purchaseBatchId },
                        data: { qtyRemaining: { increment: alloc.qtyAllocated } },
                    });
                }
            }

            // 2. Reduce customer balance
            if (sale.customerId) {
                await tx.customer.update({
                    where: { id: sale.customerId },
                    data: { balance: { decrement: sale.totalAmount } },
                });
            }

            // 3. Delete children before parent (avoid FK errors)
            await tx.saleBatchAllocation.deleteMany({
                where: { saleLineId: { in: sale.lines.map((l) => l.id) } },
            });

            await tx.saleLine.deleteMany({
                where: { saleId: sale.id },
            });

            await tx.sale.delete({ where: { id: sale.id } });
        });
    }

    // ============ SALES SUMMARY (today / month / all-time) ============ used
    static async getSummary(createdById: string): Promise<SalesSummary> {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const [todayStats, monthStats, allTimeStats] = await Promise.all([
            PrismaClient.sale.aggregate({
                where: { createdById, saleDate: { gte: startOfToday } },
                _sum: { totalAmount: true },
                _count: true,
            }),
            PrismaClient.sale.aggregate({
                where: { createdById, saleDate: { gte: startOfMonth } },
                _sum: { totalAmount: true },
                _count: true,
            }),
            PrismaClient.sale.aggregate({
                where: { createdById },
                _sum: { totalAmount: true },
                _count: true,
            }),
        ]);

        return {
            today: {
                amount: Number(todayStats._sum.totalAmount ?? 0),
                count: todayStats._count,
            },
            month: {
                amount: Number(monthStats._sum.totalAmount ?? 0),
                count: monthStats._count,
            },
            allTime: {
                amount: Number(allTimeStats._sum.totalAmount ?? 0),
                count: allTimeStats._count,
            },
        };
    }

    // ============ FIFO: fetch available batches for a product ============ used
    static async getAvailableBatches(productId: string): Promise<
        Array<{ id: string; qtyRemaining: number; unitCost: any; receivedAt: Date }>
    > {
        return PrismaClient.purchaseBatch.findMany({
            where: { productId, qtyRemaining: { gt: 0 } },
            orderBy: { receivedAt: 'asc' }, // FIFO
            select: { id: true, qtyRemaining: true, unitCost: true, receivedAt: true },
        });
    }

    // ============ VERIFY CUSTOMER OWNERSHIP ============ used
    static async isCustomerOwnedBy(customerId: string, userId: string): Promise<boolean> {
        const count = await PrismaClient.customer.count({
            where: { id: customerId, createdById: userId },
        });
        return count > 0;
    }
}