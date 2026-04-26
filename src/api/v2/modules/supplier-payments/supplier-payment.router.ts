// src/api/v1/modules/supplier-payment/supplier-payment.routes.ts
import { Router } from 'express';
import { authMiddleware } from '@/middlewares/auth.middelware.js'; // ← Auth middleware
import * as supplierPaymentController from './supplier-payment.controller.js';

const router = Router();

/**
 * Routes layer - ONLY defines endpoint paths and methods
 * Maps HTTP requests to controller functions
 * 
 * ⚠️ NOTE: All routes protected with verifyAuth middleware
 */

// ============ AUTH MIDDLEWARE ============
// All supplier payment routes require authentication
router.use(authMiddleware);

// ============ SUPPLIER PAYMENT ROUTES ============

// POST /api/v1/supplier-payments - Create new supplier payment
router.post('/', supplierPaymentController.createSupplierPayment);//checked and implemented

// GET /api/v1/supplier-payments - Get all supplier payments with filters
// Query params: ?supplierId=, ?paymentMode=, ?search=, ?startDate=, ?endDate=, ?page=1, ?limit=30, ?sortBy=, ?sortOrder=
router.get('/', supplierPaymentController.getSupplierPayments);//checked and implemented

// GET /api/v1/supplier-payments/summary/daily - Get daily payment summary
// Query params: ?days=30
// new
// router.get('/summary/daily', supplierPaymentController.getDailyPaymentSummary);

// GET /api/v1/supplier-payments/stats - Get payment statistics
// Query params: ?days=30
//new
// router.get('/stats', supplierPaymentController.getPaymentStats);

// GET /api/v1/supplier-payments/:id - Get supplier payment by ID
// Payment id 
router.get('/:id', supplierPaymentController.getSupplierPaymentById);

// PUT /api/v1/supplier-payments/:id - Update supplier payment
router.put('/:id', supplierPaymentController.updateSupplierPayment);

// DELETE /api/v1/supplier-payments/:id - Delete supplier payment
router.delete('/:id', supplierPaymentController.deleteSupplierPayment);//checked and implemented

// GET /api/v1/supplier-payments/supplier/:supplierId - Get payments for a specific supplier
router.get('/supplier/:supplierId', supplierPaymentController.getSupplierPaymentsBySupplier);

export default router;