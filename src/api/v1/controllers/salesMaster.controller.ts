import asyncHandler from "../../../helpers/asynchandeler.js";
import ApiError from "../../../helpers/ApiError.js";
import ApiResponse from "../../../helpers/ApiResponse.js";
import type { Request, Response } from "express";
import PrismaClient from "../../../prismaClient/index.js";
import { createSaleSchema } from "../schemas/sales.schema.js";

// ─── Zod Schemas ──────────────────────────────────────────────────────────────





// ─── Invoice Number Generator ─────────────────────────────────────────────────
// Format: DDMMYY-00001  e.g. "040426-00001"
// Count is scoped to today's prefix so numbering resets each day.

async function generateInvoiceNo(): Promise<string> {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yy = String(now.getFullYear()).slice(2);
    const prefix = `${dd}${mm}${yy}-`;

    const count = await PrismaClient.sale.count({
        where: { invoiceNo: { startsWith: prefix } },
    });

    return `${prefix}${String(count + 1).padStart(5, "0")}`;
}

// ─── POST /api/sales ──────────────────────────────────────────────────────────
// Creates a sale with FIFO batch allocation.
// Steps:
//   1. Validate input
//   2. Verify customer + products exist
//   3. FIFO allocation planning (read-only, outside transaction)
//   4. $transaction: create Sale + Lines + Allocations, decrement batches,
//      increment customer.balance

export const createSale = asyncHandler(async (req: Request, res: Response) => {
    const parsed = createSaleSchema.safeParse(req.body);
    if (!parsed.success) {
        throw new ApiError(400, "Validation failed", parsed.error.issues);
    }

    const { customerId, saleDate, lines } = parsed.data;

    // ── 1. Verify customer ──────────────────────────────────────────────────────
    const customer = await PrismaClient.customer.findUnique({
        where: { id: customerId },
    });
    if (!customer) throw new ApiError(404, "Customer not found");

    // ── 2. Verify all products exist in one query ───────────────────────────────
    const productIds = [...new Set(lines.map((l) => l.productId))];
    const products = await PrismaClient.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true },
    });

    if (products.length !== productIds.length) {
        const missing = productIds.filter((id) => !products.find((p) => p.id === id));
        throw new ApiError(404, `Products not found: ${missing.join(", ")}`);
    }

    // ── 3. FIFO allocation planning ─────────────────────────────────────────────

    type AllocationPlan = {
        purchaseBatchId: string;
        qtyAllocated: number;
        unitCost: number;
    };

    type LinePlan = {
        productId: string;
        productName: string;
        qty: number;
        unitQty: number;
        unitName: string;
        unitSellPrice: number;
        lineTotal: number;
        costAllocated: number;
        allocations: AllocationPlan[];
    };

    const linePlans: LinePlan[] = [];

    for (const line of lines) {
        const batches = await PrismaClient.purchaseBatch.findMany({
            where: { productId: line.productId, qtyRemaining: { gt: 0 } },
            orderBy: { receivedAt: "asc" }, // FIFO
        });

        const totalAvailable = batches.reduce((s, b) => s + b.qtyRemaining, 0);
        if (totalAvailable < line.qty) {
            const product = products.find((p) => p.id === line.productId);
            throw new ApiError(
                400,
                `Insufficient stock for "${product?.name}". Required: ${line.qty}, Available: ${totalAvailable}`
            );
        }

        const allocations: AllocationPlan[] = [];
        let remaining = line.qty;

        for (const batch of batches) {
            if (remaining <= 0) break;
            const take = Math.min(remaining, batch.qtyRemaining);
            allocations.push({
                purchaseBatchId: batch.id,
                qtyAllocated: take,
                unitCost: Number(batch.unitCost),
            });
            remaining -= take;
        }

        const lineTotal = line.qty * line.unitSellPrice;
        const costAllocated = allocations.reduce((s, a) => s + a.qtyAllocated * a.unitCost, 0);
        const productName = products.find((p) => p.id === line.productId)!.name;

        linePlans.push({
            productId: line.productId,
            productName,
            qty: line.qty,
            unitQty: line.unitQty,
            unitName: line.unitName,
            unitSellPrice: line.unitSellPrice,
            lineTotal,
            costAllocated,
            allocations,
        });
    }

    const totalAmount = linePlans.reduce((s, l) => s + l.lineTotal, 0);

    // ── 4. Transaction ──────────────────────────────────────────────────────────
    const sale = await PrismaClient.$transaction(async (tx) => {
        const invoiceNo = await generateInvoiceNo();

        const newSale = await tx.sale.create({
            data: {
                invoiceNo,
                customerId,
                saleDate: new Date(saleDate),
                totalAmount,
                // ── Customer snapshot fields ──────────────────────────────────
                customerName: customer.name,
                customerGST: customer.gstNumber ?? null,
                customerPhone: customer.phone ?? null,
                customerAddress: customer.address ?? null,
                // ─────────────────────────────────────────────────────────────
                lines: {
                    create: linePlans.map((lp) => ({
                        productId: lp.productId,
                        productName: lp.productName,   // snapshot
                        qty: lp.qty,
                        unitQty: lp.unitQty,
                        unitname: lp.unitName,
                        unitSellPrice: lp.unitSellPrice,
                        taxRate: null,
                        lineTotal: lp.lineTotal,
                        costAllocated: lp.costAllocated,
                        allocations: {
                            create: lp.allocations.map((a) => ({
                                purchaseBatchId: a.purchaseBatchId,
                                qtyAllocated: a.qtyAllocated,
                                unitCost: a.unitCost,
                            })),
                        },
                    })),
                },
            },
            include: {
                lines: { include: { allocations: true } },
            },
        });

        // Decrement batch stock
        for (const lp of linePlans) {
            for (const alloc of lp.allocations) {
                await tx.purchaseBatch.update({
                    where: { id: alloc.purchaseBatchId },
                    data: { qtyRemaining: { decrement: alloc.qtyAllocated } },
                });
            }
        }

        // Increment customer balance (balance = amount owed by customer)
        await tx.customer.update({
            where: { id: customerId },
            data: { balance: { increment: totalAmount } },
        });

        return newSale;
    });

    return res.status(201).json(new ApiResponse("Sale created successfully", { sale }));
});

// ─── GET /api/sales ───────────────────────────────────────────────────────────
// Query params:
//   page        : number  (default 1)
//   limit       : number  (default 30, max 100)
//   search      : string  (matches invoiceNo, customerName snapshot, or live customer name)
//   dateFilter  : "today" | "yesterday" | "week" | "month" | "quarter" | "year" | "custom" | "all"
//   from        : ISO date string (used when dateFilter=custom)
//   to          : ISO date string (used when dateFilter=custom)
//   customerId  : string  (filter by a specific customer)
//   sortBy      : "saleDate" | "totalAmount" | "invoiceNo" | "createdAt"  (default "saleDate")
//   sortOrder   : "asc" | "desc"  (default "desc")
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

export const getSales = asyncHandler(async (req: Request, res: Response) => {
    // 1. Pagination & Sorting Params
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 30));
    const skip = (page - 1) * limit;

    const search = (req.query.search as string)?.trim() || "";
    const dateFilter = (req.query.dateFilter as string) || "all";
    const customerId = (req.query.customerId as string) || "";
    const sortBy = (req.query.sortBy as string) || "saleDate";
    const sortOrder = ((req.query.sortOrder as string) || "desc") as "asc" | "desc";

    // --- NEW ISO KEYS TO MATCH HOOK ---
    const { startDate, endDate } = req.query;

    // 2. Standardized Date Logic
    let dateRange: { gte?: Date; lte?: Date } | undefined;

    if (startDate || endDate) {
        dateRange = {
            ...(startDate ? { gte: new Date(startDate as string) } : {}),
            // CRITICAL: Ensure the end date covers the FULL day up to the last millisecond
            ...(endDate ? { lte: new Date(new Date(endDate as string).setHours(23, 59, 59, 999)) } : {}),
        };
    } else if (dateFilter && dateFilter !== "all") {
        // Fallback to central getDateRange utility if no ISO strings were provided
        dateRange = getDateRange(dateFilter);
    }

    // 3. Build Where Clause
    const where: any = {};

    if (search) {
        where.OR = [
            { invoiceNo: { contains: search, mode: "insensitive" } },
            { customerName: { contains: search, mode: "insensitive" } },
            { customer: { name: { contains: search, mode: "insensitive" } } },
        ];
    }

    if (dateRange) {
        where.saleDate = dateRange;
    }

    if (customerId) {
        where.customerId = customerId;
    }

    // 4. Sorting logic
    const allowedSortFields: Record<string, object> = {
        saleDate: { saleDate: sortOrder },
        totalAmount: { totalAmount: sortOrder },
        invoiceNo: { invoiceNo: sortOrder },
        createdAt: { createdAt: sortOrder },
    };
    const orderBy = allowedSortFields[sortBy] ?? { saleDate: "desc" };

    // 5. Parallel count + fetch
    const [total, sales, agg, totalLineItemsCount] = await Promise.all([
        PrismaClient.sale.count({ where }),
        PrismaClient.sale.findMany({
            where,
            orderBy,
            skip,
            take: limit,
            select: {
                id: true,
                invoiceNo: true,
                saleDate: true,
                totalAmount: true,
                createdAt: true,
                customerName: true,
                customerPhone: true,
                customer: {
                    select: { id: true, name: true, phone: true, town: true },
                },
                _count: { select: { lines: true } },
            },

        }),
        PrismaClient.sale.aggregate({
            where,
            _sum: { totalAmount: true },
        }),
        PrismaClient.saleLine.groupBy({
            by: ['productId'],
            where: { sale: where }
        })
    ]);

    const totalPages = Math.ceil(total / limit);

    return res.json(
        new ApiResponse("Sales fetched successfully", {
            sales,
            meta: {
                page,
                limit,
                total,
                totalPages,
                totalSpend: Number(agg._sum.totalAmount ?? 0),
                totalLineItems: totalLineItemsCount.length
            },
        })
    );
});

// ─── GET /api/sales/summary ───────────────────────────────────────────────────

export const getSalesSummary = asyncHandler(async (_req: Request, res: Response) => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [todayStats, monthStats, allTimeStats] = await Promise.all([
        PrismaClient.sale.aggregate({
            where: { saleDate: { gte: startOfToday } },
            _sum: { totalAmount: true },
            _count: true,
        }),
        PrismaClient.sale.aggregate({
            where: { saleDate: { gte: startOfMonth } },
            _sum: { totalAmount: true },
            _count: true,
        }),
        PrismaClient.sale.aggregate({
            _sum: { totalAmount: true },
            _count: true,
        }),
    ]);

    return res.json(
        new ApiResponse("Summary fetched", {
            today: { amount: Number(todayStats._sum.totalAmount ?? 0), count: todayStats._count },
            month: { amount: Number(monthStats._sum.totalAmount ?? 0), count: monthStats._count },
            allTime: { amount: Number(allTimeStats._sum.totalAmount ?? 0), count: allTimeStats._count },
        })
    );
});

// ─── GET /api/sales/:id ───────────────────────────────────────────────────────
// Full sale detail with line items. Uses snapshot fields for display accuracy.

export const getSaleById = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) throw new ApiError(400, "Invalid sale ID");

    const sale = await PrismaClient.sale.findUnique({
        where: { id },
        include: {
            customer: {
                select: { id: true, name: true, phone: true, town: true, balance: true },
            },
            lines: {
                include: {
                    product: {
                        select: { id: true, name: true, sku: true, baseUnit: true },
                    },
                    allocations: {
                        select: {
                            qtyAllocated: true,
                            unitCost: true,
                            purchaseBatch: { select: { id: true, receivedAt: true } },
                        },
                    },
                },
                orderBy: { id: "asc" },
            },
        },
    });

    if (!sale) throw new ApiError(404, "Sale not found");

    return res.json(new ApiResponse("Sale fetched successfully", { sale }));
});

// ─── DELETE /api/sales/:id ────────────────────────────────────────────────────
// Reverses all FIFO stock allocations and customer balance in one transaction.

export const deleteSale = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    if (!id) throw new ApiError(400, "Invalid sale ID");

    const sale = await PrismaClient.sale.findUnique({
        where: { id },
        include: { lines: { include: { allocations: true } } },
    });
    if (!sale) throw new ApiError(404, "Sale not found");

    await PrismaClient.$transaction(async (tx) => {
        // Restore stock
        for (const line of sale.lines) {
            for (const alloc of line.allocations) {
                await tx.purchaseBatch.update({
                    where: { id: alloc.purchaseBatchId },
                    data: { qtyRemaining: { increment: alloc.qtyAllocated } },
                });
            }
        }

        // Reduce customer balance
        if (sale.customerId) {
            await tx.customer.update({
                where: { id: sale.customerId },
                data: { balance: { decrement: sale.totalAmount } },
            });
        }

        // 4. DELETE children first to avoid Foreign Key errors
        // Delete all Allocations related to these SaleLines
        await tx.saleBatchAllocation.deleteMany({
            where: { saleLineId: { in: sale.lines.map(l => l.id) } }
        });

        // Delete all SaleLines related to this Sale
        await tx.saleLine.deleteMany({
            where: { saleId: id }
        });


        await tx.sale.delete({ where: { id } });
    });

    return res.json(new ApiResponse("Sale deleted successfully", {}));
});