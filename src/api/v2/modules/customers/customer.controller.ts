import asyncHandler from "@/helpers/asynchandeler.js";
import ApiError from "@/helpers/ApiError.js";
import ApiResponse from "@/helpers/ApiResponse.js";
import type { Request, Response } from "express";
import { CustomerService } from './customer.service.js';
import {
    createCustomerSchema,
    updateCustomerSchema,
    listCustomersSchema,
} from './customer.schema.js';
import { getAuthUser } from '../auth.js';


const customerService = new CustomerService();


// ============ CREATE CUSTOMER ============
export const createCustomer = asyncHandler(async (req: Request, res: Response) => {
    //Get auth user 
    const authUser = getAuthUser(req);


    // 1. Validate input
    const parsedData = createCustomerSchema.safeParse(req.body);
    if (!parsedData.success) {
        throw new ApiError(400, 'Validation Error', parsedData.error.issues);
    }

    // 2. Call service
    const customer = await customerService.createCustomer(parsedData.data, authUser);

    // 3. Return response
    res.status(201).json(
        new ApiResponse('Customer created successfully', customer)
    );
});

// ============ LIST CUSTOMERS ============
export const listCustomers = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);


    // 1. Validate query params
    const parsedParams = listCustomersSchema.safeParse(req.query);
    if (!parsedParams.success) {
        throw new ApiError(400, 'Validation Error', parsedParams.error.issues);
    }

    // 2. Call service
    const result = await customerService.listCustomers(parsedParams.data, authUser);

    // 3. Return response
    res.status(200).json(
        new ApiResponse('Customers retrieved successfully', result)
    );
});

// ============ GET CUSTOMER BY ID ============
export const getCustomerById = asyncHandler(async (req: Request, res: Response) => {
    const authUser = getAuthUser(req);
    const customerId = req.params.id;
    if (!customerId) {
        throw new ApiError(400, 'Customer ID is required');
    }
    const customer = await customerService.getCustomerById(customerId, authUser);
    res.status(200).json(
        new ApiResponse('Customer retrieved successfully', customer)
    );
});

// ============ UPDATE CUSTOMER ============
export const updateCustomer = asyncHandler(async (req: Request, res: Response) => {
    const customerId = req.params.id;
    if (!customerId) {
        throw new ApiError(400, 'Customer ID is required');
    }
    const authUser = getAuthUser(req);
    // 1. Validate input
    const parsedData = updateCustomerSchema.safeParse(req.body);
    if (!parsedData.success) {
        throw new ApiError(400, 'Validation Error', parsedData.error.issues);
    }

    // 2. Call service
    const updatedCustomer = await customerService.updateCustomer(customerId, parsedData.data, authUser);

    // 3. Return response
    res.status(200).json(
        new ApiResponse('Customer updated successfully', updatedCustomer)
    );
});





