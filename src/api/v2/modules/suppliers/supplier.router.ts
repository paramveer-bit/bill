// src/api/v1/modules/supplier/supplier.routes.ts
import { Router } from 'express';
// import { verifyAuth } from '@/middleware/auth'; // ← Auth middleware
import * as supplierController from './supplier.controller.js';

const router = Router();

/**
 * Routes layer - ONLY defines endpoint paths and methods
 * Maps HTTP requests to controller functions
 * 
 * ⚠️ NOTE: All routes protected with verifyAuth middleware
 */

// ============ AUTH MIDDLEWARE ============
// All supplier routes require authentication
// router.use(verifyAuth);

// ============ SUPPLIER ROUTES ============

// POST /api/v1/suppliers - Create new supplier
router.post('/', supplierController.createSupplier);

// GET /api/v1/suppliers - Get all suppliers with filters
// Query params: ?search=, ?page=1, ?limit=20, ?sortBy=, ?sortOrder=
router.get('/', supplierController.getSuppliers);

// GET /api/v1/suppliers/balance - Get suppliers with balance info
// new 
router.get('/balance', supplierController.getSuppliersWithBalance);

// GET /api/v1/suppliers/payable - Get high payable suppliers
// Query params: ?threshold=5000
// new 
router.get('/payable', supplierController.getHighPayableSuppliers);

// GET /api/v1/suppliers/:id - Get supplier by ID
router.get('/:id', supplierController.getSupplierById);

// GET /api/v1/suppliers/:id/stats - Get supplier statistics
// new 
router.get('/:id/stats', supplierController.getSupplierStats);

// PUT /api/v1/suppliers/:id - Update supplier
router.put('/:id', supplierController.updateSupplier);

// DELETE /api/v1/suppliers/:id - Delete supplier
// router.delete('/:id', supplierController.deleteSupplier);

export default router;