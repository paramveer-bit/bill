import asyncHandler from "../../../helpers/asynchandeler.js";
import ApiError from "../../../helpers/ApiError.js";
import ApiResponse from "../../../helpers/ApiResponse.js";
import type { Request, Response } from "express";
import PrismaClient from "../../../prismaClient/index.js"
import { categorySchema } from "../schemas/category.schema.js"



export const createCategory = asyncHandler(async (req: Request, res: Response) => {
    const parsedData = categorySchema.safeParse(req.body);
    if (!parsedData.success) {
        throw new ApiError(400, "Validation Error", parsedData.error.issues);
    }

    // If parentId provided, verify it exists
    if (parsedData.data.parentId) {
        const parent = await PrismaClient.category.findUnique({
            where: { id: parsedData.data.parentId },
        });
        if (!parent) {
            throw new ApiError(404, "Parent category not found");
        }
        // Prevent nesting beyond 1 level (subcategory can't have a subcategory as parent)
        if (parent.parentId !== null) {
            throw new ApiError(400, "Cannot create category under a subcategory (max 2 levels)");
        }
    }
    if (parsedData.data.parentId === "") {
        parsedData.data.parentId = null;
    }
    const category = await PrismaClient.category.create({
        data: parsedData.data,
        include: {
            parent: true,
            children: true,
        },
    });
    res.status(201).json(new ApiResponse("Category created successfully", category));
});

export const getCategories = asyncHandler(async (req: Request, res: Response) => {
    const { flat } = req.query;

    // ?flat=true → return all categories without nesting (useful for dropdowns)
    if (flat === "true") {
        const categories = await PrismaClient.category.findMany({
            orderBy: [{ parentId: "asc" }, { name: "asc" }],
        });
        return res.status(200).json(new ApiResponse("Categories retrieved successfully", categories));
    }

    // Default: return only top-level with children nested inside
    const categories = await PrismaClient.category.findMany({
        where: { parentId: null },
        include: {
            children: {
                orderBy: { name: "asc" },
            },
        },
        orderBy: { name: "asc" },
    });

    res.status(200).json(new ApiResponse("Categories retrieved successfully", categories));
});


export const getCategoryById = asyncHandler(async (req: Request, res: Response) => {
    const categoryId = req.params.id
    if (!categoryId) {
        throw new ApiError(404, "Category id is required");
    }
    const category = await PrismaClient.category.findUnique({
        where: { id: categoryId },
        include: {
            parent: true,     // show parent if this is a subcategory
            children: true,   // show subcategories if this is a top-level
            products: {
                select: { id: true, name: true, sku: true, currentSellPrice: true },
            },
        },
    });

    if (!category) {
        throw new ApiError(404, "Category not found");
    }

    res.status(200).json(new ApiResponse("Category retrieved successfully", category));
});

export const updateCategory = asyncHandler(async (req: Request, res: Response) => {
    const categoryId = req.params.id;
    if (!categoryId) {
        throw new ApiError(400, "Invalid category ID");
    }

    const parsedData = categorySchema.safeParse(req.body);
    if (!parsedData.success) {
        throw new ApiError(400, "Validation Error", parsedData.error.issues);
    }

    // If updating parentId, run the same validations as create
    if (parsedData.data.parentId) {
        if (parsedData.data.parentId === categoryId) {
            throw new ApiError(400, "Category cannot be its own parent");
        }
        const parent = await PrismaClient.category.findUnique({
            where: { id: parsedData.data.parentId },
        });
        if (!parent) {
            throw new ApiError(404, "Parent category not found");
        }
        if (parent.parentId !== null) {
            throw new ApiError(400, "Cannot nest under a subcategory (max 2 levels)");
        }
    }

    const category = await PrismaClient.category.update({
        where: { id: categoryId },
        data: parsedData.data,
        include: {
            parent: true,
            children: true,
        },
    });

    res.status(200).json(new ApiResponse("Category updated successfully", category));
});


export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
    const categoryId = req.params.id;
    if (!categoryId) {
        throw new ApiError(400, "Invalid category ID");
    }

    const category = await PrismaClient.category.findUnique({
        where: { id: categoryId },
        include: {
            children: { select: { id: true } },
        },
    });

    if (!category) {
        throw new ApiError(404, "Category not found");
    }

    // Collect IDs to clean up: the category itself + all its subcategories
    const childIds = category.children.map((c) => c.id);
    const allIds = [categoryId, ...childIds];

    // Run everything in a transaction so it's atomic
    await PrismaClient.$transaction([
        // 1. Null out categoryId on all affected products
        PrismaClient.product.updateMany({
            where: { categoryId: { in: allIds } },
            data: { categoryId: null },
        }),
        // 2. Delete subcategories first (to avoid FK violation on parent)
        PrismaClient.category.deleteMany({
            where: { id: { in: childIds } },
        }),
        // 3. Delete the parent category itself
        PrismaClient.category.delete({
            where: { id: categoryId },
        }),
    ]);

    res.status(200).json(new ApiResponse("Category deleted successfully", null));
});



