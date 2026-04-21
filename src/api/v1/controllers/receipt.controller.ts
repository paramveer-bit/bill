import asyncHandler from "../../../helpers/asynchandeler.js";
import ApiError from "../../../helpers/ApiError.js";
import ApiResponse from "../../../helpers/ApiResponse.js";
import type { Request, Response } from "express";
import PrismaClient from "../../../prismaClient/index.js";
import { receiptSchema } from "../schemas/receipt.schema.js";



/**
 * POST /api/v1/receipts
 * Create a new payment receipt
 *
 * Updates customer balance (reduces it by payment amount)
 */
export const createReceipt = asyncHandler(async (req: Request, res: Response) => {
    const parsedData = receiptSchema.safeParse(req.body);
    if (!parsedData.success) {
        throw new ApiError(400, "Validation Error", parsedData.error.issues);
    }
    // Check if customer exists
    const customer = await PrismaClient.customer.findUnique({
        where: { id: parsedData.data.customerId },
    });
    if (!customer) {
        throw new ApiError(404, "Customer not found");
    }

    // Create receipt and update customer balance in transaction
    const receipt = await PrismaClient.$transaction(async (tx) => {
        // Create receipt
        const newReceipt = await tx.receipt.create({
            data: {
                customerId: parsedData.data.customerId,
                amount: parsedData.data.amount,
                paymentMode: parsedData.data.paymentMode,
                receiptDate: parsedData.data.receiptDate
                    ? new Date(parsedData.data.receiptDate)
                    : new Date(),
                remarks: parsedData.data.remarks || null,
            },
        });

        // Reduce customer balance (they owe less now)
        await tx.customer.update({
            where: { id: parsedData.data.customerId },
            data: {
                balance: {
                    decrement: parsedData.data.amount,
                },
            },
        });

        return newReceipt;
    });

    res.status(201).json(
        new ApiResponse("Receipt created successfully", {
            id: receipt.id,
            customerId: receipt.customerId,
            amount: receipt.amount,
            paymentMode: receipt.paymentMode,
            receiptDate: receipt.receiptDate.toISOString(),
            remarks: receipt.remarks,
            createdAt: receipt.createdAt.toISOString(),
        })
    );
}
);

//  GET /api/v1/receipts

function getDateRange(filter: string): { gte?: Date; lte?: Date } | undefined {
    const now = new Date();

    switch (filter) {
        case "1day": {
            const gte = new Date(now);
            gte.setDate(gte.getDate() - 1);
            return { gte };
        }
        case "week": {
            const gte = new Date(now);
            gte.setDate(gte.getDate() - 7);
            return { gte };
        }
        case "month": {
            const gte = new Date(now.getFullYear(), now.getMonth(), 1);
            const lte = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
            return { gte, lte };
        }
        case "prevmonth": {
            const y = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
            const m = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
            const gte = new Date(y, m, 1);
            const lte = new Date(y, m + 1, 0, 23, 59, 59, 999);
            return { gte, lte };
        }
        case "quarter": {
            const q = Math.floor(now.getMonth() / 3);
            const gte = new Date(now.getFullYear(), q * 3, 1);
            const lte = new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59, 999);
            return { gte, lte };
        }
        default:
            return undefined;
    }
}
export const getReceipts = asyncHandler(async (req: Request, res: Response) => {
    const {
        search = "",
        dateFilter = "all",
        customerId,
        startDate,    // CHANGED: Standardized with other controllers
        endDate,      // CHANGED: Standardized with other controllers
        page = "1",
        limit = "30",
        sortBy = "receiptDate",
        sortOrder = "desc",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit as string) || 30));
    const skip = (pageNum - 1) * pageSize;

    // ─── Build Where Clause ──────────────────────────────────────────────
    const where: any = {};

    // Customer filter
    if (customerId) {
        where.customerId = customerId as string;
    }

    // Search logic
    if (search) {
        where.OR = [
            { customer: { name: { contains: search as string, mode: "insensitive" } } },
            { remarks: { contains: search as string, mode: "insensitive" } },
            { paymentMode: { contains: search as string, mode: "insensitive" } },
        ];
    }

    // ─── Date Filtering (Standardized ISO Logic) ─────────────────────────
    let dateRange: { gte?: Date; lte?: Date } | undefined;

    if (startDate || endDate) {
        dateRange = {
            ...(startDate ? { gte: new Date(startDate as string) } : {}),
            // Ensure endDate is inclusive of the full day
            ...(endDate ? { lte: new Date(new Date(endDate as string).setHours(23, 59, 59, 999)) } : {}),
        };
    } else if (dateFilter && dateFilter !== "all") {
        // Fallback to your central getDateRange utility if no ISO strings provided
        dateRange = getDateRange(dateFilter as string);
    }

    if (dateRange) {
        where.receiptDate = dateRange;
    }

    // ─── Sorting ─────────────────────────────────────────────────────────
    const sortField = (sortBy as string) || "receiptDate";
    const sortDir = ((sortOrder as string) || "desc") === "asc" ? "asc" : "desc";
    const orderBy = { [sortField]: sortDir };

    // ─── Data Fetching (Optimized Parallel Execution) ────────────────────
    const [receipts, total, totalSum] = await Promise.all([
        PrismaClient.receipt.findMany({
            where,
            orderBy,
            skip,
            take: pageSize,
            include: {
                customer: {
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                        email: true,
                        town: true,
                        balance: true,
                    },
                },
            },
        }),
        PrismaClient.receipt.count({ where }),
        PrismaClient.receipt.aggregate({
            where,
            _sum: { amount: true },
        }),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    res.status(200).json(
        new ApiResponse("Receipts fetched successfully", {
            receipts: receipts.map((receipt) => ({
                id: receipt.id,
                customerId: receipt.customerId,
                customerName: receipt.customer?.name,
                amount: Number(receipt.amount),
                paymentMode: receipt.paymentMode,
                receiptDate: receipt.receiptDate.toISOString(),
                remarks: receipt.remarks,
                createdAt: receipt.createdAt.toISOString(),
                customer: receipt.customer,
            })),
            meta: {
                page: pageNum,
                limit: pageSize,
                total,
                totalPages,
                totalSpend: Number(totalSum._sum.amount || 0),
            },
        })
    );
}
);

/**
 * GET /api/v1/receipts/:id
 * Get a single receipt by ID
 */
export const getReceiptById = asyncHandler(
    async (req: Request, res: Response) => {
        const { id } = req.params;

        if (!id) {
            throw new ApiError(400, "Receipt ID is required");
        }

        const receipt = await PrismaClient.receipt.findUnique({
            where: { id: id },
            include: {
                customer: true,
            },
        });

        if (!receipt) {
            throw new ApiError(404, "Receipt not found");
        }

        res.status(200).json(
            new ApiResponse("Receipt retrieved successfully", {
                id: receipt.id,
                customerId: receipt.customerId,
                amount: receipt.amount,
                paymentMode: receipt.paymentMode,
                receiptDate: receipt.receiptDate.toISOString(),
                remarks: receipt.remarks,
                createdAt: receipt.createdAt.toISOString(),
                customer: receipt.customer,
            })
        );
    }
);

/**
 * DELETE /api/v1/receipts/:id
 * Delete a receipt and reverse customer balance update
 */
export const deleteReceipt = asyncHandler(
    async (req: Request, res: Response) => {
        const { id } = req.params;

        if (!id) {
            throw new ApiError(400, "Receipt ID is required");
        }


        // Find receipt first
        const receipt = await PrismaClient.receipt.findUnique({
            where: { id },
        });

        if (!receipt) {
            throw new ApiError(404, "Receipt not found");
        }

        // Delete receipt and reverse customer balance in transaction
        await PrismaClient.$transaction(async (tx) => {
            // Delete receipt
            await tx.receipt.delete({
                where: { id },
            });

            // Restore customer balance (they owe more again)
            await tx.customer.update({
                where: { id: receipt.customerId },
                data: {
                    balance: {
                        increment: receipt.amount,
                    },
                },
            });
        });

        res.status(200).json(new ApiResponse("Receipt deleted successfully", null));
    }
);

/**
 * GET /api/v1/receipts/customer/:customerId
 * Get all receipts for a specific customer
 */
export const getCustomerReceipts = asyncHandler(
    async (req: Request, res: Response) => {
        const { customerId } = req.params;

        if (!customerId) {
            throw new ApiError(400, "Customer ID is required");
        }

        // Check if customer exists
        const customer = await PrismaClient.customer.findUnique({
            where: { id: customerId },
        });

        if (!customer) {
            throw new ApiError(404, "Customer not found");
        }

        const receipts = await PrismaClient.receipt.findMany({
            where: { customerId },
            orderBy: { receiptDate: "desc" },
        });

        // Calculate total received
        const totalReceived = receipts.reduce((sum, r) => sum + r.amount.toNumber(), 0);

        res.status(200).json(
            new ApiResponse("Customer receipts retrieved successfully", {
                customer: {
                    id: customer.id,
                    name: customer.name,
                    email: customer.email,
                    phone: customer.phone,
                    balance: customer.balance,
                },
                receipts: receipts.map((receipt) => ({
                    id: receipt.id,
                    amount: receipt.amount,
                    paymentMode: receipt.paymentMode,
                    receiptDate: receipt.receiptDate.toISOString(),
                    remarks: receipt.remarks,
                    createdAt: receipt.createdAt.toISOString(),
                })),
                totalReceived,
            })
        );
    }
);

/**
 * GET /api/v1/receipts/summary/daily
 * Get daily receipt summary for analytics
 */
export const getDailyReceiptSummary = asyncHandler(
    async (req: Request, res: Response) => {
        const { days = "30" } = req.query;
        const numDays = parseInt(days as string) || 30;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - numDays);

        const receipts = await PrismaClient.receipt.findMany({
            where: {
                receiptDate: { gte: startDate },
            },
            select: {
                receiptDate: true,
                amount: true,
                paymentMode: true,
            },
        });

        // Group by date
        const dailySummary: {
            [key: string]: {
                date: string;
                totalAmount: number;
                count: number;
                byPaymentMode: { [key: string]: number };
            };
        } = {};

        receipts.forEach((receipt) => {
            const dateKey = receipt.receiptDate.toISOString().split("T")[0] as string;
            if (!dailySummary[dateKey]) {
                dailySummary[dateKey] = {
                    date: dateKey,
                    totalAmount: 0,
                    count: 0,
                    byPaymentMode: {},
                };
            }

            const amount = receipt.amount.toNumber();
            dailySummary[dateKey].totalAmount += amount;
            dailySummary[dateKey].count += 1;

            const mode = receipt.paymentMode;
            if (!dailySummary[dateKey].byPaymentMode[mode]) {
                dailySummary[dateKey].byPaymentMode[mode] = 0;
            }
            dailySummary[dateKey].byPaymentMode[mode] += amount;
        });

        res.status(200).json(
            new ApiResponse("Daily receipt summary retrieved successfully",
                Object.values(dailySummary).sort((a, b) =>
                    a.date.localeCompare(b.date)
                )
            )
        );
    }
);