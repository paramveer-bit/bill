// src/api/v1/modules/sale/sale.controller.ts
import asyncHandler from "@/helpers/asynchandeler.js";
import ApiError from "@/helpers/ApiError.js";
import ApiResponse from "@/helpers/ApiResponse.js";
import type { Request, Response } from "express";
import { SaleService } from './sale.service.js';
import { createSaleSchema, listSalesSchema } from './sale.schema.js';
import { getAuthUser } from "../auth.js";
const saleService = new SaleService();

/**
 * Controller layer — ONLY handles HTTP request/response.
 * All business logic lives in SaleService.
 *
 * ⚠️ AuthUser is injected by verifyAuth middleware via req.user
 */



// ============ CREATE SALE ============
export const createSale = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);

    const parsed = createSaleSchema.safeParse(req.body);
    if (!parsed.success) {
        throw new ApiError(400, 'Invalid request body', parsed.error.issues);
    }

    const sale = await saleService.createSale(parsed.data, authUser);

    res.status(201).json(new ApiResponse('Sale created successfully', { sale }));
});

// ============ GET ALL SALES ============
export const getSales = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);

    const parsed = listSalesSchema.safeParse({
        search: req.query.search,
        dateFilter: req.query.dateFilter,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        customerId: req.query.customerId,
        sortBy: req.query.sortBy,
        sortOrder: req.query.sortOrder,
        page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 30,
    });

    if (!parsed.success) {
        throw new ApiError(400, 'Invalid query parameters', parsed.error.issues);
    }

    const result = await saleService.getSales(parsed.data, authUser);

    res.status(200).json(
        new ApiResponse('Sales fetched successfully', {
            sales: result.sales,
            meta: result.meta,
            summary: result.summary,
        })
    );
});

// ============ GET SALES SUMMARY ============
export const getSalesSummary = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);

    const summary = await saleService.getSalesSummary(authUser);

    res.status(200).json(new ApiResponse('Summary fetched', summary));
});

// ============ GET SALE BY ID ============
export const getSaleById = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, 'Sale ID is required');
    }
    const sale = await saleService.getSaleById(id, authUser);

    res.status(200).json(new ApiResponse('Sale fetched successfully', { sale }));
});

// ============ DELETE SALE ============
export const deleteSale = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, 'Sale ID is required');
    }
    await saleService.deleteSale(id, authUser);

    res.status(200).json(new ApiResponse('Sale deleted successfully', {}));
});