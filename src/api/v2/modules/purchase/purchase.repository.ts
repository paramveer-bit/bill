// src/api/v1/modules/purchase/purchase.repository.ts
import PrismaClient from '@/prismaClient/index.js';
import { Decimal } from 'decimal.js';
import type {
    CreatePurchaseInput,
    PurchaseWithRelations,
    PurchaseListItem,
} from './purchase.schema.js';

/**
 * Repository layer — ONLY database operations.
 * No business logic here!
 */

// ── Reusable include for full purchase detail ────────────────────────────────
const purchaseFullInclude = {
    supplier: true,
    batches: {
        include: {
            product: { select: { id: true, name: true, sku: true, baseUnit: true } },
        },
    },
} as const;

// ── Reusable select for list view ────────────────────────────────────────────
const purchaseListSelect = {
    id: true,
    invoiceNo: true,
    purchaseDate: true,
    totalAmount: true,
    createdAt: true,
    supplier: { select: { id: true, name: true } },
    batches: { select: { id: true, productId: true } },
} as const;

export class PurchaseRepository {

    // ============ CREATE ============ used
    static async create(
        data: CreatePurchaseInput & { createdById: string },
        existingProducts: Array<{ id: string; name: string; currentSellPrice: any }>
    ): Promise<PurchaseWithRelations> {
        const { supplierId, invoiceNo, purchaseDate, totalAmount, batches, createdById } = data;
        const effectiveDate = purchaseDate ?? new Date();

        return PrismaClient.$transaction(async (tx) => {
            // 1. Create Purchase + Batches
            const purchase = await tx.purchase.create({
                data: {
                    supplierId,
                    invoiceNo: invoiceNo ?? null,
                    purchaseDate: effectiveDate,
                    totalAmount,
                    createdById,
                    batches: {
                        create: batches.map((batch) => ({
                            productId: batch.productId,
                            qtyReceived: batch.qtyReceived,
                            qtyRemaining: batch.qtyReceived,
                            receivedAt: effectiveDate,
                            unitCost: new Decimal(batch.unitCost),
                            sellingPrice: new Decimal(batch.sellingPrice),
                            mrp: new Decimal(batch.mrp),
                        })),
                    },
                },
                include: {
                    batches: {
                        include: {
                            product: { select: { id: true, name: true, baseUnit: true, sku: true } },
                        },
                    },
                },
            });

            // 2. Update supplier balance — increment by totalAmount (we owe more)
            await tx.supplier.update({
                where: { id: supplierId },
                data: { balance: { increment: new Decimal(totalAmount) } },
            });

            // 3. Update currentSellPrice ONLY if it changed — avoid noise in price history
            await Promise.all(
                batches.map(async (batch) => {
                    const currentProduct = existingProducts.find((p) => p.id === batch.productId)!;
                    const currentPrice = Number(currentProduct.currentSellPrice ?? 0);
                    const priceChanged = currentPrice !== batch.sellingPrice;

                    if (priceChanged) {
                        await tx.product.update({
                            where: { id: batch.productId },
                            data: { currentSellPrice: batch.sellingPrice },
                        });

                        await tx.productPriceHistory.create({
                            data: {
                                productId: batch.productId,
                                price: batch.sellingPrice,
                                effectiveFrom: effectiveDate,
                                note: `₹${currentPrice} → ₹${batch.sellingPrice} via purchase${invoiceNo ? ` ${invoiceNo}` : ''}`,
                            },
                        });
                    }
                })
            );

            return purchase;
        });
    }

    // ============ READ MANY (list view) ============ used
    static async findMany(filters: {
        where: any;
        skip: number;
        take: number;
        createdById: string;
    }): Promise<PurchaseListItem[]> {
        const where = { ...filters.where, createdById: filters.createdById };

        return PrismaClient.purchase.findMany({
            where,
            select: purchaseListSelect,
            orderBy: { purchaseDate: 'desc' },
            skip: filters.skip,
            take: filters.take,
        });
    }

    // ============ COUNT ============ used
    static async count(filters: {
        where: any;
        createdById: string;
    }): Promise<number> {
        return PrismaClient.purchase.count({
            where: { ...filters.where, createdById: filters.createdById },
        });
    }

    // ============ AGGREGATE TOTAL SPEND ============ used
    static async aggregateTotalSpend(filters: {
        where: any;
        createdById: string;
    }): Promise<number> {
        const result = await PrismaClient.purchase.aggregate({
            where: { ...filters.where, createdById: filters.createdById },
            _sum: { totalAmount: true },
        });
        return Number(result._sum?.totalAmount ?? 0);
    }

    // ============ TOTAL UNIQUE LINE ITEMS (distinct products) ============
    static async countDistinctLineItems(filters: {
        where: any;
        createdById: string;
    }): Promise<number> {
        const purchaseWhere = { ...filters.where, createdById: filters.createdById };

        const rows = await PrismaClient.purchaseBatch.groupBy({
            by: ['productId'],
            where: { purchase: purchaseWhere },
        });

        return rows.length;
    }

    // ============ READ ONE (full detail) ============ useed
    static async findById(
        id: string,
        createdById: string
    ): Promise<PurchaseWithRelations | null> {
        return PrismaClient.purchase.findUnique({
            where: { id, createdById },
            include: purchaseFullInclude,
        }) as Promise<PurchaseWithRelations | null>;
    }

    // ============ READ ONE MINIMAL (for delete guard) ============ used
    static async findByIdWithSaleCheck(id: string): Promise<{
        id: string;
        supplierId: string;
        createdById: string;
        batches: Array<{
            saleAllocations: Array<{ id: string }>;
        }>;
    } | null> {
        return PrismaClient.purchase.findUnique({
            where: { id },
            select: {
                id: true,
                supplierId: true,
                createdById: true,
                batches: {
                    select: {
                        saleAllocations: { select: { id: true } },
                    },
                },
            },
        });
    }

    // ============ DELETE ============ used
    static async delete(id: string): Promise<void> {
        await PrismaClient.purchase.delete({ where: { id } });
    }

    // ============ VERIFY SUPPLIER OWNERSHIP ============ used
    static async isSupplierOwnedBy(supplierId: string, userId: string): Promise<boolean> {
        const count = await PrismaClient.supplier.count({
            where: { id: supplierId, createdById: userId },
        });
        return count > 0;
    }
}