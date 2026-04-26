// src/api/v1/modules/product/product.routes.ts
import { Router } from 'express';
import { authMiddleware } from '@/middlewares/auth.middelware.js'; // ← Auth middleware
import * as productController from './product.controller.js';

const router = Router();

/**
 * Routes layer - ONLY defines endpoint paths and methods
 * Maps HTTP requests to controller functions
 * 
 * ⚠️ NOTE: All routes protected with verifyAuth middleware
 */

// ============ AUTH MIDDLEWARE ============
// All product routes require authentication
router.use(authMiddleware);

// ============ PRODUCT ROUTES ============

// GET /api/v1/products - Get all products with filters
router.get('/', productController.getProducts);

// GET /api/v1/products/hierarchy - Get products grouped by hierarchy
router.get('/hierarchy', productController.getProductsByHierarchy);

// GET /api/v1/products/low-stock - Get products with low stock
// ----new
router.get('/low-stock', productController.getLowStockProducts);
// GET /api/v1/products/stats - Get product statistics
// ---new
router.get('/stats', productController.getProductStats);

// POST /api/v1/products - Create new product
router.post('/', productController.createProduct);//checked and implemented

// GET /api/v1/products/:id - Get product by ID
router.get('/:id', productController.getProductById);

// GET /api/v1/products/:id/stock-info - Get product stock information
router.get('/:id/stock-info', productController.getProductStockInfo);//checked and implemented

// PUT /api/v1/products/:id - Update product
router.put('/:id', productController.updateProduct);//checked and implemented

// DELETE /api/v1/products/:id - Delete product
// router.delete('/:id', productController.deleteProduct);

// GET /api/v1/products/category/:categoryId - Get products by category
router.get('/category/:categoryId', productController.getProductsByCategory);//checked and implemented

export default router;