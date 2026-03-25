import asyncHandler from "../helpers/asynchandeler.js";
import ApiError from "../helpers/ApiError.js";
import ApiResponse from "../helpers/ApiResponse.js";
import type { Request, Response } from "express";
import PrismaClient from "../prismaClient/index.js"
import { z } from "zod"



const customerSchema = z.object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Invalid email address"),
    phone: z.string().min(10, "Phone number must be at least 10 digits"),
    gstNumber: z.string(),
    address: z.string(),
    town: z.string().min(5, "Town name is necessary")
});


export const createCustomer = asyncHandler(async (req: Request, res: Response) => {
    const parsedData = customerSchema.safeParse(req.body);
    if (!parsedData.success) {
        throw new ApiError(400, "Validation Error", parsedData.error.issues);
    }
    const customer = await PrismaClient.customer.create({
        data: parsedData.data,
    });
    res.status(201).json(new ApiResponse("Customer created successfully", customer));
});

export const getCustomers = asyncHandler(async (req: Request, res: Response) => {
    const customers = await PrismaClient.customer.findMany();
    res.status(200).json(new ApiResponse("Customers retrieved successfully", customers));
});

export const getCustomerById = asyncHandler(async (req: Request, res: Response) => {
    const customerId = req.params.id
    if (!customerId) {
        throw new ApiError(404, "Customer id is required");
    }
    const customer = await PrismaClient.customer.findUnique({
        where: { id: customerId },
    });
    if (!customer) {
        throw new ApiError(404, "Customer not found");
    }
    res.status(200).json(new ApiResponse("Customer retrieved successfully", customer));
});

export const updateCustomer = asyncHandler(async (req: Request, res: Response) => {
    const customerId = req.params.id
    if (!customerId) {
        throw new ApiError(404, "Customer id is required");
    }
    const parsedData = customerSchema.safeParse(req.body);
    if (!parsedData.success) {
        throw new ApiError(400, "Validation Error", parsedData.error.issues);
    }
    console.log(parsedData)
    const customer = await PrismaClient.customer.update({
        where: { id: customerId },
        data: parsedData.data,
    });
    res.status(200).json(new ApiResponse("Customer updated successfully", customer));
});

