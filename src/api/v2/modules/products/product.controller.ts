import asyncHandler from "@/helpers/asynchandeler.js";
import ApiError from "@/helpers/ApiError.js";
import ApiResponse from "@/helpers/ApiResponse.js";
import type { Request, Response } from "express";
import { ProductService } from './product.service.js';
import {
    createProductSchema,
    updateProductSchema,
    listProductsSchema,
} from './product.schema.js';
import { getAuthUser } from '../auth.js';
const productService = new ProductService();

/**
 * Controller layer - ONLY handles HTTP request/response
 * All business logic is in service
 * 
 * ⚠️ NOTE: AuthUser is provided by middleware
 * It should be attached to req.user by your auth middleware
 */

// Helper: Extract auth user from request


// ============ CREATE PRODUCT ============
export const createProduct = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);

    // 1. Validate input
    const parsedData = createProductSchema.safeParse(req.body);
    if (!parsedData.success) {
        throw new ApiError(400, 'Invalid input data', parsedData.error.issues);
    }

    // 2. Call service with auth user
    const product = await productService.createProduct(parsedData.data, authUser);

    // 3. Return response
    res.status(201).json(
        new ApiResponse('Product created successfully', product)
    );
});

// ============ GET ALL PRODUCTS ============
export const getProducts = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);

    // 1. Validate query params
    const parsedParams = listProductsSchema.safeParse({
        categoryId: req.query.categoryId,
        search: req.query.search,
        lowStockThreshold: req.query.lowStockThreshold,
        page: req.query.page ? parseInt(req.query.page as string) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    });
    console.log("Parsed query params:", parsedParams, req.query);
    if (!parsedParams.success) {
        throw new ApiError(400, 'Invalid query parameters');
    }

    // 2. Call service with auth user
    const result = await productService.getProducts(parsedParams.data, authUser.id);

    // 3. Return response
    res.status(200).json(
        new ApiResponse('Products retrieved successfully', result)
    );
});

// ============ GET ALL PRODUCTS ============
export const getProductsForSale = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);

    // 1. Validate query params
    const parsedParams = listProductsSchema.safeParse({
        categoryId: req.query.categoryId,
        search: req.query.search,
        lowStockThreshold: req.query.lowStockThreshold,
    });
    console.log("Parsed query params:", parsedParams, req.query);
    if (!parsedParams.success) {
        throw new ApiError(400, 'Invalid query parameters');
    }

    // 2. Call service with auth user
    const result = await productService.getProducts(parsedParams.data, authUser.id);

    // 3. Return response
    res.status(200).json(
        new ApiResponse('Products retrieved successfully', result)
    );
});

// ============ GET PRODUCT BY ID ============
export const getProductById = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    const { id } = req.params;

    if (!id) {
        throw new ApiError(400, "Product ID is required");
    }
    // 1. Call service with auth user
    const product = await productService.getProductById(id, authUser);

    // 2. Return response
    res.status(200).json(
        new ApiResponse('Product retrieved successfully', product)
    );
});

// ============ UPDATE PRODUCT ============
export const updateProduct = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, "Product ID is required");
    }
    // 1. Validate input
    const parsedData = updateProductSchema.safeParse(req.body);
    if (!parsedData.success) {
        throw new ApiError(400, 'Invalid input data');
    }

    // 2. Call service with auth user
    const product = await productService.updateProduct(id, parsedData.data, authUser);

    // 3. Return response
    res.status(200).json(
        new ApiResponse('Product updated successfully', product)
    );
});

// ============ DELETE PRODUCT ============
export const deleteProduct = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    const { id } = req.params;

    if (!id) {
        throw new ApiError(400, "Product ID is required");
    }
    // 1. Call service with auth user
    await productService.deleteProduct(id, authUser);

    // 2. Return response
    res.status(200).json(
        new ApiResponse('Product deleted successfully', null)
    );
});

// ============ GET PRODUCTS BY CATEGORY ============
export const getProductsByCategory = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    const { categoryId } = req.params;

    if (!categoryId) {
        throw new ApiError(400, "Category ID is required");
    }
    // 1. Call service with auth user
    const result = await productService.getProductsByCategory(categoryId, authUser);

    // 2. Return response
    res.status(200).json(
        new ApiResponse('Products retrieved successfully', result)
    );
});

// ============ GET PRODUCT STOCK INFO ============
export const getProductStockInfo = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, "Product ID is required");
    }
    // 1. Call service with auth user
    const stockInfo = await productService.getProductStockInfo(id, authUser);

    // 2. Return response
    res.status(200).json(
        new ApiResponse('Stock information retrieved', stockInfo)
    );
});

// ============ GET PRODUCTS BY CATEGORY HIERARCHY ============
export const getProductsByHierarchy = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);

    // 1. Call service with auth user
    const result = await productService.getProductsByHierarchy(authUser);

    // 2. Return response
    res.status(200).json(
        new ApiResponse('Products grouped by category hierarchy', result)
    );
});

// ============ GET LOW STOCK PRODUCTS ============
export const getLowStockProducts = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    const threshold = req.query.threshold ? parseInt(req.query.threshold as string) : 10;

    // 1. Call service with auth user
    const products = await productService.getLowStockProducts(threshold, authUser);

    // 2. Return response
    res.status(200).json(
        new ApiResponse(`Products with stock <= ${threshold}`, {
            threshold,
            count: products.length,
            data: products,
        })
    );
});

// ============ GET PRODUCT STATISTICS ============
export const getProductStats = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);

    // 1. Call service with auth user
    const stats = await productService.getProductStats(authUser);

    // 2. Return response
    res.status(200).json(
        new ApiResponse('Product statistics', stats)
    );
});