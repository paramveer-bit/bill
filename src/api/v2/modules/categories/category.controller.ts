import asyncHandler from "@/helpers/asynchandeler.js";
import ApiError from "@/helpers/ApiError.js";
import ApiResponse from "@/helpers/ApiResponse.js";
import type { Request, Response } from "express";
import { getAuthUser } from '../auth.js';


import { CategoryService } from './category.service.js';
import {
    createCategorySchema,
    updateCategorySchema,
    listCategoriesSchema,
} from './category.schema.js';

const categoryService = new CategoryService();


// ============ CREATE CATEGORY ============
export const createCategory = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);

    // 1. Validate input
    const parsedData = createCategorySchema.safeParse(req.body);
    if (!parsedData.success) {
        throw new ApiError(400, 'Invalid category data');
    }

    // 2. Call service
    const category = await categoryService.createCategory(parsedData.data, authUser);

    // 3. Return response
    res.status(201).json(
        new ApiResponse('Category created successfully', category)
    );
});


// ============ GET ALL CATEGORIES ============
export const getCategories = asyncHandler(async (req: Request, res: Response) => {

    const authUser = getAuthUser(req);

    // 1. Validate query params
    const parsedParams = listCategoriesSchema.safeParse({
        flat: req.query.flat,
    });

    if (!parsedParams.success) {
        throw new ApiError(400, 'Invalid query parameters', parsedParams.error.issues);
    }

    // 2. Call service
    const result = await categoryService.getCategories(parsedParams.data, authUser);

    // 3. Return response
    res.status(200).json(
        new ApiResponse('Categories retrieved successfully', result)
    );
});

// ============ GET CATEGORY BY ID ============
export const getCategoryById = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
        throw new ApiError(400, 'Category ID is required');
    }

    const authUser = getAuthUser(req);
    // 1. Call service
    const category = await categoryService.getCategoryById(id, authUser);

    // 2. Return response
    res.status(200).json(
        new ApiResponse('Category retrieved successfully', category)
    );
});

// ============ UPDATE CATEGORY ============
export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    if (!id) {
        throw new ApiError(400, 'Category ID is required');
    }

    const authUser = getAuthUser(req);

    // 1. Validate input
    const parsedData = updateCategorySchema.safeParse(req.body);
    if (!parsedData.success) {
        throw new ApiError(400, 'Invalid category data');
    }

    // 2. Call service
    const category = await categoryService.updateCategory(id, parsedData.data, authUser);

    // 3. Return response
    res.status(200).json(
        new ApiResponse('Category updated successfully', category)
    );
});

// ============ DELETE CATEGORY ============
export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, 'Category ID is required');
    }
    const authUser = getAuthUser(req);

    // 1. Call service
    await categoryService.deleteCategory(id, authUser);

    // 2. Return response
    res.status(200).json(
        new ApiResponse('Category deleted successfully', null)
    );
});

// // ============ GET CATEGORY STATISTICS ============
// export const getCategoryStats = asyncHandler(async (req: Request, res: Response) => {
//   const { id } = req.params;

//   // 1. Call service
//   const stats = await categoryService.getCategoryStats(id);

//   // 2. Return response
//   res.status(200).json(
//     new ApiResponse('Category statistics retrieved', stats)
//   );
// });

// // ============ GET CATEGORY TREE ============
// export const getCategoryTree = asyncHandler(async (req: Request, res: Response) => {
//   // 1. Call service
//   const tree = await categoryService.getCategoryTree();

//   // 2. Return response
//   res.status(200).json(
//     new ApiResponse('Category tree retrieved', tree)
//   );
// });