// src/api/v1/modules/purchase/purchase.controller.ts
import asyncHandler from "@/helpers/asynchandeler.js";
import ApiError from "@/helpers/ApiError.js";
import ApiResponse from "@/helpers/ApiResponse.js";
import type { Request, Response } from "express";
import { PurchaseService } from './purchase.service.js';
import {
    createPurchaseSchema,
    listPurchasesSchema,
} from './purchase.schema.js';
import { getAuthUser } from '../auth.js';
const purchaseService = new PurchaseService();

/**
 * Controller layer — ONLY handles HTTP request/response.
 * All business logic lives in PurchaseService.
 *
 * ⚠️ AuthUser is injected by verifyAuth middleware via req.user
 */



// ============ CREATE PURCHASE ============
export const createPurchase = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);

    const parsed = createPurchaseSchema.safeParse(req.body);
    if (!parsed.success) {
        throw new ApiError(400, "Error in data validation", parsed.error.issues);
    }

    const purchase = await purchaseService.createPurchase(parsed.data, authUser);

    res.status(201).json(new ApiResponse('Purchase created successfully', purchase));
});

// ============ GET ALL PURCHASES ============
export const getPurchases = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);

    const parsed = listPurchasesSchema.safeParse({
        supplierId: req.query.supplierId,
        invoiceNo: req.query.invoiceNo,
        search: req.query.search,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        dateFilter: req.query.dateFilter,
        page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 20,
    });

    if (!parsed.success) {
        throw new ApiError(400, "Invalid query parameters", parsed.error.issues);
    }

    const result = await purchaseService.getPurchases(parsed.data, authUser);

    res.status(200).json(
        new ApiResponse('Purchases fetched successfully', {
            purchases: result.purchases,
            meta: result.meta,
            summary: result.summary,
        })
    );
});

// ============ GET PURCHASE BY ID ============
export const getPurchaseById = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, "Purchase ID is required");
    }
    const purchase = await purchaseService.getPurchaseById(id, authUser);

    res.status(200).json(new ApiResponse('Purchase fetched successfully', purchase));
});

// ============ DELETE PURCHASE ============
export const deletePurchase = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    const { id } = req.params;

    if (!id) {
        throw new ApiError(400, "Purchase ID is required");
    }
    await purchaseService.deletePurchase(id, authUser);

    res.status(200).json(new ApiResponse('Purchase deleted successfully', null));
});