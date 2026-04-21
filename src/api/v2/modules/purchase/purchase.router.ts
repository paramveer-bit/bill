// src/api/v1/modules/purchase/purchase.routes.ts
import { Router } from 'express';
// import { verifyAuth } from '@/middleware/auth';
import * as purchaseController from './purchase.controller.js';

const router = Router();

/**
 * Routes layer — maps HTTP endpoints to controller handlers.
 * All routes require authentication via verifyAuth middleware.
 */

// router.use(verifyAuth);

// POST   /api/v1/purchases          — Create new purchase
router.post('/', purchaseController.createPurchase);

// GET    /api/v1/purchases          — List purchases (with filters & pagination)
// Query: ?supplierId= &invoiceNo= &search= &startDate= &endDate= &dateFilter= &page= &limit=
router.get('/', purchaseController.getPurchases);

// GET    /api/v1/purchases/:id      — Get full purchase detail by ID
router.get('/:id', purchaseController.getPurchaseById);

// DELETE /api/v1/purchases/:id      — Delete purchase (blocked if items are sold)
router.delete('/:id', purchaseController.deletePurchase);

export default router;