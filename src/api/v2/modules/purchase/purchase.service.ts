// src/api/v1/modules/purchase/purchase.service.ts
import { PurchaseRepository } from './purchase.repository.js';
import ApiError from '@/helpers/ApiError.js';
import PrismaClient from '@/prismaClient/index.js';
import type {
    CreatePurchaseInput,
    ListPurchasesInput,
    PurchaseWithRelations,
    PurchaseListItem,
    PurchaseListMeta,
} from './purchase.schema.js';
import type { AuthUser } from '../auth.schema.js';
/**
 * Service layer — all business logic lives here.
 * Calls repository for data access.
 *
 * ⚠️ All methods receive AuthUser (from middleware) to enforce data isolation.
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

export class PurchaseService {

    // ============ CREATE PURCHASE ============
    async createPurchase(
        data: CreatePurchaseInput,
        authUser: AuthUser
    ): Promise<PurchaseWithRelations> {
        // ── Pre-flight: supplier exists & user owns it ───────────────────────────
        const supplier = await PrismaClient.supplier.findUnique({
            where: { id: data.supplierId },
        });
        if (!supplier) throw new ApiError(400, 'Supplier not found');

        const isSupplierOwned = await PurchaseRepository.isSupplierOwnedBy(
            data.supplierId,
            authUser.id
        );
        if (!isSupplierOwned) {
            throw new ApiError(403, 'You do not have access to this supplier');
        }

        // ── Pre-flight: all products exist ───────────────────────────────────────
        const productIds = [...new Set(data.batches.map((b) => b.productId))];
        const existingProducts = await PrismaClient.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true, currentSellPrice: true },
        });

        if (existingProducts.length !== productIds.length) {
            const missing = productIds.filter(
                (id) => !existingProducts.find((p) => p.id === id)
            );
            throw new ApiError(404, `Products not found: ${missing.join(', ')}`);
        }

        // ── Pre-flight: totalAmount matches calculated sum ───────────────────────
        const calculatedTotal = data.batches.reduce(
            (sum, b) => sum + b.qtyReceived * b.unitCost,
            0
        );
        if (calculatedTotal !== data.totalAmount.toNumber()) {
            throw new ApiError(400,
                `Total amount mismatch: expected ${calculatedTotal}, got ${data.totalAmount}`
            );
        }

        // ── Delegate to repository ───────────────────────────────────────────────
        return PurchaseRepository.create(
            { ...data, createdById: authUser.id },
            existingProducts
        );
    }

    // ============ GET ALL PURCHASES ============
    async getPurchases(
        params: ListPurchasesInput,
        authUser: AuthUser
    ): Promise<{ purchases: PurchaseListItem[]; meta: PurchaseListMeta, summary: any }> {
        const {
            supplierId,
            invoiceNo,
            search,
            startDate,
            endDate,
            dateFilter,
            page,
            limit,
        } = params;

        // ── Build date range ─────────────────────────────────────────────────────
        let dateRange: { gte?: Date; lte?: Date } | undefined;

        if (startDate || endDate) {
            dateRange = {
                ...(startDate ? { gte: new Date(startDate) } : {}),
                ...(endDate
                    ? { lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)) }
                    : {}),
            };
        } else if (dateFilter && dateFilter !== 'all') {
            dateRange = getDateRange(dateFilter);
        }

        // ── Build where clause ───────────────────────────────────────────────────
        const where: any = {
            ...(supplierId ? { supplierId } : {}),
            ...(dateRange ? { purchaseDate: dateRange } : {}),
            ...(search
                ? {
                    OR: [
                        { invoiceNo: { contains: search, mode: 'insensitive' as const } },
                        {
                            supplier: {
                                name: { contains: search, mode: 'insensitive' as const },
                            },
                        },
                    ],
                }
                : {}),
            // Only apply invoiceNo filter when no general search is active
            ...(invoiceNo && !search
                ? { invoiceNo: { contains: invoiceNo, mode: 'insensitive' as const } }
                : {}),
        };

        const skip = (page - 1) * limit;

        // ── Parallel fetch ───────────────────────────────────────────────────────
        const [purchases, total, totalSpend, totalLineItems] = await Promise.all([
            PurchaseRepository.findMany({
                where,
                skip,
                take: limit,
                createdById: authUser.id,
            }),
            PurchaseRepository.count({ where, createdById: authUser.id }),
            PurchaseRepository.aggregateTotalSpend({
                where,
                createdById: authUser.id,
            }),
            PurchaseRepository.countDistinctLineItems({
                where,
                createdById: authUser.id,
            }),
        ]);

        // ── Shape list items — derive batchCount, drop raw batches ───────────────
        const shaped: PurchaseListItem[] = (purchases as any[]).map((p) => {
            const uniqueProductIds = new Set(
                (p.batches as Array<{ productId: string }>).map((b) => b.productId)
            );
            return {
                id: p.id,
                invoiceNo: p.invoiceNo,
                purchaseDate: p.purchaseDate,
                totalAmount: p.totalAmount,
                createdAt: p.createdAt,
                supplier: p.supplier,
                batchCount: uniqueProductIds.size,
            };
        });

        return {
            purchases: shaped,
            meta: {
                page,
                limit,
                totalRecords: total,
                totalPages: Math.ceil(total / limit),
            },
            summary: {
                totalSpend,
                totalLineItems,
            }
        };
    }

    // ============ GET PURCHASE BY ID ============
    async getPurchaseById(
        id: string,
        authUser: AuthUser
    ): Promise<PurchaseWithRelations> {
        if (!id?.trim()) throw new ApiError(400, 'Invalid purchase ID');

        const purchase = await PurchaseRepository.findById(id, authUser.id);
        if (!purchase) throw new ApiError(403, 'Purchase not found');

        // ⚠️ SECURITY: Verify user owns this purchase
        if (purchase.createdById !== authUser.id) {
            throw new ApiError(403, 'You do not have access to this purchase');
        }

        return purchase;
    }

    // ============ DELETE PURCHASE ============
    async deletePurchase(id: string, authUser: AuthUser): Promise<void> {
        if (!id?.trim()) throw new ApiError(400, 'Invalid purchase ID');

        const purchase = await PurchaseRepository.findByIdWithSaleCheck(id);
        if (!purchase) throw new ApiError(403, 'Purchase not found');

        // ⚠️ SECURITY: Verify user owns this purchase
        if (purchase.createdById !== authUser.id) {
            throw new ApiError(403, 'You do not have access to this purchase');
        }

        // Business rule: cannot delete if any batch has been sold
        const hasSales = purchase.batches.some((b) => b.saleAllocations.length > 0);
        if (hasSales) {
            throw new ApiError(409,
                'Cannot delete: one or more items in this purchase have already been sold'
            );
        }

        await PurchaseRepository.delete(id);
    }
}