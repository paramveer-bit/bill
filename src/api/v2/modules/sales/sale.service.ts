// src/api/v1/modules/sale/sale.service.ts
import { SaleRepository } from './sale.repository.js';
import ApiError from '@/helpers/ApiError.js';
import PrismaClient from '@/prismaClient/index.js';
import type {
    CreateSaleInput,
    ListSalesInput,
    LinePlan,
    AllocationPlan,
    SaleListMeta,
    SalesSummary,
} from './sale.schema.js';
import type { AuthUser } from '../auth.schema.js';
import { Decimal } from '@/lib/generated/prisma/internal/prismaNamespaceBrowser.js';
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

export class SaleService {

    // ============ CREATE SALE ============
    async createSale(data: CreateSaleInput, authUser: AuthUser): Promise<any> {
        const { customerId, saleDate, lines } = data;

        // ── Pre-flight: customer exists & user owns it ───────────────────────────
        const customer = await PrismaClient.customer.findUnique({
            where: { id: customerId },
        });
        if (!customer) throw new ApiError(404, 'Customer not found');

        const isCustomerOwned = await SaleRepository.isCustomerOwnedBy(
            customerId,
            authUser.id
        );
        if (!isCustomerOwned) {
            throw new ApiError(403, 'You do not have access to this customer');
        }

        // ── Pre-flight: all products exist ───────────────────────────────────────
        const productIds = [...new Set(lines.map((l) => l.productId))];
        const products = await PrismaClient.product.findMany({
            where: { id: { in: productIds }, createdById: authUser.id },
            select: { id: true, name: true },
        });

        if (products.length !== productIds.length) {
            const missing = productIds.filter((id) => !products.find((p) => p.id === id));
            throw new ApiError(404, `Products not found: ${missing.join(', ')}`);
        }

        // ── FIFO allocation planning (read-only, outside transaction) ────────────
        const linePlans: LinePlan[] = [];

        for (const line of lines) {
            const batches = await SaleRepository.getAvailableBatches(line.productId);

            const totalAvailable = batches.reduce((s, b) => s + b.qtyRemaining, 0);
            if (totalAvailable < line.qty) {
                const product = products.find((p) => p.id === line.productId);
                throw new ApiError(400, `Insufficient stock for "${product?.name}". Required: ${line.qty}, Available: ${totalAvailable}`);
            }

            const allocations: AllocationPlan[] = [];
            let remaining = line.qty;

            for (const batch of batches) {
                if (remaining <= 0) break;
                const take = Math.min(remaining, batch.qtyRemaining);
                allocations.push({
                    purchaseBatchId: batch.id,
                    qtyAllocated: take,
                    unitCost: batch.unitCost,
                });
                remaining -= take;
            }

            const lineTotal = line.qty * line.unitSellPrice.toNumber();
            const costAllocated = allocations.reduce(
                (s, a) => s + a.qtyAllocated * a.unitCost.toNumber(),
                0
            );
            const productName = products.find((p) => p.id === line.productId)!.name;

            linePlans.push({
                productId: line.productId,
                productName,
                qty: line.qty,
                unitQty: line.unitQty,
                unitName: line.unitName,
                unitSellPrice: line.unitSellPrice,
                lineTotal: new Decimal(lineTotal),
                costAllocated: new Decimal(costAllocated),
                allocations,
            });
        }

        const totalAmount = linePlans.reduce((s, l) => s + l.lineTotal.toNumber(), 0);

        // ── Delegate to repository ───────────────────────────────────────────────
        return SaleRepository.create({
            customerId,
            saleDate,
            totalAmount,
            linePlans,
            customer: {
                name: customer.name,
                gstNumber: customer.gstNumber ?? null,
                phone: customer.phone ?? null,
                address: customer.address ?? null,
            },
            createdById: authUser.id,
        });
    }

    // ============ GET ALL SALES ============ 
    async getSales(
        params: ListSalesInput,
        authUser: AuthUser
    ): Promise<{ sales: any[]; meta: SaleListMeta, summary: any }> {
        const {
            search,
            dateFilter,
            startDate,
            endDate,
            customerId,
            sortBy,
            sortOrder,
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
        const where: any = {};

        if (search) {
            where.OR = [
                { invoiceNo: { contains: search, mode: 'insensitive' } },
                { customerName: { contains: search, mode: 'insensitive' } },
                { customer: { name: { contains: search, mode: 'insensitive' } } },
            ];
        }

        if (dateRange) where.saleDate = dateRange;
        if (customerId) where.customerId = customerId;

        // ── Sorting ──────────────────────────────────────────────────────────────
        const allowedSortFields: Record<string, object> = {
            saleDate: { saleDate: sortOrder },
            totalAmount: { totalAmount: sortOrder },
            invoiceNo: { invoiceNo: sortOrder },
            createdAt: { createdAt: sortOrder },
        };
        const orderBy = allowedSortFields[sortBy] ?? { saleDate: 'desc' };

        const skip = (page - 1) * limit;

        // ── Parallel fetch ───────────────────────────────────────────────────────
        const [sales, total, totalSpend, totalLineItems] = await Promise.all([
            SaleRepository.findMany({
                where,
                orderBy,
                skip,
                take: limit,
                createdById: authUser.id,
            }),
            SaleRepository.count({ where, createdById: authUser.id }),
            SaleRepository.aggregateTotalSpend({ where, createdById: authUser.id }),
            SaleRepository.countDistinctLineItems({ where, createdById: authUser.id }),
        ]);

        return {
            sales,
            meta: {
                page,
                limit,
                totalRecords: total,
                totalPages: Math.ceil(total / limit),
            },
            summary: {
                totalSales: total,
                totalSpend,
                totalLineItems,
            }
        };
    }

    // ============ GET SALES SUMMARY ============
    async getSalesSummary(authUser: AuthUser): Promise<SalesSummary> {
        return SaleRepository.getSummary(authUser.id);
    }

    // ============ GET SALE BY ID ============
    async getSaleById(id: string, authUser: AuthUser): Promise<any> {
        if (!id?.trim()) throw new ApiError(400, 'Invalid sale ID');

        const sale = await SaleRepository.findById(id);
        if (!sale) throw new ApiError(404, 'Sale not found');

        // ⚠️ SECURITY: Verify user owns this sale
        if (sale.createdById !== authUser.id) {
            throw new ApiError(403, 'You do not have access to this sale');
        }

        return sale;
    }

    // ============ DELETE SALE ============
    async deleteSale(id: string, authUser: AuthUser): Promise<void> {
        if (!id?.trim()) throw new ApiError(400, 'Invalid sale ID');

        const sale = await SaleRepository.findByIdForDelete(id);
        if (!sale) throw new ApiError(404, 'Sale not found');

        // ⚠️ SECURITY: Verify user owns this sale
        if (sale.createdById !== authUser.id) {
            throw new ApiError(403, 'You do not have access to this sale');
        }

        await SaleRepository.delete(sale);
    }
}