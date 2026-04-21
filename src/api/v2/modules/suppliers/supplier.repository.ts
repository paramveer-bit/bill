// src/api/v1/modules/supplier/supplier.repository.ts
import PrismaClient from '@/prismaClient/index.js';
import type {
    CreateSupplierInput,
    Supplier,
    SupplierWithRelations,
    UpdateSupplierInput
} from './supplier.schema.js';

/**
 * Repository layer - ONLY database operations
 * No business logic here!
 */

const supplierInclude = {
    createdBy: {
        select: {
            id: true,
            name: true,
            email: true,
        },
    },
    purchases: {
        select: {
            id: true,
            invoiceNo: true,
            totalAmount: true,
            purchaseDate: true,
        },
    },
    payments: {
        select: {
            id: true,
            amount: true,
            paymentMode: true,
            paymentDate: true,
        },
    },
} as const;

export class SupplierRepository {

    // ============ CREATE ============used
    static async create(
        data: CreateSupplierInput & {
            createdById: string;
        }
    ): Promise<SupplierWithRelations> {
        const { createdById, openingBalance, ...supplierData } = data;

        return PrismaClient.supplier.create({
            data: {
                name: supplierData.name,
                contactName: supplierData.contactName || null,
                phone: supplierData.phone || null,
                email: supplierData.email || null,
                gstNumber: supplierData.gstNumber || null,
                address: supplierData.address || null,
                openingBalance: openingBalance || 0,
                balance: openingBalance || 0,
                createdById,
            },
            include: supplierInclude,
        });
    }

    // ============ READ MANY ============used
    static async findMany(filters: {
        search?: string;
        skip?: number;
        take?: number;
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
        createdById?: string;
    } = {}): Promise<SupplierWithRelations[]> {
        const where: any = {};

        // Search filter
        if (filters.search) {
            where.OR = [
                { name: { contains: filters.search, mode: 'insensitive' } },
                { contactName: { contains: filters.search, mode: 'insensitive' } },
                { phone: { contains: filters.search, mode: 'insensitive' } },
                { email: { contains: filters.search, mode: 'insensitive' } },
            ];
        }

        // User filter
        if (filters.createdById) {
            where.createdById = filters.createdById;
        }

        // Sorting
        const sortField = filters.sortBy || 'createdAt';
        const sortDir = filters.sortOrder || 'desc';
        const orderBy = { [sortField]: sortDir };

        return PrismaClient.supplier.findMany({
            where,
            include: supplierInclude,
            orderBy,
            ...(filters.skip !== undefined ? { skip: filters.skip } : {}),
            ...(filters.take !== undefined ? { take: filters.take } : {}),
        });
    }

    // ============ COUNT ============used
    static async count(filters: {
        search?: string;
        createdById?: string;
    } = {}): Promise<number> {
        const where: any = {};

        if (filters.search) {
            where.OR = [
                { name: { contains: filters.search, mode: 'insensitive' } },
                { contactName: { contains: filters.search, mode: 'insensitive' } },
                { phone: { contains: filters.search, mode: 'insensitive' } },
                { email: { contains: filters.search, mode: 'insensitive' } },
            ];
        }

        if (filters.createdById) {
            where.createdById = filters.createdById;
        }

        return PrismaClient.supplier.count({ where });
    }

    // ============ READ ONE ============used
    static async findById(id: string): Promise<SupplierWithRelations | null> {
        return PrismaClient.supplier.findUnique({
            where: { id },
            include: supplierInclude,
        });
    }

    // ============ READ ONE - MINIMAL ============
    static async findByIdMinimal(id: string): Promise<Supplier | null> {
        return PrismaClient.supplier.findUnique({
            where: { id },
        });
    }

    // ============ CHECK OWNERSHIP ============
    static async isOwnedBy(supplierId: string, userId: string): Promise<boolean> {
        const count = await PrismaClient.supplier.count({
            where: {
                id: supplierId,
                createdById: userId,
            },
        });
        return count > 0;
    }

    // ============ UPDATE ============used
    static async update(
        id: string,
        data: UpdateSupplierInput & { createdById?: never }
    ): Promise<SupplierWithRelations> {
        const cleanData = Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== undefined)
        );

        return PrismaClient.supplier.update({
            where: { id },
            data: cleanData,
            include: supplierInclude,
        });
    }

    // ============ DELETE ============used
    static async delete(id: string): Promise<void> {
        // Delete supplier payments first
        await PrismaClient.supplierPayment.deleteMany({
            where: { supplierId: id },
        });

        // Delete supplier purchases
        await PrismaClient.purchase.deleteMany({
            where: { supplierId: id },
        });

        // Delete supplier
        await PrismaClient.supplier.delete({
            where: { id },
        });
    }

    // ============ UPDATE BALANCE ============
    static async updateBalance(supplierId: string, newBalance: number): Promise<Supplier | null> {
        return PrismaClient.supplier.update({
            where: { id: supplierId },
            data: { balance: newBalance },
        });
    }

    // ============ GET SUPPLIER STATS ============used
    static async getSupplierStats(supplierId: string): Promise<{
        totalPurchases: number;
        totalPayments: number;
        purchaseCount: number;
        paymentCount: number;
        lastPurchaseDate: Date | null;
    } | null> {
        const supplier = await PrismaClient.supplier.findUnique({
            where: { id: supplierId },
            include: {
                purchases: {
                    select: { totalAmount: true, purchaseDate: true },
                },
                payments: {
                    select: { amount: true },
                },
            },
        });

        if (!supplier) return null;

        const totalPurchases = supplier.purchases.reduce(
            (sum, p) => sum + p.totalAmount.toNumber(),
            0
        );

        const totalPayments = supplier.payments.reduce(
            (sum, p) => sum + p.amount.toNumber(),
            0
        );

        const lastPurchase = supplier.purchases.sort(
            (a, b) => b.purchaseDate.getTime() - a.purchaseDate.getTime()
        )[0];

        return {
            totalPurchases,
            totalPayments,
            purchaseCount: supplier.purchases.length,
            paymentCount: supplier.payments.length,
            lastPurchaseDate: lastPurchase?.purchaseDate || null,
        };
    }

    // ============ CHECK IF HAS TRANSACTIONS ============ used
    static async hasTransactions(supplierId: string): Promise<boolean> {
        const [purchaseCount, paymentCount] = await Promise.all([
            PrismaClient.purchase.count({ where: { supplierId } }),
            PrismaClient.supplierPayment.count({ where: { supplierId } }),
        ]);

        return purchaseCount > 0 || paymentCount > 0;
    }
}