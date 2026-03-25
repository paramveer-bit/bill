import asyncHandler from "../helpers/asynchandeler.js";
import ApiError from "../helpers/ApiError.js";
import ApiResponse from "../helpers/ApiResponse.js";
import type { Request, Response } from "express";
import PrismaClient from "../prismaClient/index.js"
import { z } from "zod"

const batchSchema = z.object({
  productId:    z.string().min(1),
  qtyReceived:  z.number().int().positive(),
  qtyRemaining: z.number().int().positive(),
  unitCost:     z.number().positive(),
  sellingPrice: z.number().positive(),
  mrp:          z.number().positive(),
});

const purchaseMasterSchema = z.object({
  supplierId:   z.string().min(1),
  invoiceNo:    z.string().optional(),
  purchaseDate: z.string().optional(),
  totalAmount:  z.number().positive(),
  batches:      z.array(batchSchema).min(1, "At least one batch is required"),
});

export const createPurchase = asyncHandler(async (req: Request, res: Response) => {
  const parsedData = purchaseMasterSchema.safeParse(req.body);
  if (!parsedData.success) {
    throw new ApiError(400, "Validation Error", parsedData.error.issues);
  }

  const { supplierId, invoiceNo, purchaseDate, totalAmount, batches } = parsedData.data;

  // Verify supplier exists
  const supplier = await PrismaClient.supplier.findUnique({
    where: { id: supplierId },
  });
  if (!supplier) {
    throw new ApiError(404, "Supplier not found");
  }

  // Verify all products exist in one query
  const productIds = [...new Set(batches.map((b) => b.productId))];
  const products = await PrismaClient.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true },
  });
  if (products.length !== productIds.length) {
    const foundIds = products.map((p) => p.id);
    const missing = productIds.filter((id) => !foundIds.includes(id));
    throw new ApiError(404, `Products not found: ${missing.join(", ")}`);
  }

  const result = await PrismaClient.$transaction(async (tx) => {
    // 1. Create purchase + all batches in one query
    const purchase = await tx.purchase.create({
      data: {
        supplierId,
        invoiceNo,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
        totalAmount,
        batches: {
          create: batches.map((batch) => ({
            productId:    batch.productId,
            qtyReceived:  batch.qtyReceived,
            qtyRemaining: batch.qtyReceived,   // remaining = received at creation
            receivedAt :purchaseDate ? new Date(purchaseDate) : new Date(),
            unitCost:     batch.unitCost,
            sellingPrice: batch.sellingPrice,
            mrp:          batch.mrp,
          })),
        },
      },
      include: {
        batches: {
          include: { product: { select: { id: true, name: true, baseUnit: true } } },
        },
      },
    });

    // 2. Update currentSellPrice + write price history for each batch that has a sellingPrice
    const priceUpdates = batches.filter((b) => b.sellingPrice !== undefined);

    await Promise.all(
      priceUpdates.map(async (batch) => {
        await tx.product.update({
          where: { id: batch.productId },
          data: { currentSellPrice: batch.sellingPrice },
        });

        await tx.productPriceHistory.create({
          data: {
            productId:    batch.productId,
            price:        batch.sellingPrice!,
            effectiveFrom: purchaseDate ? new Date(purchaseDate) : new Date(),
            note: `Updated via purchase${invoiceNo ? ` invoice ${invoiceNo}` : ""}`,
          },
        });
      })
    );

    return purchase;
  });

  res.status(201).json(new ApiResponse("Purchase created successfully", result));
});