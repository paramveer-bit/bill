// src/api/v1/modules/receipt/receipt.routes.ts
import { Router } from 'express';
import { authMiddleware } from '@/middlewares/auth.middelware.js'; // ← Auth middleware
import * as receiptController from './receipt.controller.js';

const router = Router();

/**
 * Routes layer - ONLY defines endpoint paths and methods
 * Maps HTTP requests to controller functions
 * 
 * ⚠️ NOTE: All routes protected with verifyAuth middleware
 */

// ============ AUTH MIDDLEWARE ============
// All receipt routes require authentication
router.use(authMiddleware);

// ============ RECEIPT ROUTES ============

// POST /api/v1/receipts - Create new receipt
router.post('/', receiptController.createReceipt); //checked and implemented

// GET /api/v1/receipts - Get all receipts with filters
// Query params: ?search=, ?customerId=, ?dateFilter=, ?startDate=, ?endDate=, ?page=1, ?limit=30, ?sortBy=, ?sortOrder=
router.get('/', receiptController.getReceipts);//checked and implemented

// GET /api/v1/receipts/stats - Get receipt statistics
// router.get('/stats', receiptController.getReceiptStats);

// GET /api/v1/receipts/summary/daily - Get daily receipt summary
// Query params: ?days=30
// router.get('/summary/daily', receiptController.getDailyReceiptSummary);

// GET /api/v1/receipts/:id - Get receipt by ID
router.get('/:id', receiptController.getReceiptById);

// DELETE /api/v1/receipts/:id - Delete receipt
router.delete('/:id', receiptController.deleteReceipt);//checked and implemented

// GET /api/v1/receipts/customer/:customerId - Get all receipts for customer
router.get('/customer/:customerId', receiptController.getCustomerReceipts);

export default router;