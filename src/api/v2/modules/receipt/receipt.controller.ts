// src/api/v1/modules/receipt/receipt.controller.ts
import asyncHandler from "@/helpers/asynchandeler.js";
import ApiError from "@/helpers/ApiError.js";
import ApiResponse from "@/helpers/ApiResponse.js";
import type { Request, Response } from "express";
import { ReceiptService } from './receipt.service.js';
import type { ReceiptResponse } from './receipt.schema.js';
import { getAuthUser } from "../auth.js";
import {
    createReceiptSchema,
    listReceiptsSchema,
} from './receipt.schema.js';

const receiptService = new ReceiptService();

/**
 * Controller layer - ONLY handles HTTP request/response
 * All business logic is in service
 * 
 * ⚠️ NOTE: AuthUser is provided by middleware
 * Attached to req.user by auth middleware
 */

// Helper: Format receipt response
const formatReceiptResponse = (receipt: any): ReceiptResponse => ({
    id: receipt.id,
    customerId: receipt.customerId,
    customerName: receipt.customer?.name,
    amount: Number(receipt.amount),
    paymentMode: receipt.paymentMode,
    receiptDate: receipt.receiptDate.toISOString(),
    remarks: receipt.remarks,
    createdAt: receipt.createdAt.toISOString(),
    createdById: receipt.createdById,
    ...(receipt.customer && { customer: receipt.customer }),
});

// ============ CREATE RECEIPT ============
export const createReceipt = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);

    // 1. Validate input
    const parsedData = createReceiptSchema.safeParse(req.body);
    if (!parsedData.success) {
        throw new ApiError(400, 'Invalid receipt data', parsedData.error.issues);
    }

    // 2. Call service
    const receipt = await receiptService.createReceipt(parsedData.data, authUser);

    // 3. Return response
    res.status(201).json(
        new ApiResponse('Receipt created successfully', formatReceiptResponse(receipt))
    );
});

// ============ GET ALL RECEIPTS ============
export const getReceipts = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);

    // 1. Validate query params
    const parsedParams = listReceiptsSchema.safeParse({
        search: req.query.search,
        customerId: req.query.customerId,
        dateFilter: req.query.dateFilter,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 30,
        sortBy: req.query.sortBy,
        sortOrder: req.query.sortOrder,
    });

    if (!parsedParams.success) {
        throw new ApiError(400, 'Invalid query parameters', parsedParams.error.issues);
    }

    // 2. Call service
    const result = await receiptService.getReceipts(parsedParams.data, authUser);

    // 3. Return response
    res.status(200).json(
        new ApiResponse('Receipts retrieved successfully', {
            receipts: result.receipts.map(formatReceiptResponse),
            meta: result.meta,
            summary: result.summary,
        })
    );
});

// ============ GET RECEIPT BY ID ============
export const getReceiptById = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, 'Receipt ID is required');
    }

    // 1. Call service
    const receipt = await receiptService.getReceiptById(id, authUser);

    // 2. Return response
    res.status(200).json(
        new ApiResponse('Receipt retrieved successfully', formatReceiptResponse(receipt))
    );
});

// ============ DELETE RECEIPT ============
export const deleteReceipt = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, 'Receipt ID is required');
    }
    // 1. Call service
    await receiptService.deleteReceipt(id, authUser);

    // 2. Return response
    res.status(200).json(
        new ApiResponse('Receipt deleted successfully', null)
    );
});

// ============ GET CUSTOMER RECEIPTS ============
export const getCustomerReceipts = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    const { customerId } = req.params;

    if (!customerId) {
        throw new ApiError(400, 'Customer ID is required');
    }

    // 1. Call service
    const result = await receiptService.getCustomerReceipts(customerId, authUser);

    // 2. Return response
    res.status(200).json(
        new ApiResponse('Customer receipts retrieved successfully', {
            customer: result.customer,
            receipts: result.receipts.map(formatReceiptResponse),
            totalReceived: result.totalReceived,
        })
    );
});

// // ============ GET DAILY RECEIPT SUMMARY ============
// export const getDailyReceiptSummary = asyncHandler(async (req: Request, res: Response) => {
//     const authUser = getAuthUser(req);
//     const days = req.query.days ? parseInt(req.query.days as string) : 30;

//     // 1. Call service
//     const summary = await receiptService.getDailyReceiptSummary(days, authUser);

//     // 2. Return response
//     res.status(200).json(
//         new ApiResponse('Daily receipt summary retrieved successfully', summary)
//     );
// });


// ============ GET RECEIPT STATISTICS ============
// export const getReceiptStats = asyncHandler(async (req: Request, res: Response) => {
//     const authUser = getAuthUser(req);

//     // Get summary for past 30 days
//     const summary = await receiptService.getDailyReceiptSummary(30, authUser);

//     const totalAmount = summary.reduce((sum, day) => sum + day.totalAmount, 0);
//     const totalCount = summary.reduce((sum, day) => sum + day.count, 0);
//     const averageAmount = totalCount > 0 ? totalAmount / totalCount : 0;

//     // Group by payment mode
//     const byPaymentMode: Record<string, number> = {};
//     summary.forEach((day) => {
//         Object.entries(day.byPaymentMode).forEach(([mode, amount]) => {
//             byPaymentMode[mode] = (byPaymentMode[mode] || 0) + amount;
//         });
//     });

//     res.status(200).json(
//         new ApiResponse('Receipt statistics retrieved', {
//             period: '30 days',
//             totalAmount,
//             totalReceipts: totalCount,
//             averageAmount,
//             byPaymentMode,
//         })
//     );
// });