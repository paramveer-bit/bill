// src/api/v1/modules/customer/customer.routes.ts
import { Router } from 'express';
import * as customerController from './customer.controller.js';
// import { verifyAuth } from '@/middleware/auth'; // ← Auth middleware

const router = Router();

/**
 * Routes layer - ONLY defines endpoint paths and methods
 * Maps HTTP requests to controller functions
 */

// router.use(verifyAuth);

// ============ CUSTOMER ROUTES ============

// GET /api/v1/customers - Get all customers
router.get('/', customerController.listCustomers);

// POST /api/v1/customers - Create new customer
router.post('/', customerController.createCustomer);

// GET /api/v1/customers/:id - Get customer by ID
router.get('/:id', customerController.getCustomerById);

// // GET /api/v1/customers/:id/details - Get customer with sales/receipts
// router.get('/:id/details', customerController.getCustomerDetails);

// // GET /api/v1/customers/:id/stats - Get customer statistics
// router.get('/:id/stats', customerController.getCustomerStats);

// // PUT /api/v1/customers/:id - Update customer
router.put('/:id', customerController.updateCustomer);

// // DELETE /api/v1/customers/:id - Delete customer
// router.delete('/:id', customerController.deleteCustomer);

export default router;