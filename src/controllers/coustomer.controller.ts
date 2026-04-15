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
    balance: z.number().default(0),
    town: z.string().min(5, "Town name is necessary")
});


export const createCustomer = asyncHandler(async (req: Request, res: Response) => {
    const parsedData = customerSchema.safeParse(req.body);
    if (!parsedData.success) {
        throw new ApiError(400, "Validation Error", parsedData.error.issues);
    }
    const customer = await PrismaClient.customer.create({
        data: {
            name: parsedData.data.name,
            email: parsedData.data.email,
            phone: parsedData.data.phone,
            gstNumber: parsedData.data.gstNumber,
            address: parsedData.data.address,
            openingBalance: parsedData.data.balance,
            balance: parsedData.data.balance,
            town: parsedData.data.town
        }
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
    const customer = await PrismaClient.customer.update({
        where: { id: customerId },
        data: {
            name: parsedData.data.name,
            email: parsedData.data.email,
            phone: parsedData.data.phone,
            gstNumber: parsedData.data.gstNumber,
            address: parsedData.data.address,
            town: parsedData.data.town
        }
    });
    res.status(200).json(new ApiResponse("Customer updated successfully", customer));
});

export const getCustomerLedger = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    let { startDate, endDate, page: pageStr, limit: limitStr } = req.query;

    if (!id) throw new ApiError(404, "Customer id is required");

    // 1. Pagination Logic
    const page = Math.max(1, parseInt(pageStr as string ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(limitStr as string ?? "20", 10) || 20));
    const skip = (page - 1) * limit;

    // 2. Default Date Logic
    const now = new Date();
    const currentYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const defaultStartDate = new Date(currentYear, 3, 1);
    const start = startDate ? new Date(startDate as string) : defaultStartDate;
    const end = endDate ? new Date(endDate as string) : new Date();
    end.setHours(23, 59, 59, 999);

    const customer = await PrismaClient.customer.findUnique({ where: { id } });
    if (!customer) throw new ApiError(404, "Customer not found");

    // 3. FETCH PREVIOUS TRANSACTIONS
    const [prevSales, prevReceipts] = await Promise.all([
        PrismaClient.sale.aggregate({
            _sum: { totalAmount: true },
            where: { customerId: id, saleDate: { lt: start } }
        }),
        PrismaClient.receipt.aggregate({
            _sum: { amount: true },
            where: { customerId: id, receiptDate: { lt: start } }
        })
    ]);

    const balanceBF = Number(customer.openingBalance) +
        (Number(prevSales._sum.totalAmount) || 0) -
        (Number(prevReceipts._sum.amount) || 0);

    // 4. FETCH CURRENT TRANSACTIONS
    const [sales, receipts] = await Promise.all([
        PrismaClient.sale.findMany({
            where: { customerId: id, saleDate: { gte: start, lte: end } },
            orderBy: { saleDate: 'asc' }
        }),
        PrismaClient.receipt.findMany({
            where: { customerId: id, receiptDate: { gte: start, lte: end } },
            orderBy: { receiptDate: 'asc' }
        })
    ]);

    // 5. Merge and Calculate Running Balance
    const ledgerEntries = [
        ...sales.map(s => ({ date: s.saleDate, type: "SALE", desc: `Inv #${s.invoiceNo}`, debit: Number(s.totalAmount), credit: 0 })),
        ...receipts.map(r => ({ date: r.receiptDate, type: "RECEIPT", desc: r.paymentMode, debit: 0, credit: Number(r.amount) }))
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBal = balanceBF;
    const fullLedger = ledgerEntries.map(e => {
        runningBal = runningBal + e.debit - e.credit;
        return { ...e, runningBalance: runningBal };
    });

    // 6. Paginate the Resulting Array
    const total = fullLedger.length;
    const paginatedLedger = fullLedger.slice(skip, skip + limit);

    res.status(200).json(new ApiResponse("Success", {
        customerName: customer.name,
        balanceBF,
        currentBalance: Number(customer.balance),
        ledger: paginatedLedger,
        meta: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    }));
});
