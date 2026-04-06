import asyncHandler from "../helpers/asynchandeler.js";
import ApiError from "../helpers/ApiError.js";
import ApiResponse from "../helpers/ApiResponse.js";
import type { Request, Response } from "express";
import PrismaClient from "../prismaClient/index.js";
import { z } from "zod";

const batchSchema = z.object({
    productId: z.string().min(1),
    qtyReceived: z.number().int().positive(),
    unitCost: z.number().positive(),
    sellingPrice: z.number().positive(),   // always required
    mrp: z.number().positive(),   // always required
});

const purchaseMasterSchema = z.object({
    supplierId: z.string().min(1),
    invoiceNo: z.string(),
    purchaseDate: z.string(),
    totalAmount: z.number().positive(),
    batches: z.array(batchSchema).min(1, "At least one batch is required"),
});

export const createPurchase = asyncHandler(async (req: Request, res: Response) => {
    const parsedData = purchaseMasterSchema.safeParse(req.body);
    if (!parsedData.success) {
        throw new ApiError(400, "Validation Error", parsedData.error.issues);
    }

    const { supplierId, invoiceNo, purchaseDate, totalAmount, batches } = parsedData.data;
    const effectiveDate = purchaseDate ? new Date(purchaseDate) : new Date();

    // ── Pre-flight checks ────────────────────────────────────────────────────────

    const supplier = await PrismaClient.supplier.findUnique({
        where: { id: supplierId },
    });
    if (!supplier) throw new ApiError(404, "Supplier not found");

    const productIds = [...new Set(batches.map((b) => b.productId))];
    const existingProducts = await PrismaClient.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, name: true, currentSellPrice: true },
    });

    if (existingProducts.length !== productIds.length) {
        const missing = productIds.filter(
            (id) => !existingProducts.find((p) => p.id === id)
        );
        throw new ApiError(404, `Products not found: ${missing.join(", ")}`);
    }

    // ── Transaction ──────────────────────────────────────────────────────────────

    const result = await PrismaClient.$transaction(async (tx) => {
        // 1. Create purchase + batches
        const purchase = await tx.purchase.create({
            data: {
                supplierId,
                invoiceNo,
                purchaseDate: effectiveDate,
                totalAmount,
                batches: {
                    create: batches.map((batch) => ({
                        productId: batch.productId,
                        qtyReceived: batch.qtyReceived,
                        qtyRemaining: batch.qtyReceived,
                        receivedAt: effectiveDate,
                        unitCost: batch.unitCost,
                        sellingPrice: batch.sellingPrice,
                        mrp: batch.mrp,
                    })),
                },
            },
            include: {
                batches: {
                    include: {
                        product: { select: { id: true, name: true, baseUnit: true } },
                    },
                },
            },
        });

        // 2. Update currentSellPrice ONLY if it changed — avoid noise in price history
        await Promise.all(
            batches.map(async (batch) => {
                const currentProduct = existingProducts.find((p) => p.id === batch.productId)!;
                const currentPrice = Number(currentProduct.currentSellPrice ?? 0);
                const priceChanged = currentPrice !== batch.sellingPrice;

                if (priceChanged) {
                    await tx.product.update({
                        where: { id: batch.productId },
                        data: { currentSellPrice: batch.sellingPrice },
                    });

                    await tx.productPriceHistory.create({
                        data: {
                            productId: batch.productId,
                            price: batch.sellingPrice,
                            effectiveFrom: effectiveDate,
                            note: `₹${currentPrice} → ₹${batch.sellingPrice} via purchase${invoiceNo ? ` ${invoiceNo}` : ""}`,
                        },
                    });
                }
            })
        );

        return purchase;
    });

    res.status(201).json(new ApiResponse("Purchase created successfully", result));
});


// ── Date range helper ─────────────────────────────────────────────────────────

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

export const getPurchases = asyncHandler(async (req: Request, res: Response) => {
    const {
        supplierId,
        from,
        to,
        invoiceNo,
        search,
        dateFilter,
        page: pageStr,
        limit: limitStr,
    } = req.query as Record<string, string | undefined>;

    const page = Math.max(1, parseInt(pageStr ?? "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(limitStr ?? "20", 10) || 20));
    const skip = (page - 1) * limit;

    // ── Build where clause ───────────────────────────────────────────────────

    // Date range: prefer explicit from/to, fall back to dateFilter preset
    let dateRange: { gte?: Date; lte?: Date } | undefined;
    if (from || to) {
        dateRange = {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(new Date(to).setHours(23, 59, 59, 999)) } : {}),
        };
    } else if (dateFilter && dateFilter !== "all") {
        dateRange = getDateRange(dateFilter);
    }

    const where = {
        ...(supplierId ? { supplierId } : {}),
        ...(dateRange ? { purchaseDate: dateRange } : {}),
        // invoiceNo param kept for direct exact/partial search (used by other callers)
        ...(invoiceNo && !search
            ? { invoiceNo: { contains: invoiceNo, mode: "insensitive" as const } }
            : {}),
        // search: matches invoiceNo OR supplier name
        ...(search
            ? {
                OR: [
                    { invoiceNo: { contains: search, mode: "insensitive" as const } },
                    { supplier: { name: { contains: search, mode: "insensitive" as const } } },
                ],
            }
            : {}),
    };

    // ── Count + paginated data in parallel ───────────────────────────────────

    const [total, purchases] = await Promise.all([
        PrismaClient.purchase.count({ where }),
        PrismaClient.purchase.findMany({
            where,
            select: {
                id: true,
                invoiceNo: true,
                purchaseDate: true,
                totalAmount: true,
                createdAt: true,
                supplier: { select: { id: true, name: true } },
                batches: { select: { id: true } },
            },
            orderBy: { purchaseDate: "desc" },
            skip,
            take: limit,
        }),
    ]);

    // ── Aggregate totals for summary strip (across entire filtered set) ───────
    const agg = await PrismaClient.purchase.aggregate({
        where,
        _sum: { totalAmount: true },
    });

    // ── Batch line-item count (across current page) ───────────────────────────
    const result = purchases.map((p) => ({
        ...p,
        batchCount: p.batches.length,
        batches: undefined,
    }));

    const pageItemCount = result.reduce((s, p) => s + p.batchCount, 0);

    res.status(200).json(
        new ApiResponse("Purchases fetched successfully", {
            purchases: result,
            meta: {
                page,
                limit,
                total,                // total matching records
                totalPages: Math.ceil(total / limit),
                totalSpend: Number(agg._sum.totalAmount ?? 0),  // across full filtered set
                totalLineItems: pageItemCount,                   // across current page
            },
        }),
    );
});

export const getPurchaseById = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const purchaseId = id;
    if (!purchaseId) throw new ApiError(400, "Invalid purchase ID");

    const purchase = await PrismaClient.purchase.findUnique({
        where: { id: purchaseId },
        include: {
            supplier: true,
            batches: {
                include: {
                    product: { select: { id: true, name: true, sku: true, baseUnit: true } },
                },
            },
        },
    });

    if (!purchase) throw new ApiError(404, "Purchase not found");

    res.status(200).json(new ApiResponse("Purchase fetched successfully", purchase));
});

export const deletePurchase = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const purchaseId = id;
    if (!purchaseId) throw new ApiError(400, "Invalid purchase ID");

    const purchase = await PrismaClient.purchase.findUnique({
        where: { id: purchaseId },
        include: {
            batches: {
                include: { saleAllocations: { select: { id: true } } },
            },
        },
    });

    if (!purchase) throw new ApiError(404, "Purchase not found");

    const hasSales = purchase.batches.some((b) => b.saleAllocations.length > 0);
    if (hasSales) {
        throw new ApiError(
            409,
            "Cannot delete: one or more items in this purchase have already been sold",
        );
    }

    await PrismaClient.purchase.delete({ where: { id: purchaseId } });

    res.status(200).json(new ApiResponse("Purchase deleted successfully", null));
});