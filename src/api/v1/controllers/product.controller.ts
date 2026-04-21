import asyncHandler from "../../../helpers/asynchandeler.js";
import ApiError from "../../../helpers/ApiError.js";
import ApiResponse from "../../../helpers/ApiResponse.js";
import type { Request, Response } from "express";
import PrismaClient from "../../../prismaClient/index.js"
import { productSchema } from "../schemas/product.schema.js";



// ─── Helpers ──────────────────────────────────────────────────────────────────

const productInclude = {
    category: true,
    unitConversions: true,
} as const;

export const createProduct = asyncHandler(async (req: Request, res: Response) => {
    const parsedData = productSchema.safeParse(req.body);
    if (!parsedData.success) {
        throw new ApiError(400, "Validation Error", parsedData.error.issues);
    }

    const { unitConversions, categoryId, ...productData } = parsedData.data;

    // Base unit itself must always be in conversions with qty 1
    // Merge it in so the base unit is always queryable from unitConversions
    const allConversions = [
        { unitName: productData.baseUnit, conversionQty: 1 },
        ...(unitConversions?.filter((u) => u.unitName !== productData.baseUnit) ?? []),
    ];

    const category_id = parsedData.data.categoryId ? parsedData.data.categoryId : null;
    if (category_id) {
        const category = await PrismaClient.category.findUnique({
            where: { id: category_id },
        });
        if (!category) {
            throw new ApiError(404, "Category not found");
        }
    }

    const product = await PrismaClient.product.create({
        data: {
            sku: productData.sku || "",
            name: productData.name,
            baseUnit: productData.baseUnit,
            currentSellPrice: productData.currentSellPrice,
            taxRate: productData.taxRate,
            isStockItem: productData.isStockItem !== undefined ? productData.isStockItem : false,
            ...(categoryId ? { category: { connect: { id: categoryId } } } : {}),
            unitConversions: {
                create: allConversions,
            },
        },
        include: productInclude,
    });

    res.status(201).json(new ApiResponse("Product created successfully", product));
});

export const getProducts = asyncHandler(async (req: Request, res: Response) => {
    const { categoryId, search, lowStockThreshold } = req.query;

    const products = await PrismaClient.product.findMany({
        where: {
            ...(categoryId
                ? { categoryId: categoryId as string }
                : {}),
            ...(search
                ? {
                    OR: [
                        { name: { contains: search as string, mode: "insensitive" } },
                        { sku: { contains: search as string, mode: "insensitive" } },
                    ],
                }
                : {}),
        },
        include: {
            ...productInclude,
            // 2. CRITICAL: Include purchaseBatches to calculate stock
            purchaseBatches: {
                where: { qtyRemaining: { gt: 0 } },
                select: { qtyRemaining: true }
            }
        },
        orderBy: { name: "asc" },
    });

    // 3. Transform data to calculate totalStockPcs on the server
    // This offloads the 'reduce' logic from the browser to the server
    let productsWithStock = products.map(product => {
        const totalStockPcs = product.purchaseBatches.reduce(
            (sum, b) => sum + b.qtyRemaining,
            0
        );
        return {
            ...product,
            totalStockPcs
        };
    });

    // 4. Backend-side Low Stock filtering
    // If the user passes ?lowStockThreshold=20, we filter the list here
    if (lowStockThreshold !== undefined) {
        const threshold = Number(lowStockThreshold);
        productsWithStock = productsWithStock.filter(
            p => p.totalStockPcs <= threshold
        );
    }

    res.status(200).json(
        new ApiResponse("Products retrieved successfully", productsWithStock)
    );
});



export const getProductById = asyncHandler(async (req: Request, res: Response) => {
    const productId = req.params.id;
    if (!productId) {
        throw new ApiError(400, "Product ID is required");
    }

    const product = await PrismaClient.product.findUnique({
        where: { id: productId },
        include: {
            ...productInclude,
            // also include current stock across all batches
            purchaseBatches: {
                select: { qtyRemaining: true },
            },
        },
    });
    if (!product) {
        throw new ApiError(404, "Product not found");
    }

    // Calculate total stock in base units
    const totalStockPcs = product.purchaseBatches.reduce(
        (sum, b) => sum + b.qtyRemaining,
        0
    );

    res.status(200).json(
        new ApiResponse("Product retrieved successfully", {
            ...product,
            totalStockPcs,
        })
    );
});

export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
    const productId = req.params.id;
    if (!productId) {
        throw new ApiError(400, "Product ID is required");
    }

    const productExists = await PrismaClient.product.findUnique({
        where: { id: productId },
    });
    if (!productExists) {
        throw new ApiError(404, "Product not found");
    }

    const parsedData = productSchema.safeParse(req.body);
    if (!parsedData.success) {
        throw new ApiError(400, "Validation Error", parsedData.error.issues);
    }

    const { unitConversions, categoryId, ...productData } = parsedData.data;

    const product = await PrismaClient.product.update({
        where: { id: productId },
        data: {

            sku: productData.sku || "",
            name: productData.name,
            baseUnit: productData.baseUnit,
            currentSellPrice: productData.currentSellPrice,
            taxRate: productData.taxRate,
            isStockItem: productData.isStockItem !== undefined ? productData.isStockItem : false,
            // Relation — connect, disconnect, or skip
            ...(categoryId !== undefined
                ? categoryId
                    ? { category: { connect: { id: categoryId } } }
                    : { category: { disconnect: true } }
                : {}),
            // If new conversions provided, replace all existing ones
            ...(unitConversions !== undefined
                ? {
                    unitConversions: {
                        deleteMany: {},
                        create: [
                            { unitName: productData.baseUnit ?? "", conversionQty: 1 },
                            ...unitConversions.filter((u) => u.unitName !== productData.baseUnit),
                        ],
                    },
                }
                : {}),
        },
        include: productInclude,
    });

    res.status(200).json(new ApiResponse("Product updated successfully", product));
});

// Kept as a dedicated endpoint but getProducts now also supports ?categoryId= 
export const getProductByCategory = asyncHandler(async (req: Request, res: Response) => {
    const categoryId = req.params.categoryId;
    if (!categoryId) {
        throw new ApiError(400, "Category ID is required");
    }

    // Also fetch products from subcategories of this category
    const subcategories = await PrismaClient.category.findMany({
        where: { parentId: categoryId },
        select: { id: true },
    });

    const allCategoryIds = [categoryId, ...subcategories.map((c) => c.id)];

    const products = await PrismaClient.product.findMany({
        where: { categoryId: { in: allCategoryIds } },
        include: productInclude,
        orderBy: { name: "asc" },
    });

    res.status(200).json(new ApiResponse("Products retrieved successfully", products));
});

// GET /api/products/:id/stock-info
// Returns FIFO-front batch MRP + total available qty
export const getProductStockInfo = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, "Product ID is required");
    }
    const batches = await PrismaClient.purchaseBatch.aggregate({
        where: { productId: id, qtyRemaining: { gt: 0 } },
        _sum: { qtyRemaining: true },
    });
    const stockBase = batches._sum.qtyRemaining ?? 0;
    return res.json(new ApiResponse("OK", { stockBase }));
});

export const getProductsByCategoryHierarchy = asyncHandler(async (req: Request, res: Response) => {
    // Fetch all categories with their products
    const categories = await PrismaClient.category.findMany({
        where: { parentId: null }, // Get root categories only
        include: {
            products: {
                include: productInclude,
                orderBy: { name: "asc" },
            },
            children: {
                include: {
                    products: {
                        include: productInclude,
                        orderBy: { name: "asc" },
                    },
                },
            },
        },
        orderBy: { name: "asc" },
    });

    // Transform to include total product count
    const groupedData = categories.map(cat => ({
        ...cat,
        productCount: cat.products.length + cat.children.reduce((sum, child) => sum + child.products.length, 0),
    }));

    res.status(200).json(new ApiResponse("Products grouped by category", groupedData));
});