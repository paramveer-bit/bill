import asyncHandler from "../helpers/asynchandeler.js";
import ApiError from "../helpers/ApiError.js";
import ApiResponse from "../helpers/ApiResponse.js";
import type { Request, Response } from "express";
import PrismaClient from "../prismaClient/index.js"
import { z } from "zod"


const supplierSchema = z.object({
    name: z.string().min(1, "Name is required"),
    contactName: z.string(),
    email: z.string().email("Invalid email address"),
    phone: z.string().min(10, "Phone number must be at least 10 digits"),
    gstNumber: z.string(),
    address: z.string(),
});


const createSupplier = asyncHandler(async (req: Request, res: Response) => {
    const parsedData = supplierSchema.safeParse(req.body);
    if (!parsedData.success) {
        throw new ApiError(400, "Validation Error", parsedData.error.issues);
    }
    const supplier = await PrismaClient.supplier.create({
        data: parsedData.data,
    });
    res.status(201).json(new ApiResponse("Supplier created successfully", supplier));
});

const getSuppliers = asyncHandler(async (req: Request, res: Response) => {
    const suppliers = await PrismaClient.supplier.findMany(
        {
            orderBy: { name: "asc" },
        }
    );
    res.status(200).json(new ApiResponse("Suppliers retrieved successfully", suppliers));
});

const getSupplierById = asyncHandler(async (req: Request, res: Response) => {
    const supplierId = req.params.id;
    if (!supplierId) throw new ApiError(400, "Supplier id is required");
    const supplier = await PrismaClient.supplier.findUnique({
        where: { id: supplierId },
    });
    if (!supplier) {
        throw new ApiError(404, "Supplier not found");
    }
    res.status(200).json(new ApiResponse("Supplier retrieved successfully", supplier));
});

const updateSupplier = asyncHandler(async (req: Request, res: Response) => {
    const supplierId = req.params.id
    if (!supplierId) throw new ApiError(400, "Supplier id is required");

    const parsedData = supplierSchema.safeParse(req.body);

    if (!parsedData.success) {
        throw new ApiError(400, "Validation Error", parsedData.error.issues);
    }
    const supplier = await PrismaClient.supplier.update({
        where: { id: supplierId },
        data: parsedData.data,
    });
    res.status(200).json(new ApiResponse("Supplier updated successfully", supplier));
});


// ---------------------------------------------Supplier Payments--------------------------------------------------

const supplierPaymentSchema = z.object({
    supplierId: z.string().min(1, "Supplier ID is required"),
    amount: z.number().min(0.01, "Amount must be at least 0.01"),
    paymentDate: z.string(),
    paymentMode: z.string(),
    reference: z.string(),
});

const addSupplierPayment = asyncHandler(async (req: Request, res: Response) => {
    const parsedData = supplierPaymentSchema.safeParse(req.body);
    if (!parsedData.success) {
        throw new ApiError(400, "Validation Error", parsedData.error.issues);
    }
    const { supplierId, amount, paymentDate, paymentMode, reference } = parsedData.data;

    const payment = await PrismaClient.supplierPayment.create({
        data: {
            supplierId,
            amount,
            paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
            paymentMode,
            reference,
        },
    });
    res.status(201).json(new ApiResponse("Supplier payment added successfully", payment));
});

const getSupplierPayments = asyncHandler(async (req: Request, res: Response) => {
    const payments = await PrismaClient.supplierPayment.findMany();
    res.status(200).json(new ApiResponse("Supplier payments retrieved successfully", payments));
});

const getSupplierPaymentsById = asyncHandler(async (req: Request, res: Response) => {
    const supplierId = req.params.id
    if (!supplierId) throw new ApiError(400, "Supplier id is required");

    const supplier = await PrismaClient.supplier.findUnique({
        where: { id: supplierId },
    });
    if (!supplier) {
        throw new ApiError(404, "Supplier not found");
    }

    const payment = await PrismaClient.supplierPayment.findMany({
        where: {
            supplierId: supplierId
        }
    });
    if (!payment) {
        throw new ApiError(404, "Supplier payment not found");
    }
    res.status(200).json(new ApiResponse("Supplier payment retrieved successfully", payment));
})



export {
    createSupplier,
    getSuppliers,
    getSupplierById,
    updateSupplier,
    addSupplierPayment,
    getSupplierPayments,
    getSupplierPaymentsById
}