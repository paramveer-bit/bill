// src/api/v1/modules/product/product.service.ts
import { ProductRepository } from './product.repository.js';
import ApiError from '@/helpers/ApiError.js';
import type {
    CreateProductInput,
    UpdateProductInput,
    ListProductsInput,
    ProductWithStock,
    CategoryHierarchyWithProducts,
    UnitConversion,

} from './product.schema.js';
import { CategoryRepository } from '../categories/category.repository.js';
import type { AuthUser } from '../auth.schema.js';

/**
 * Service layer - Contains all business logic
 * Calls repository for data access
 * 
 * ⚠️ NOTE: All methods now receive AuthUser (from middleware)
 * This ensures data isolation per user
 */
export class ProductService {

    // ============ CREATE PRODUCT ============
    async createProduct(data: CreateProductInput, authUser: AuthUser): Promise<any> {
        // Business logic: Validate category if provided
        if (data.categoryId) {
            // TODO: Verify category belongs to user
            const categoryExists = await CategoryRepository.findByIdMinimal(data.categoryId, authUser.id);
            if (!categoryExists) {
                throw new ApiError(404, 'Category not found');
            }
        }

        // Business logic: Ensure base unit is included in conversions
        const allConversions = [
            { unitName: data.baseUnit, conversionQty: 1 },
            ...(data.unitConversions?.filter((u) => u.unitName !== data.baseUnit) ?? []),
        ];

        // Business logic: Check SKU uniqueness (per user)
        if (data.sku) {
            const existingSku = await ProductRepository.findBySku(data.sku, authUser.id);
            if (existingSku) {
                throw new ApiError(409, 'Product with this SKU already exists');
            }
        }

        // Create the product (with user association)
        return ProductRepository.create({
            ...data,
            unitConversions: allConversions,
            createdById: authUser.id, // ← Associate with user
        });
    }

    // ============ GET ALL PRODUCTS ============
    async getProducts(params: ListProductsInput, createdById: string): Promise<any> {
        const { categoryId = "", search = "", lowStockThreshold, page, limit } = params;
        const skip = (!page || !limit) ? undefined : (page - 1) * limit;

        // Get products with stock (only user's products)
        const products = await ProductRepository.findManyWithStock({
            skip,
            take: limit,
            createdById: createdById, // ← Filter by user
            categoryId,
            search,
        });

        // Business logic: Calculate total stock on server
        const productsWithStock = products.map((product) => {
            const totalStockPcs = product.purchaseBatches.reduce(
                (sum, batch) => sum + batch.qtyRemaining,
                0
            );
            return {
                ...product,
                totalStockPcs,
            };
        });

        // Business logic: Filter by low stock threshold if provided
        let filteredProducts = productsWithStock;
        if (lowStockThreshold !== undefined) {
            filteredProducts = productsWithStock.filter(
                (p) => p.totalStockPcs <= lowStockThreshold
            );
        }

        // Get total count for pagination (only user's products)
        const total = await ProductRepository.count({
            categoryId,
            search,
            createdById: createdById, // ← Filter by user
        });

        return {
            data: filteredProducts,
            pagination: limit ? {
                page,
                limit,
                totalRecords: total,
                totalPages: Math.ceil(total / limit),
            } : null,
        };
    }

    // ============ GET PRODUCT BY ID ============used
    async getProductById(id: string, authUser: AuthUser): Promise<ProductWithStock> {
        // Business logic: Validate ID
        if (!id?.trim()) {
            throw new ApiError(400, 'Product ID is required');
        }

        // Fetch product with stock info
        const product = await ProductRepository.findByIdWithStock(id);

        if (!product) {
            throw new ApiError(404, 'Product not found');
        }

        // ⚠️ SECURITY: Verify user owns this product
        if (product.createdById !== authUser.id) {
            throw new ApiError(403, 'You do not have access to this product');
        }

        // Business logic: Calculate total stock
        const totalStockPcs = product.purchaseBatches.reduce(
            (sum, batch) => sum + batch.qtyRemaining,
            0
        );

        return {
            ...product,
            totalStockPcs,
        };
    }

    // ============ UPDATE PRODUCT ============
    async updateProduct(
        id: string,
        data: UpdateProductInput,
        authUser: AuthUser
    ): Promise<any> {
        // Business logic: Validate ID
        if (!id?.trim()) {
            throw new ApiError(400, 'Invalid product ID');
        }

        // Business logic: Verify product exists
        const existingProduct = await ProductRepository.findByIdMinimal(id);
        if (!existingProduct) {
            throw new ApiError(404, 'Product not found');
        }

        // ⚠️ SECURITY: Verify user owns this product
        if (existingProduct.createdById !== authUser.id) {
            throw new ApiError(403, 'You do not have access to this product');
        }

        // Business logic: Validate category if updating
        if (data.categoryId) {
            const categoryExists = await CategoryRepository.findByIdMinimal(data.categoryId, authUser.id);
            if (!categoryExists) {
                throw new ApiError(404, 'Category not found');
            }
        }
        const { unitConversions, ...restData } = data;

        // Business logic: Ensure base unit is in conversions if updating both
        let conversions: UnitConversion[] | undefined;
        if (unitConversions && data.baseUnit) {
            conversions = [
                { unitName: data.baseUnit, conversionQty: 1 },
                ...unitConversions.filter((u) => u.unitName !== data.baseUnit),
            ];
        } else if (unitConversions) {
            conversions = unitConversions;
        }

        // Clean the data object: remove undefined values
        const updatePayload: Parameters<typeof ProductRepository.update>[1] = {};

        Object.entries(restData).forEach(([key, value]) => {
            if (value !== undefined) {
                (updatePayload as any)[key] = value;
            }
        });

        if (conversions !== undefined) {
            updatePayload.unitConversions = conversions;
        }
        return ProductRepository.update(id, updatePayload);

    }

    // ============ DELETE PRODUCT ============
    async deleteProduct(id: string, authUser: AuthUser): Promise<void> {
        // Business logic: Validate ID
        if (!id?.trim()) {
            throw new ApiError(400, 'Invalid product ID');
        }

        // Business logic: Verify product exists
        const existingProduct = await ProductRepository.findByIdMinimal(id);
        if (!existingProduct) {
            throw new ApiError(404, 'Product not found');
        }

        // ⚠️ SECURITY: Verify user owns this product
        if (existingProduct.createdById !== authUser.id) {
            throw new ApiError(403, 'You do not have access to this product');
        }

        // Delete the product
        await ProductRepository.delete(id);
    }

    // ============ GET PRODUCTS BY CATEGORY ============
    async getProductsByCategory(categoryId: string, authUser: AuthUser): Promise<any> {
        // Business logic: Validate category ID
        if (!categoryId?.trim()) {
            throw new ApiError(400, 'Category ID is required');
        }

        // Get products from this category and all subcategories (only user's)
        const products = await ProductRepository.findByCategory(categoryId, authUser.id);

        return {
            categoryId,
            count: products.length,
            data: products,
        };
    }

    // ============ GET PRODUCT STOCK INFO ============
    async getProductStockInfo(productId: string, authUser: AuthUser): Promise<any> {
        // Business logic: Validate product ID
        if (!productId?.trim()) {
            throw new ApiError(400, 'Product ID is required');
        }

        // Get product details
        const product = await ProductRepository.findByIdMinimal(productId);
        if (!product) {
            throw new ApiError(404, 'Product not found');
        }

        // ⚠️ SECURITY: Verify user owns this product
        if (product.createdById !== authUser.id) {
            throw new ApiError(403, 'You do not have access to this product');
        }

        // Get stock info
        const stockInfo = await ProductRepository.getStockInfo(productId);

        return {
            productId,
            productName: product.name,
            baseUnit: product.baseUnit,
            currentSellPrice: product.currentSellPrice,
            taxRate: product.taxRate,
            createdBy: authUser.email,
            ...stockInfo,
        };
    }

    // ============ GET PRODUCTS BY CATEGORY HIERARCHY ============
    async getProductsByHierarchy(authUser: AuthUser): Promise<CategoryHierarchyWithProducts[]> {
        const categories = await ProductRepository.getCategoriesWithProducts(authUser.id);

        // Business logic: Transform to include product counts
        const groupedData = categories.map((category) => ({
            ...category,
            productCount:
                category.products.length +
                category.children.reduce(
                    (sum: number, child: any) => sum + child.products.length,
                    0
                ),
        }));

        return groupedData;
    }

    // ============ GET PRODUCTS WITH LOW STOCK ============
    async getLowStockProducts(threshold: number, authUser: AuthUser): Promise<ProductWithStock[]> {
        // Business logic: Validate threshold
        if (threshold < 0) {
            throw new ApiError(400, 'Threshold cannot be negative');
        }

        // Get all products with stock (only user's)
        const products = await ProductRepository.findManyWithStock({
            skip: undefined,
            take: undefined,
            createdById: authUser.id,
        });

        // Calculate stock and filter
        const lowStockProducts = products
            .map((product) => ({
                ...product,
                totalStockPcs: product.purchaseBatches.reduce(
                    (sum, batch) => sum + batch.qtyRemaining,
                    0
                ),
            }))
            .filter((p) => p.totalStockPcs <= threshold)
            .sort((a, b) => a.totalStockPcs - b.totalStockPcs);

        return lowStockProducts;
    }

    // ============ GET PRODUCT STATISTICS ============
    async getProductStats(authUser: AuthUser): Promise<any> {
        const allProducts = await ProductRepository.findMany({
            createdById: authUser.id, // ← Only user's products
        });

        const stockProducts = allProducts.filter((p) => p.isStockItem);
        const nonStockProducts = allProducts.filter((p) => !p.isStockItem);

        return {
            totalProducts: allProducts.length,
            stockItems: stockProducts.length,
            nonStockItems: nonStockProducts.length,
            averagePrice: allProducts.length > 0
                ? allProducts.reduce((sum, p) => (sum) + (p.currentSellPrice?.toNumber() ?? 0), 0) / allProducts.length
                : 0,
            averageTaxRate: allProducts.length > 0
                ? allProducts.reduce((sum, p) => sum + (p.taxRate?.toNumber() ?? 0), 0) / allProducts.length
                : 0,
        };
    }
}