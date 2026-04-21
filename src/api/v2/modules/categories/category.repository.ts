import PrismaClient from '@/prismaClient/index.js';
import type {
    CreateCategoryInput,
    UpdateCategoryInput,
    Category,
    CategoryWithRelations,
} from './category.schema.js';


export class CategoryRepository {

    // ============ CREATE ============
    static async create(data: CreateCategoryInput, createdById: string): Promise<CategoryWithRelations> {
        return PrismaClient.category.create({
            data: { ...data, createdById },
            include: {
                parent: true,
                children: true,
            },
        });
    }

    // ============ READ ONE ============
    static async findById(id: string, createdById: string): Promise<CategoryWithRelations | null> {
        return PrismaClient.category.findUnique({
            where: { id, createdById },
            include: {
                parent: true,
                children: true,
                products: {
                    select: {
                        id: true,
                        name: true,
                        sku: true,
                        currentSellPrice: true,
                    },
                },
            },
        });
    }

    // ============ READ ONE - MINIMAL ============
    // For validation checks (parent exists, etc.)
    static async findByIdMinimal(id: string, createdById: string): Promise<Category | null> {
        return PrismaClient.category.findUnique({
            where: { id, createdById },
        });
    }

    // ============ CHECK IF EXISTS ============
    static async exists(id: string): Promise<boolean> {
        const count = await PrismaClient.category.count({
            where: { id },
        });
        return count > 0;
    }

    // ============ UPDATE ============
    static async update(
        id: string,
        data: UpdateCategoryInput,
        createdById: string
    ): Promise<CategoryWithRelations> {
        return PrismaClient.category.update({
            where: { id, createdById },
            data,
            include: {
                parent: true,
                children: true,

            },
        });
    }

    // ============ DELETE ============
    static async delete(id: string, createdById: string): Promise<void> {
        await PrismaClient.category.delete({
            where: { id, createdById },
        });
    }

    // ============ GET CHILDREN ============
    static async findChildren(id: string, createdById: string): Promise<Category[]> {
        return PrismaClient.category.findMany({
            where: { parentId: id, createdById },
        });
    }

    // ============ GET PARENT ============
    static async findParent(id: string, createdById: string): Promise<Category | null> {
        const category = await PrismaClient.category.findUnique({
            where: { id, createdById },
            select: { parentId: true },
        });

        if (!category?.parentId) return null;

        return PrismaClient.category.findUnique({
            where: { id: category.parentId },
        });
    }

    // ============ COUNT PRODUCTS ============
    static async countProducts(categoryId: string): Promise<number> {
        return PrismaClient.product.count({
            where: { categoryId },
        });
    }

    // ============ TRANSACTION: DELETE WITH CASCADE ============
    // Deletes category and all its subcategories, and nullifies product references
    static async deleteWithChildren(
        categoryId: string,
        childIds: string[],
        createdById: string
    ): Promise<void> {
        const allIds = [categoryId, ...childIds];

        await PrismaClient.$transaction([
            // 1. Null out categoryId on all affected products
            PrismaClient.product.updateMany({
                where: { categoryId: { in: allIds } },
                data: { categoryId: null },
            }),
            // 2. Delete subcategories first (avoid FK violation)
            PrismaClient.category.deleteMany({
                where: { id: { in: childIds }, createdById },
            }),
            // 3. Delete parent category
            PrismaClient.category.delete({
                where: { id: categoryId, createdById },
            }),
        ]);
    }

    // ============ COUNT BY PARENT ============
    static async countByParent(parentId: string | null, createdById: string): Promise<number> {
        return PrismaClient.category.count({
            where: { parentId, createdById },
        });
    }

    // ============ READ MANY - FLAT ============
    // Returns all categories in a flat list (useful for dropdowns)
    static async findManyFlat(createdById: string): Promise<Category[]> {
        return PrismaClient.category.findMany({
            where: { createdById },
            orderBy: [
                { parentId: 'asc' },
                { name: 'asc' },
            ],
        });
    }

    // ============ READ MANY - HIERARCHICAL ============
    // Returns only top-level categories with children nested
    static async findManyHierarchical(createdById: string): Promise<CategoryWithRelations[]> {
        return PrismaClient.category.findMany({
            where: { parentId: null, createdById }, // Only top-level
            include: {
                parent: true,
                children: {
                    orderBy: { name: 'asc' },
                },
            },
            orderBy: { name: 'asc' },
        });
    }
}


