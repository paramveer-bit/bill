import express from "express";
import {
    createReceipt,
    getReceipts,
    getReceiptById,
    deleteReceipt,
    getCustomerReceipts,
    getDailyReceiptSummary,
} from "../controllers/receipt.controller.js";

const router = express.Router();

/**
 * Receipt Routes
 * Base Path: /api/v1/receipts
 */

// POST /api/v1/receipts - Create a new receipt
router.post("/", createReceipt);

// GET /api/v1/receipts/summary/daily - Get daily summary (MUST be before /:id to avoid param conflict)
router.get("/summary/daily", getDailyReceiptSummary);

// GET /api/v1/receipts/customer/:customerId - Get customer receipts (MUST be before /:id)
router.get("/customer/:customerId", getCustomerReceipts);

// GET /api/v1/receipts - Get all receipts with filters
router.get("/", getReceipts);

// GET /api/v1/receipts/:id - Get single receipt
router.get("/:id", getReceiptById);

// DELETE /api/v1/receipts/:id - Delete receipt
router.delete("/:id", deleteReceipt);

export default router;