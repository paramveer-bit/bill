import asyncHandler from "../helpers/asynchandeler.js";
import ApiError from "../helpers/ApiError.js";
import ApiResponse from "../helpers/ApiResponse.js";
import type { Request, Response } from "express";
import PrismaClient from "../prismaClient/index.js";
import { z } from "zod";

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const saleLineSchema = z.object({
    productId: z.string().min(1),
    qty: z.number().int().positive(),           // always in BASE units
    unitSellPrice: z.number().positive(),       // always in BASE units
});

const createSaleSchema = z.object({
    customerId: z.string().min(1),
    saleDate: z.string().min(1),
    lines: z.array(saleLineSchema).min(1),
});

// ─── Invoice Number Generator ─────────────────────────────────────────────────
// Format: INV/2025-26/00001  (Indian financial year Apr–Mar)
// Uses a DB-level counter via $queryRaw to avoid race conditions.

async function generateInvoiceNo(): Promise<string> {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, "0");
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const yy = String(now.getFullYear()).slice(2);
    const prefix = `${dd}${mm}${yy}-`; // e.g. "040426-"

    const count = await PrismaClient.sale.count({
        where: { invoiceNo: { startsWith: prefix } },
    });

    const seq = String(count + 1).padStart(5, "0");
    return `${prefix}${seq}`; // e.g. "040426-00001"
}


// ─── Controllers ──────────────────────────────────────────────────────────────

// POST /api/sales
// Creates a sale with FIFO batch allocation.
// Steps:
//   1. Validate input
//   2. Verify customer exists
//   3. Verify all products exist
//   4. For each line: fetch available batches FIFO, check stock, build allocations
//   5. $transaction:
//      a. Generate invoice number
//      b. Create Sale + SaleLines + SaleBatchAllocations
//      c. Decrement PurchaseBatch.qtyRemaining for each allocation
//      d. Increment Customer.balance by totalAmount (balance = amount customer owes)

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
        const foundIds = products.map((p) => p.id);
        const missing = productIds.filter((id) => !foundIds.includes(id));
        throw new ApiError(404, `Products not found: ${missing.join(", ")}`);
    }

    // ── 3. FIFO allocation planning (outside transaction — read-only) ───────────
    // For each line, fetch batches ordered oldest first (FIFO).
    // Build the allocation plan: which batches to deduct from and how much.

    type AllocationPlan = {
        purchaseBatchId: number;
        qtyAllocated: number;
        unitCost: number; // per base unit
    };

    type LinePlan = {
        productId: string;
        qty: number;
        unitSellPrice: number;
        lineTotal: number;
        costAllocated: number;
        allocations: AllocationPlan[];
    };

    const linePlans: LinePlan[] = [];

    for (const line of lines) {
        const batches = await PrismaClient.purchaseBatch.findMany({
            where: {
                productId: line.productId,
                qtyRemaining: { gt: 0 },
            },
            orderBy: { receivedAt: "asc" }, // FIFO: oldest batch first
        });

        const totalAvailable = batches.reduce((s, b) => s + b.qtyRemaining, 0);
        if (totalAvailable < line.qty) {
            const product = products.find((p) => p.id === line.productId);
            throw new ApiError(
                400,
                `Insufficient stock for "${product?.name}". Required: ${line.qty}, Available: ${totalAvailable}`
            );
        }

        // Walk through batches FIFO and allocate qty
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
        const costAllocated = allocations.reduce(
            (s, a) => s + a.qtyAllocated * a.unitCost,
            0
        );

        linePlans.push({
            productId: line.productId,
            qty: line.qty,
            unitSellPrice: line.unitSellPrice,
            lineTotal,
            costAllocated,
            allocations,
        });
    }

    const totalAmount = linePlans.reduce((s, l) => s + l.lineTotal, 0);

    // ── 4. Transaction ──────────────────────────────────────────────────────────
    const sale = await PrismaClient.$transaction(async (tx) => {
        // Generate invoice number inside transaction so the count is consistent
        const invoiceNo = await generateInvoiceNo();

        // Create the Sale record
        const newSale = await tx.sale.create({
            data: {
                invoiceNo,
                customerId,
                saleDate: new Date(saleDate),
                totalAmount,
                lines: {
                    create: linePlans.map((lp) => ({
                        productId: lp.productId,
                        qty: lp.qty,
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
                lines: {
                    include: { allocations: true },
                },
            },
        });

        // Decrement qtyRemaining on each allocated batch
        for (const lp of linePlans) {
            for (const alloc of lp.allocations) {
                await tx.purchaseBatch.update({
                    where: { id: alloc.purchaseBatchId },
                    data: {
                        qtyRemaining: { decrement: alloc.qtyAllocated },
                    },
                });
            }
        }

        // Increment customer balance (balance = outstanding amount customer owes)
        await tx.customer.update({
            where: { id: customerId },
            data: { balance: { increment: totalAmount } },
        });

        return newSale;
    });

    return res
        .status(201)
        .json(new ApiResponse("Sale created successfully", { sale }));
});

export const getSales = asyncHandler(async (req: Request, res: Response) => {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 30));
    const skip = (page - 1) * limit;

    const search = (req.query.search as string)?.trim() || "";
    const dateFilter = (req.query.dateFilter as string) || "all";
    const customerId = (req.query.customerId as string) || "";
    const sortBy = (req.query.sortBy as string) || "saleDate";
    const sortOrder = ((req.query.sortOrder as string) || "desc") as "asc" | "desc";

    // ── Date range calculation ──────────────────────────────────────────────────
    let dateFrom: Date | undefined;
    let dateTo: Date | undefined;

    const now = new Date();
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

    switch (dateFilter) {
        case "today":
            dateFrom = startOfDay(now);
            dateTo = endOfDay(now);
            break;
        case "yesterday": {
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            dateFrom = startOfDay(yesterday);
            dateTo = endOfDay(yesterday);
            break;
        }
        case "week":
            dateFrom = new Date(now);
            dateFrom.setDate(now.getDate() - 7);
            dateTo = endOfDay(now);
            break;
        case "month":
            dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
            dateTo = endOfDay(now);
            break;
        case "quarter": {
            const qStart = Math.floor(now.getMonth() / 3) * 3;
            dateFrom = new Date(now.getFullYear(), qStart, 1);
            dateTo = endOfDay(now);
            break;
        }
        case "year":
            dateFrom = new Date(now.getFullYear(), 0, 1);
            dateTo = endOfDay(now);
            break;
        case "custom":
            if (req.query.from) dateFrom = new Date(req.query.from as string);
            if (req.query.to) dateTo = endOfDay(new Date(req.query.to as string));
            break;
        default:
            break; // "all" — no date filter
    }

    // ── Build Prisma where clause ───────────────────────────────────────────────
    const where: any = {};

    if (search) {
        where.OR = [
            { invoiceNo: { contains: search, mode: "insensitive" } },
            { customer: { name: { contains: search, mode: "insensitive" } } },
        ];
    }

    if (dateFrom || dateTo) {
        where.saleDate = {
            ...(dateFrom && { gte: dateFrom }),
            ...(dateTo && { lte: dateTo }),
        };
    }

    if (customerId) {
        where.customerId = customerId;
    }

    // ── Validate sortBy to prevent injection ───────────────────────────────────
    const allowedSortFields: Record<string, object> = {
        saleDate: { saleDate: sortOrder },
        totalAmount: { totalAmount: sortOrder },
        invoiceNo: { invoiceNo: sortOrder },
        createdAt: { createdAt: sortOrder },
    };
    const orderBy = allowedSortFields[sortBy] ?? { saleDate: "desc" };

    // ── Run count + data queries in parallel ───────────────────────────────────
    const [total, sales] = await Promise.all([
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
                customer: {
                    select: { id: true, name: true, phone: true, town: true },
                },
                // Only count lines — don't fetch full line data in list view
                _count: { select: { lines: true } },
            },
        }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return res.json(
        new ApiResponse("Sales fetched successfully", {
            sales,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
            },
        })
    );
});


// ─── GET /api/sales/:id ───────────────────────────────────────────────────────
// Fetch a single sale with full line items and batch allocations.

export const getSaleById = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const saleId = id;
    if (!saleId) throw new ApiError(400, "Invalid sale ID");

    const sale = await PrismaClient.sale.findUnique({
        where: { id: saleId },
        include: {
            customer: {
                select: { id: true, name: true, phone: true, town: true, balance: true },
            },
            lines: {
                include: {
                    product: {
                        select: {
                            id: true,
                            name: true,
                            sku: true,
                            baseUnit: true,
                            unitConversions: true,
                        },
                    },
                    allocations: {
                        select: {
                            qtyAllocated: true,
                            unitCost: true,
                            purchaseBatch: {
                                select: { id: true, receivedAt: true },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!sale) throw new ApiError(404, "Sale not found");

    return res.json(new ApiResponse("Sale fetched successfully", { sale }));
});


// ─── DELETE /api/sales/:id ────────────────────────────────────────────────────
// Deletes a sale and reverses all stock/balance effects in a transaction.

export const deleteSale = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const saleId = (id);
    if (!saleId) throw new ApiError(400, "Invalid sale ID");

    const sale = await PrismaClient.sale.findUnique({
        where: { id: saleId },
        include: {
            lines: {
                include: { allocations: true },
            },
        },
    });
    if (!sale) throw new ApiError(404, "Sale not found");

    await PrismaClient.$transaction(async (tx) => {
        // Restore qtyRemaining on each batch
        for (const line of sale.lines) {
            for (const alloc of line.allocations) {
                await tx.purchaseBatch.update({
                    where: { id: alloc.purchaseBatchId },
                    data: { qtyRemaining: { increment: alloc.qtyAllocated } },
                });
            }
        }

        // Reduce customer balance
        await tx.customer.update({
            where: { id: sale.customerId! },
            data: { balance: { decrement: sale.totalAmount } },
        });

        // Delete the sale (cascades to lines + allocations via Prisma relations)
        await tx.sale.delete({ where: { id: saleId } });
    });

    return res.json(new ApiResponse("Sale deleted successfully", {}));
});


// ─── GET /api/sales/summary ───────────────────────────────────────────────────
// Quick summary stats for the header cards (today, this month, total).

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
            today: {
                amount: Number(todayStats._sum.totalAmount ?? 0),
                count: todayStats._count,
            },
            month: {
                amount: Number(monthStats._sum.totalAmount ?? 0),
                count: monthStats._count,
            },
            allTime: {
                amount: Number(allTimeStats._sum.totalAmount ?? 0),
                count: allTimeStats._count,
            },
        })
    );
});
