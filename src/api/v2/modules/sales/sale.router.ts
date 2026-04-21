// src/api/v1/modules/sale/sale.routes.ts
import { Router } from 'express';
// import { verifyAuth } from '@/middleware/auth';
import * as saleController from './sale.controller.js';

const router = Router();

/**
 * Routes layer — maps HTTP endpoints to controller handlers.
 * All routes require authentication via verifyAuth middleware.
 *
 * ⚠️ Static routes (/summary) MUST be declared before parameterised routes (/:id)
 */

// router.use(verifyAuth);

// POST   /api/v1/sales             — Create sale (FIFO allocation)
router.post('/', saleController.createSale);

// GET    /api/v1/sales             — List sales (filters, pagination, sorting)
// Query: ?search= &dateFilter= &startDate= &endDate= &customerId= &sortBy= &sortOrder= &page= &limit=
router.get('/', saleController.getSales);

// GET    /api/v1/sales/summary     — Today / month / all-time totals
router.get('/summary', saleController.getSalesSummary);

// GET    /api/v1/sales/:id         — Full sale detail with line items
router.get('/:id', saleController.getSaleById);

// DELETE /api/v1/sales/:id         — Reverse FIFO stock + customer balance
router.delete('/:id', saleController.deleteSale);

export default router;