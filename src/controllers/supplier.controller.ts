import asyncHandler from "../helpers/asynchandeler.js";
import ApiError from "../helpers/ApiError.js";
import ApiResponse from "../helpers/ApiResponse.js";
import type { Request, Response } from "express";
import PrismaClient from "../prismaClient/index.js"
import { z } from "zod"
import { Decimal } from "decimal.js";


// ============= SUPPLIER SCHEMAS (UPDATED) =============

const supplierSchema = z.object({
    name: z.string().min(1, "Name is required"),
    contactName: z.string().nullable(),
    email: z.string().email("Invalid email address").nullable(),
    phone: z.string().min(10, "Phone number must be at least 10 digits").nullable(),
    gstNumber: z.string().nullable(),
    address: z.string().nullable(),
    openingBalance: z.number().default(0), // CHANGE #1: Added openingBalance field
});

const updateSupplierSchema = supplierSchema.partial(); // CHANGE #2: Added for PATCH requests


// ============= SUPPLIER CRUD OPERATIONS =============

const createSupplier = asyncHandler(async (req: Request, res: Response) => {
    const parsedData = supplierSchema.safeParse(req.body);
    if (!parsedData.success) {
        throw new ApiError(400, "Validation Error", parsedData.error.issues);
    }

    // CHANGE #3: Initialize balance equal to openingBalance
    const supplier = await PrismaClient.supplier.create({
        data: {
            name: parsedData.data.name,
            contactName: parsedData.data.contactName,
            email: parsedData.data.email,
            phone: parsedData.data.phone,
            gstNumber: parsedData.data.gstNumber,
            address: parsedData.data.address,
            balance: new Decimal(parsedData.data.openingBalance || 0), // Set initial balance = opening balance
            openingBalance: new Decimal(parsedData.data.openingBalance || 0), // Store opening balance
        },
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
        include: {
            // CHANGE #4: Include related purchase and payment data for balance verification
            purchases: {
                select: {
                    id: true,
                    totalAmount: true,
                    purchaseDate: true,
                }
            },
            payments: {
                select: {
                    id: true,
                    amount: true,
                    paymentDate: true,
                }
            }
        }
    });
    if (!supplier) {
        throw new ApiError(404, "Supplier not found");
    }
    res.status(200).json(new ApiResponse("Supplier retrieved successfully", supplier));
});

const updateSupplier = asyncHandler(async (req: Request, res: Response) => {
    const supplierId = req.params.id
    if (!supplierId) throw new ApiError(400, "Supplier id is required");

    const parsedData = updateSupplierSchema.safeParse(req.body); // CHANGE #5: Use partial schema for updates

    if (!parsedData.success) {
        throw new ApiError(400, "Validation Error", parsedData.error.issues);
    }

    // CHANGE #6: Handle openingBalance updates - recalculate balance if opening balance changes
    const currentSupplier = await PrismaClient.supplier.findUnique({
        where: { id: supplierId },
    });

    if (!currentSupplier) {
        throw new ApiError(404, "Supplier not found");
    }

    const updateData: any = { ...parsedData.data };

    // If openingBalance is being updated, we need to recalculate the current balance


    const supplier = await PrismaClient.supplier.update({
        where: { id: supplierId },
        data: {
            name: updateData.name,
            email: updateData.email,
            phone: updateData.phone,
            contactName: updateData.contactName,
            address: updateData.address,
            gstNumber: updateData.gstNumber
        }
    });
    res.status(200).json(new ApiResponse("Supplier updated successfully", supplier));
});


// ============= SUPPLIER PAYMENTS =============

const supplierPaymentSchema = z.object({
    supplierId: z.string().uuid("Supplier ID must be a valid UUID"),
    amount: z.number().positive("Amount must be greater than 0"),
    paymentMode: z.enum(["Cash", "Bank Transfer", "UPI", "Cheque"]).default("Cash"),
    paymentDate: z.string().datetime("Invalid date format"),
    checkNo: z.string().optional().nullable(),
    transactionId: z.string().optional().nullable(),
    remarks: z.string().optional().nullable(),
    reference: z.string().optional().nullable(),
}).refine(
    (data) => {
        // If payment mode is Cheque, checkNo should be provided
        if (data.paymentMode === "Cheque" && !data.checkNo) {
            return false;
        }
        return true;
    },
    {
        message: "Check number is required for Cheque payments",
        path: ["checkNo"],
    }
);

const addSupplierPayment = asyncHandler(async (req: Request, res: Response) => {
    const parsedData = supplierPaymentSchema.safeParse(req.body);
    const { id: supplierId } = req.params;
    if (!supplierId) {
        throw new ApiError(400, "Supplier Id is required")
    }
    if (!parsedData.success) {
        throw new ApiError(400, "Validation Error", parsedData.error.issues);
    }
    const { amount, paymentDate, paymentMode, checkNo, transactionId, remarks, reference } = parsedData.data;

    // Verify supplier exists
    const supplier = await PrismaClient.supplier.findUnique({
        where: { id: supplierId },
    });

    if (!supplier) {
        throw new ApiError(404, "Supplier not found");
    }

    // CHANGE #7: Create payment and update supplier balance in a transaction
    const payment = await PrismaClient.$transaction(async (tx) => {
        const payment = await tx.supplierPayment.create({
            data: {
                supplierId,
                amount: new Decimal(amount),
                paymentDate: new Date(paymentDate),
                paymentMode,
                checkNo: checkNo || null,
                transactionId: transactionId || null,
                remarks: remarks || null,
                reference: reference || null,
            },
            include: {
                supplier: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                        balance: true, // CHANGE #8: Include balance in response
                    },
                },
            },
        });

        // CHANGE #9: Reduce supplier balance by payment amount
        await tx.supplier.update({
            where: { id: supplierId },
            data: {
                balance: {
                    decrement: new Decimal(amount),
                }
            }
        });

        return payment;
    });

    res.status(201).json(new ApiResponse("Supplier payment added successfully", payment));
});

const getSupplierPayments = asyncHandler(async (req: Request, res: Response) => {
    const {
        page = 1,
        limit = 10,
        supplierId,
        paymentMode,
        startDate,
        endDate,
        search = "" // Added search parameter
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 10));
    const skip = (pageNum - 1) * limitNum;

    // Build dynamic where clause
    const whereClause: any = {};

    // 1. Direct ID filtering
    if (supplierId) {
        whereClause.supplierId = supplierId as string;
    }

    // 2. Exact match filtering
    if (paymentMode) {
        whereClause.paymentMode = paymentMode as string;
    }

    // 3. Search logic (matches getReceipts style)
    if (search) {
        whereClause.OR = [
            { supplier: { name: { contains: search as string, mode: "insensitive" } } },
            { reference: { contains: search as string, mode: "insensitive" } },
            { remarks: { contains: search as string, mode: "insensitive" } },

            { paymentMode: { contains: search as string, mode: "insensitive" } },
            // Add other fields if needed, e.g., notes
        ];
    }

    // 4. Date Logic
    const now = new Date();
    let finalStartDate: Date | undefined;
    let finalEndDate: Date | undefined;

    if (startDate || endDate) {
        if (startDate) finalStartDate = new Date(startDate as string);
        if (endDate) finalEndDate = new Date(new Date(endDate as string).setHours(23, 59, 59, 999));
    } else {
        // DEFAULT: Current Month
        finalStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
        finalEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    whereClause.paymentDate = {};
    if (finalStartDate) whereClause.paymentDate.gte = finalStartDate;
    if (finalEndDate) whereClause.paymentDate.lte = finalEndDate;

    // 5. Data Fetching
    const [payments, total] = await Promise.all([
        PrismaClient.supplierPayment.findMany({
            where: whereClause,
            include: {
                supplier: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                    },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
            skip,
            take: limitNum,
        }),
        PrismaClient.supplierPayment.count({ where: whereClause }),
    ]);

    res.status(200).json(
        new ApiResponse("Supplier payments retrieved successfully", {
            payments,
            meta: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
        })
    );
});

const getSupplierPaymentsById = asyncHandler(async (req: Request, res: Response) => {
    const { id: supplierId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    if (!supplierId) {
        throw new ApiError(400, "Supplier ID is required");
    }

    // Verify supplier exists
    const supplier = await PrismaClient.supplier.findUnique({
        where: { id: supplierId },
    });

    if (!supplier) {
        throw new ApiError(404, "Supplier not found");
    }

    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 10));
    const skip = (pageNum - 1) * limitNum;

    const [payments, total] = await Promise.all([
        PrismaClient.supplierPayment.findMany({
            where: { supplierId },
            include: {
                supplier: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                    },
                },
            },
            orderBy: {
                paymentDate: "desc",
            },
            skip,
            take: limitNum,
        }),
        PrismaClient.supplierPayment.count({ where: { supplierId } }),
    ]);

    res.status(200).json(
        new ApiResponse("Supplier payments retrieved successfully", {
            supplier: {
                id: supplier.id,
                name: supplier.name,
                balance: supplier.balance, // CHANGE #10: Include supplier balance in response
            },
            payments,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum),
            },
        })
    );
})

/**
 * Update a supplier payment
 */
const updateSupplierPayment = asyncHandler(async (req: Request, res: Response) => {
    const { id, paymentId } = req.params;
    if (!paymentId || !id) {
        throw new ApiError(400, "Payment ID and Supplier ID's are required");
    }
    const updateSchema = supplierPaymentSchema.partial();
    const parsedData = updateSchema.safeParse(req.body);

    if (!parsedData.success) {
        throw new ApiError(400, "Validation Error", parsedData.error.issues);
    }

    const payment = await PrismaClient.supplierPayment.findUnique({
        where: { id: paymentId, supplierId: id },
    });

    if (!payment) {
        throw new ApiError(404, "Supplier payment not found");
    }

    // CHANGE #11: Handle balance updates when payment amount changes
    const updatedPayment = await PrismaClient.$transaction(async (tx) => {
        let balanceAdjustment = new Decimal(0);

        // If amount is being updated, calculate the difference
        if (parsedData.data.amount !== undefined && parsedData.data.amount !== payment.amount.toNumber()) {
            const oldAmount = new Decimal(payment.amount);
            const newAmount = new Decimal(parsedData.data.amount);
            balanceAdjustment = oldAmount.minus(newAmount); // positive = less payment (increase balance owed)
        }

        // Build update data
        const updateData: any = {};

        if (parsedData.data.supplierId !== undefined) {
            updateData.supplierId = parsedData.data.supplierId;
        }
        if (parsedData.data.amount !== undefined) {
            updateData.amount = new Decimal(parsedData.data.amount);
        }
        if (parsedData.data.paymentDate !== undefined) {
            updateData.paymentDate = new Date(parsedData.data.paymentDate);
        }
        if (parsedData.data.paymentMode !== undefined) {
            updateData.paymentMode = parsedData.data.paymentMode;
        }
        if (parsedData.data.checkNo !== undefined) {
            updateData.checkNo = parsedData.data.checkNo;
        }
        if (parsedData.data.transactionId !== undefined) {
            updateData.transactionId = parsedData.data.transactionId;
        }
        if (parsedData.data.remarks !== undefined) {
            updateData.remarks = parsedData.data.remarks;
        }
        if (parsedData.data.reference !== undefined) {
            updateData.reference = parsedData.data.reference;
        }

        const updatedPayment = await tx.supplierPayment.update({
            where: { id },
            data: updateData,
            include: {
                supplier: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        phone: true,
                    },
                },
            },
        });

        // CHANGE #12: Adjust supplier balance if payment amount changed
        if (!balanceAdjustment.isZero()) {
            await tx.supplier.update({
                where: { id: payment.supplierId },
                data: {
                    balance: {
                        increment: balanceAdjustment,
                    }
                }
            });
        }

        return updatedPayment;
    });

    res.status(200).json(
        new ApiResponse("Supplier payment updated successfully", updatedPayment)
    );
});


const getSupplierLedger = asyncHandler(async (req: Request, res: Response) => {
    const { id: supplierId } = req.params;
    let { startDate, endDate, page: pageStr, limit: limitStr } = req.query;

    if (!supplierId) {
        throw new ApiError(400, "Supplier ID is required");
    }

    // 1. Pagination Logic (New: Matches Customer Ledger)
    const page = Math.max(1, parseInt(pageStr as string ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(limitStr as string ?? "20", 10) || 20));
    const skip = (page - 1) * limit;

    // 2. Verify supplier exists
    const supplier = await PrismaClient.supplier.findUnique({
        where: { id: supplierId },
    });

    if (!supplier) {
        throw new ApiError(404, "Supplier not found");
    }

    // 3. Default Date Logic
    const now = new Date();
    const currentYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const defaultStartDate = new Date(currentYear, 3, 1); // April 1st

    const start = startDate ? new Date(startDate as string) : defaultStartDate;
    const end = endDate ? new Date(endDate as string) : new Date();
    // Normalize end date to include all transactions on that day
    end.setHours(23, 59, 59, 999);

    // 4. FETCH PREVIOUS TRANSACTIONS (Balance B/F calculation)
    const [prevPurchases, prevPayments] = await Promise.all([
        PrismaClient.purchase.aggregate({
            _sum: { totalAmount: true },
            where: {
                supplierId,
                purchaseDate: { lt: start }
            }
        }),
        PrismaClient.supplierPayment.aggregate({
            _sum: { amount: true },
            where: {
                supplierId,
                paymentDate: { lt: start }
            }
        })
    ]);

    const balanceBF = Number(supplier.openingBalance) +
        (Number(prevPurchases._sum.totalAmount) || 0) -
        (Number(prevPayments._sum.amount) || 0);

    // 5. FETCH CURRENT PERIOD TRANSACTIONS
    const [purchases, payments] = await Promise.all([
        PrismaClient.purchase.findMany({
            where: {
                supplierId,
                purchaseDate: { gte: start, lte: end },
            },
            orderBy: { purchaseDate: "asc" },
        }),
        PrismaClient.supplierPayment.findMany({
            where: {
                supplierId,
                paymentDate: { gte: start, lte: end },
            },
            orderBy: { paymentDate: "asc" },
        }),
    ]);

    // 6. Merge and Calculate Running Balance
    const allTransactions = [
        ...purchases.map((p) => ({
            date: p.purchaseDate,
            type: "PURCHASE",
            desc: `Purchase Invoice #${p.invoiceNo || p.id}`,
            debit: Number(p.totalAmount) || 0, // In supplier context, Purchase = we owe more (Debit)
            credit: 0,
            id: `purchase-${p.id}`,
        })),
        ...payments.map((p) => ({
            date: p.paymentDate,
            type: "PAYMENT",
            desc: `Payment ${p.paymentMode}${p.checkNo ? ` - Chq #${p.checkNo}` : p.reference ? ` - ${p.reference}` : ""}`,
            debit: 0,
            credit: Number(p.amount) || 0, // Payment = we owe less (Credit)
            id: `payment-${p.id}`,
        })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = balanceBF;
    const fullLedger = allTransactions.map((txn) => {
        runningBalance = runningBalance + txn.debit - txn.credit;
        return {
            ...txn,
            runningBalance: parseFloat(runningBalance.toFixed(2)),
        };
    });

    // 7. Paginate the Resulting Array (New: Matches Customer Ledger)
    const total = fullLedger.length;
    const paginatedLedger = fullLedger.slice(skip, skip + limit);

    // 8. Calculate Period Summary (Optional but helpful)
    const totalPurchases = purchases.reduce((sum, p) => sum + (Number(p.totalAmount) || 0), 0);
    const totalPayments = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    // 9. Return Response in consistent format
    res.status(200).json(
        new ApiResponse("Supplier ledger retrieved successfully", {
            supplierName: supplier.name,
            gstNumber: supplier.gstNumber,
            balanceBF: parseFloat(balanceBF.toFixed(2)),
            currentBalance: Number(supplier.balance),
            ledger: paginatedLedger,
            summary: {
                totalPurchases: parseFloat(totalPurchases.toFixed(2)),
                totalPayments: parseFloat(totalPayments.toFixed(2)),
                periodChange: parseFloat((totalPurchases - totalPayments).toFixed(2)),
            },
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                dateRange: {
                    start: start.toISOString().split('T')[0],
                    end: end.toISOString().split('T')[0],
                },
            }
        })
    );
});

/**
 * UPDATED: Supplier Balance Summary
 * Returns quick balance info including period-wise breakdown
 */
const getSupplierBalanceSummary = asyncHandler(async (req: Request, res: Response) => {
    const { id: supplierId } = req.params;

    if (!supplierId) {
        throw new ApiError(400, "Supplier ID is required");
    }

    const supplier = await PrismaClient.supplier.findUnique({
        where: { id: supplierId },
        select: {
            id: true,
            name: true,
            gstNumber: true,
            balance: true,
            openingBalance: true,
            _count: {
                select: {
                    purchases: true,
                    payments: true,
                }
            },
        },
    });

    if (!supplier) {
        throw new ApiError(404, "Supplier not found");
    }

    // CHANGE #10: Get aggregate purchase and payment amounts
    const [purchasesAgg, paymentsAgg] = await Promise.all([
        PrismaClient.purchase.aggregate({
            where: { supplierId },
            _sum: { totalAmount: true },
        }),
        PrismaClient.supplierPayment.aggregate({
            where: { supplierId },
            _sum: { amount: true },
        }),
    ]);

    // CHANGE #11: Get current financial year data
    const now = new Date();
    const currentYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const fyStart = new Date(currentYear, 3, 1);
    const fyEnd = new Date();

    const [fyPurchases, fyPayments] = await Promise.all([
        PrismaClient.purchase.aggregate({
            where: {
                supplierId,
                purchaseDate: { gte: fyStart, lte: fyEnd }
            },
            _sum: { totalAmount: true },
        }),
        PrismaClient.supplierPayment.aggregate({
            where: {
                supplierId,
                paymentDate: { gte: fyStart, lte: fyEnd }
            },
            _sum: { amount: true },
        }),
    ]);

    res.status(200).json(
        new ApiResponse("Supplier balance summary retrieved successfully", {
            supplier: {
                id: supplier.id,
                name: supplier.name,
                gstNumber: supplier.gstNumber,
            },
            balance: {
                current: parseFloat(supplier.balance.toString()),
                opening: parseFloat(supplier.openingBalance.toString()),
            },
            lifetime: {
                totalPurchases: purchasesAgg._sum.totalAmount ? parseFloat(purchasesAgg._sum.totalAmount.toString()) : 0,
                totalPayments: paymentsAgg._sum.amount ? parseFloat(paymentsAgg._sum.amount.toString()) : 0,
                transactionCounts: {
                    purchases: supplier._count.purchases,
                    payments: supplier._count.payments,
                },
            },
            currentFinancialYear: {
                start: fyStart.toISOString().split('T')[0],
                end: fyEnd.toISOString().split('T')[0],
                purchases: fyPurchases._sum.totalAmount ? parseFloat(fyPurchases._sum.totalAmount.toString()) : 0,
                payments: fyPayments._sum.amount ? parseFloat(fyPayments._sum.amount.toString()) : 0,
            },
        })
    );
});


export {
    getSupplierLedger,
    getSupplierBalanceSummary,
    createSupplier,
    getSuppliers,
    getSupplierById,
    updateSupplier,
    addSupplierPayment,
    getSupplierPayments,
    getSupplierPaymentsById,
    updateSupplierPayment
}