// src/api/v1/modules/product/product.repository.ts
import PrismaClient from '@/prismaClient/index.js';
import type {
    CreateProductInput,
    UpdateProductInput,
    Product,
    ProductWithRelations,
    UnitConversion,
} from './product.schema.js';

/**
 * Repository layer - ONLY database operations
 * No business logic here!
 */

const productInclude = {
    category: {
        select: { id: true, name: true },
    },
    createdBy: {
        select: { id: true, name: true, email: true },
    },
    unitConversions: true,
} as const;

export class ProductRepository {

    // ============ CREATE ============ used
    // check for valid category id 1st
    static async create(
        data: Omit<CreateProductInput, 'unitConversions'> & {
            unitConversions: UnitConversion[];
            createdById: string;
        }
    ): Promise<ProductWithRelations> {
        const { unitConversions, createdById, ...productData } = data;
        const categoryId = productData.categoryId ? productData.categoryId : null;
        return PrismaClient.product.create({
            data: {
                sku: productData.sku || "",
                name: productData.name,
                baseUnit: productData.baseUnit,
                currentSellPrice: productData.currentSellPrice,
                taxRate: productData.taxRate,
                isStockItem: productData.isStockItem ?? false,
                createdById, // ← User who created
                categoryId: categoryId ?? null,
                unitConversions: {
                    create: unitConversions,
                },
            },
            include: productInclude,
        });
    }

    // ============ READ MANY ============ used
    static async findMany(filters: {
        createdById: string; // required
        skip?: number;       // required
        take?: number;
        categoryId?: string;
        search?: string;
    }): Promise<ProductWithRelations[]> {

        return PrismaClient.product.findMany({
            where: {
                createdById: filters.createdById, // ← Filter by user
                ...(filters.categoryId
                    ? { categoryId: filters.categoryId as string }
                    : {}),
                ...(filters.search
                    ? {
                        OR: [
                            { name: { contains: filters.search as string, mode: "insensitive" } },
                            { sku: { contains: filters.search as string, mode: "insensitive" } },
                        ],
                    }
                    : {}),
            },
            include: {
                ...productInclude,
                purchaseBatches: {
                    where: { qtyRemaining: { gt: 0 } },
                    select: { qtyRemaining: true }
                },
            },
            orderBy: { createdAt: 'desc' },

            ...(filters.skip !== undefined ? { skip: filters.skip } : {}),
            ...(filters.take !== undefined ? { take: filters.take } : {}),
        });
    }

    // ============ READ MANY WITH STOCK ============ used
    static async findManyWithStock(filters: {
        createdById: string;
        skip?: number;
        take?: number;
        categoryId?: string;
        search?: string; // ← Filter by user
    }): Promise<Array<ProductWithRelations & { purchaseBatches: Array<{ qtyRemaining: number }> }>> {
        return PrismaClient.product.findMany({
            where: {
                ...(filters.createdById ? { createdById: filters.createdById } : {}),
                ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
                ...(filters.search ? {
                    OR: [
                        { name: { contains: filters.search, mode: 'insensitive' } },
                        { sku: { contains: filters.search, mode: 'insensitive' } },
                    ],
                } : {}),
            },
            include: {
                ...productInclude,
                purchaseBatches: {
                    where: { qtyRemaining: { gt: 0 } },
                    select: { qtyRemaining: true },
                },
            },
            orderBy: { createdAt: 'desc' },
            ...(filters.skip !== undefined ? { skip: filters.skip } : {}),
            ...(filters.take !== undefined ? { take: filters.take } : {}),
        });
    }

    // ============ COUNT ============
    static async count(filters: {
        categoryId?: string;
        search?: string;
        createdById?: string; // ← Filter by user
    } = {}): Promise<number> {
        return PrismaClient.product.count({
            where: {
                ...(filters.createdById ? { createdById: filters.createdById } : {}),
                ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
                ...(filters.search ? {
                    OR: [
                        { name: { contains: filters.search, mode: 'insensitive' } },
                        { sku: { contains: filters.search, mode: 'insensitive' } },
                    ],
                } : {}),
            },
        });
    }

    // ============ READ ONE ============
    static async findById(id: string): Promise<ProductWithRelations | null> {
        return PrismaClient.product.findUnique({
            where: { id },
            include: productInclude,
        });
    }

    // ============ READ ONE WITH STOCK ============ used
    static async findByIdWithStock(id: string): Promise<(ProductWithRelations & {
        purchaseBatches: Array<{ qtyRemaining: number }>;
    }) | null> {
        return PrismaClient.product.findUnique({
            where: { id },
            include: {
                ...productInclude,
                purchaseBatches: {
                    select: { qtyRemaining: true },
                },
            },
        });
    }

    // ============ READ ONE - MINIMAL ============used
    static async findByIdMinimal(id: string): Promise<Product | null> {
        return PrismaClient.product.findUnique({
            where: { id },
        });
    }

    // ============ CHECK OWNERSHIP ============
    // Verify user owns this product
    static async isOwnedBy(productId: string, userId: string): Promise<boolean> {
        const count = await PrismaClient.product.count({
            where: {
                id: productId,
                createdById: userId,
            },
        });
        return count > 0;
    }

    // ============ UPDATE ============ used
    static async update(
        id: string,
        data: Omit<UpdateProductInput, 'unitConversions'> & {
            unitConversions?: UnitConversion[];  // Make this optional
            createdById?: string;
        }
    ): Promise<ProductWithRelations> {
        const { unitConversions, ...productData } = data;

        const updateData = {
            ...Object.fromEntries(
                Object.entries(productData).filter(([, v]) => v !== undefined)
            ),
            ...(unitConversions !== undefined ? {
                unitConversions: {
                    deleteMany: {},
                    create: unitConversions,
                },
            } : {}),
        };
        return PrismaClient.product.update({
            where: { id },
            data: updateData,
            include: productInclude,
        });
    }

    // ============ DELETE ============ used
    static async delete(id: string): Promise<void> {
        // Delete associated unit conversions first
        await PrismaClient.unitConversion.deleteMany({
            where: { productId: id },
        });

        // Delete the product
        await PrismaClient.product.delete({
            where: { id },
        });
    }

    // ============ FIND BY CATEGORY ============
    static async findByCategory(categoryId: string, userId: string): Promise<ProductWithRelations[]> {
        return PrismaClient.product.findMany({
            where: {
                categoryId,
                createdById: userId, // ← Only user's products
            },
            include: productInclude,
            orderBy: { name: 'asc' },
        });
    }

    // ============ FIND BY CATEGORY AND SUBCATEGORIES ============ used
    static async findByCategoryWithChildren(categoryId: string, userId: string): Promise<ProductWithRelations[]> {
        // Get subcategories
        const subcategories = await PrismaClient.category.findMany({
            where: { parentId: categoryId },
            select: { id: true },
        });

        const allCategoryIds = [categoryId, ...subcategories.map(c => c.id)];

        return PrismaClient.product.findMany({
            where: {
                categoryId: { in: allCategoryIds },
                createdById: userId, // ← Only user's products
            },
            include: productInclude,
            orderBy: { name: 'asc' },
        });
    }

    // ============ GET STOCK INFO ============ used
    static async getStockInfo(productId: string): Promise<{
        totalStockPcs: number;
    } | null> {
        const product = await PrismaClient.product.findUnique({
            where: { id: productId },
            include: {
                purchaseBatches: {
                    where: { qtyRemaining: { gt: 0 } },
                    select: { qtyRemaining: true },
                },
            },
        });

        if (!product) return null;

        const totalStockPcs = product.purchaseBatches.reduce(
            (sum, batch) => sum + batch.qtyRemaining,
            0
        );

        return { totalStockPcs };
    }

    // ============ GET CATEGORIES WITH PRODUCTS (USER'S ONLY) ============ used
    static async getCategoriesWithProducts(userId: string): Promise<any[]> {
        return PrismaClient.category.findMany({
            where: { parentId: null }, // Root categories only
            include: {
                products: {
                    where: { createdById: userId }, // ← Only user's products
                    include: productInclude,
                    orderBy: { name: 'asc' },
                },
                children: {
                    include: {
                        products: {
                            where: { createdById: userId }, // ← Only user's products
                            include: productInclude,
                            orderBy: { name: 'asc' },
                        },
                    },
                },
            },
            orderBy: { name: 'asc' },
        });
    }

    // ============ CHECK EXISTS ============
    static async exists(id: string): Promise<boolean> {
        const count = await PrismaClient.product.count({
            where: { id },
        });
        return count > 0;
    }

    // ============ FIND BY SKU (USER'S ONLY) ============ used
    static async findBySku(sku: string, userId: string): Promise<Product | null> {
        return PrismaClient.product.findFirst({
            where: {
                sku,
                createdById: userId, // ← Only user's products
            },
        });
    }
}