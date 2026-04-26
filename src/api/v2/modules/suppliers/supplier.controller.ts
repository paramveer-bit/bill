// src/api/v1/modules/supplier/supplier.controller.ts
import asyncHandler from "@/helpers/asynchandeler.js";
import ApiError from "@/helpers/ApiError.js";
import ApiResponse from "@/helpers/ApiResponse.js";
import type { Request, Response } from "express";
import { SupplierService } from './supplier.service.js';
import type { SupplierResponse } from './supplier.schema.js';

import {
    createSupplierSchema,
    updateSupplierSchema,
    listSuppliersSchema,
} from './supplier.schema.js';
import { getAuthUser } from "../auth.js";
const supplierService = new SupplierService();

/**
 * Controller layer - ONLY handles HTTP request/response
 * All business logic is in service
 * 
 * ⚠️ NOTE: AuthUser is provided by middleware
 * It should be attached to req.user by your auth middleware
 */



// Helper: Format supplier response
const formatSupplierResponse = (supplier: any): SupplierResponse => ({
    id: supplier.id,
    name: supplier.name,
    contactName: supplier.contactName,
    phone: supplier.phone,
    email: supplier.email,
    gstNumber: supplier.gstNumber,
    address: supplier.address,
    balance: typeof supplier.balance === 'number' ? supplier.balance : supplier.balance.toNumber(),
    openingBalance: typeof supplier.openingBalance === 'number' ? supplier.openingBalance : supplier.openingBalance.toNumber(),
    createdAt: supplier.createdAt instanceof Date ? supplier.createdAt.toISOString() : supplier.createdAt,
    createdById: supplier.createdById,
});

// ============ CREATE SUPPLIER ============ used
export const createSupplier = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);

    // 1. Validate input
    const parsedData = createSupplierSchema.safeParse(req.body);
    if (!parsedData.success) {
        throw new ApiError(400, 'Invalid supplier data', parsedData.error.issues);
    }

    // 2. Call service with auth user
    const supplier = await supplierService.createSupplier(parsedData.data, authUser);

    // 3. Return response
    res.status(201).json(
        new ApiResponse('Supplier created successfully', formatSupplierResponse(supplier))
    );
});

// ============ GET ALL SUPPLIERS ============
export const getSuppliers = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);

    // 1. Validate query params
    const parsedParams = listSuppliersSchema.safeParse({
        search: req.query.search,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
        sortBy: req.query.sortBy,
        sortOrder: req.query.sortOrder,
    });

    if (!parsedParams.success) {
        throw new ApiError(400, 'Invalid query parameters', parsedParams.error.issues);
    }

    // 2. Call service with auth user
    const result = await supplierService.getSuppliers(parsedParams.data, authUser);

    // 3. Return response
    res.status(200).json(
        new ApiResponse('Suppliers retrieved successfully', {
            data: result.data.map(formatSupplierResponse),
            meta: result.meta,
        })
    );
});

//------------------------GET ALL SUPPLIERS WITH BALANCE------------------------
export const getAllSuppliers = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    // 1. Call service with auth user
    const suppliers = await supplierService.getSuppliersWithBalance(authUser);
    // 2. Return response
    res.status(200).json(
        new ApiResponse('Suppliers with balance retrieved', {
            count: suppliers.length,
            data: suppliers.map(formatSupplierResponse),
        })
    );
});

// ============ GET SUPPLIER BY ID ============
export const getSupplierById = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, 'Supplier ID is required');
    }
    // 1. Call service with auth user
    const supplier = await supplierService.getSupplierById(id, authUser);

    // 2. Return response
    res.status(200).json(
        new ApiResponse('Supplier retrieved successfully', formatSupplierResponse(supplier))
    );
});

// ============ UPDATE SUPPLIER ============
export const updateSupplier = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    const { id } = req.params;

    if (!id) {
        throw new ApiError(400, 'Supplier ID is required');
    }
    // 1. Validate input
    const parsedData = updateSupplierSchema.safeParse(req.body);
    if (!parsedData.success) {
        throw new ApiError(400, 'Invalid supplier data', parsedData.error.issues);
    }

    // 2. Call service with auth user
    const supplier = await supplierService.updateSupplier(id, parsedData.data, authUser);

    // 3. Return response
    res.status(200).json(
        new ApiResponse('Supplier updated successfully', formatSupplierResponse(supplier))
    );
});

// ============ DELETE SUPPLIER ============
export const deleteSupplier = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, 'Supplier ID is required');
    }
    // 1. Call service with auth user
    await supplierService.deleteSupplier(id, authUser);

    // 2. Return response
    res.status(200).json(
        new ApiResponse('Supplier deleted successfully', null)
    );
});

// ============ GET SUPPLIER STATISTICS ============
export const getSupplierStats = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    const { id } = req.params;

    if (!id) {
        throw new ApiError(400, 'Supplier ID is required');
    }
    // 1. Call service with auth user
    const stats = await supplierService.getSupplierStats(id, authUser);

    // 2. Return response
    res.status(200).json(
        new ApiResponse('Supplier statistics retrieved', stats)
    );
});

// ============ GET SUPPLIERS WITH BALANCE ============
export const getSuppliersWithBalance = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);

    // 1. Call service with auth user
    const suppliers = await supplierService.getSuppliersWithBalance(authUser);

    // 2. Return response
    res.status(200).json(
        new ApiResponse('Suppliers with balance retrieved', {
            count: suppliers.length,
            data: suppliers,
        })
    );
});

// ============ GET HIGH PAYABLE SUPPLIERS ============
export const getHighPayableSuppliers = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    const threshold = req.query.threshold ? parseFloat(req.query.threshold as string) : 0;

    // 1. Call service with auth user
    const suppliers = await supplierService.getHighPayableSuppliers(threshold, authUser);

    // 2. Return response
    res.status(200).json(
        new ApiResponse(`Suppliers with payable >= ${threshold}`, {
            threshold,
            count: suppliers.length,
            data: suppliers,
        })
    );
});