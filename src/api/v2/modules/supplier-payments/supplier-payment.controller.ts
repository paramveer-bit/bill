// src/api/v1/modules/supplier-payment/supplier-payment.controller.ts
import asyncHandler from "@/helpers/asynchandeler.js";
import ApiError from "@/helpers/ApiError.js";
import ApiResponse from "@/helpers/ApiResponse.js";
import type { Request, Response } from "express";
import { SupplierPaymentService } from './supplier-payment.service.js';
import type { SupplierPaymentResponse } from './supplier-payment.schema.js';
import {
    createSupplierPaymentSchema,
    updateSupplierPaymentSchema,
    listSupplierPaymentsSchema,
} from './supplier-payment.schema.js';
import { getAuthUser } from '../auth.js';
const supplierPaymentService = new SupplierPaymentService();

/**
 * Controller layer - ONLY handles HTTP request/response
 * All business logic is in service
 * 
 * ⚠️ NOTE: AuthUser is provided by middleware
 * Attached to req.user by auth middleware
 */


// Helper: Format supplier payment response
const formatSupplierPaymentResponse = (payment: any): SupplierPaymentResponse => ({
    id: payment.id,
    supplierId: payment.supplierId,
    supplierName: payment.supplier?.name,
    amount: typeof payment.amount === 'number' ? payment.amount : payment.amount.toNumber(),
    paymentMode: payment.paymentMode,
    paymentDate: payment.paymentDate instanceof Date ? payment.paymentDate.toISOString() : payment.paymentDate,
    checkNo: payment.checkNo,
    transactionId: payment.transactionId,
    remarks: payment.remarks,
    reference: payment.reference,
    createdAt: payment.createdAt instanceof Date ? payment.createdAt.toISOString() : payment.createdAt,
    createdById: payment.createdById,
    ...(payment.supplier && { supplier: payment.supplier }),
});

// ============ CREATE SUPPLIER PAYMENT ============
export const createSupplierPayment = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);

    // 1. Validate input
    const parsedData = createSupplierPaymentSchema.safeParse(req.body);
    if (!parsedData.success) {
        throw new ApiError(400, "Invalid input data", parsedData.error.issues);
    }

    // 2. Call service
    const payment = await supplierPaymentService.createSupplierPayment(parsedData.data, authUser);

    // 3. Return response
    res.status(201).json(
        new ApiResponse('Supplier payment created successfully', formatSupplierPaymentResponse(payment))
    );
});

// ============ GET ALL SUPPLIER PAYMENTS ============
export const getSupplierPayments = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);

    // 1. Validate query params
    const parsedParams = listSupplierPaymentsSchema.safeParse({
        supplierId: req.query.supplierId,
        paymentMode: req.query.paymentMode,
        search: req.query.search,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        sortBy: req.query.sortBy,
        sortOrder: req.query.sortOrder,
    });

    if (!parsedParams.success) {
        throw new ApiError(400, "Invalid query parameters", parsedParams.error.issues);
    }

    // 2. Call service
    const result = await supplierPaymentService.getSupplierPayments(parsedParams.data, authUser);

    // 3. Return response
    res.status(200).json(
        new ApiResponse('Supplier payments retrieved successfully', {
            payments: result.payments.map(formatSupplierPaymentResponse),
            meta: result.meta,
            summary: result.summary,
        })
    );
});

// ============ GET SUPPLIER PAYMENT BY ID ============
export const getSupplierPaymentById = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, "Payment ID is required");
    }
    // 1. Call service
    const payment = await supplierPaymentService.getSupplierPaymentById(id, authUser);

    // 2. Return response
    res.status(200).json(
        new ApiResponse('Supplier payment retrieved successfully', formatSupplierPaymentResponse(payment))
    );
});

// ============ UPDATE SUPPLIER PAYMENT ============
export const updateSupplierPayment = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, "Payment ID is required");
    }
    // 1. Validate input
    const parsedData = updateSupplierPaymentSchema.safeParse(req.body);
    if (!parsedData.success) {
        throw new ApiError(400, "Invalid input data", parsedData.error.issues);
    }

    // 2. Call service
    const payment = await supplierPaymentService.updateSupplierPayment(id, parsedData.data, authUser);

    // 3. Return response
    res.status(200).json(
        new ApiResponse('Supplier payment updated successfully', formatSupplierPaymentResponse(payment))
    );
});

// ============ DELETE SUPPLIER PAYMENT ============
export const deleteSupplierPayment = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    const { id } = req.params;

    if (!id) {
        throw new ApiError(400, "Payment ID is required");
    }
    // 1. Call service
    await supplierPaymentService.deleteSupplierPayment(id, authUser);

    // 2. Return response
    res.status(200).json(
        new ApiResponse('Supplier payment deleted successfully', null)
    );
});

// ============ GET SUPPLIER PAYMENTS BY SUPPLIER ============
export const getSupplierPaymentsBySupplier = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    const { supplierId } = req.params;
    if (!supplierId) {
        throw new ApiError(400, "Supplier ID is required");
    }
    // 1. Call service
    const result = await supplierPaymentService.getSupplierPaymentsBySupplier(supplierId, authUser);

    // 2. Return response
    res.status(200).json(
        new ApiResponse('Supplier payments retrieved successfully', {
            supplier: result.supplier,
            payments: result.payments.map(formatSupplierPaymentResponse),
            totalPaid: result.totalPaid,
            paymentCount: result.paymentCount,
        })
    );
});

// ============ GET DAILY PAYMENT SUMMARY ============
// export const getDailyPaymentSummary = asyncHandler(async (req: Request, res: Response) => {
//     const authUser = getAuthUser(req);
//     const days = req.query.days ? parseInt(req.query.days as string) : 30;

//     // 1. Call service
//     const summary = await supplierPaymentService.getDailyPaymentSummary(days, authUser);

//     // 2. Return response
//     res.status(200).json(
//         new ApiResponse('Daily payment summary retrieved successfully', summary)
//     );
// });

// // ============ GET PAYMENT STATISTICS ============
// export const getPaymentStats = asyncHandler(async (req: Request, res: Response) => {
//     const authUser = getAuthUser(req);
//     const days = req.query.days ? parseInt(req.query.days as string) : 30;

//     // 1. Call service
//     const stats = await supplierPaymentService.getPaymentStats(days, authUser);

//     // 2. Return response
//     res.status(200).json(
//         new ApiResponse('Payment statistics retrieved', stats)
//     );
// });