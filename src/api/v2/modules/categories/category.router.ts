// src/api/v1/modules/category/category.routes.ts
import { Router } from 'express';
import * as categoryController from './category.controller.js';
import { authMiddleware } from '@/middlewares/auth.middelware.js'; // ← Auth middleware

const router = Router();
router.use(authMiddleware);

/**
 * Routes layer - ONLY defines endpoint paths and methods
 * Maps HTTP requests to controller functions
 */

// ============ CATEGORY ROUTES ============

// GET /api/v1/categories - Get all categories
// Query params: ?flat=true (returns flat list) or ?flat=false (returns hierarchical)
router.get('/', categoryController.getCategories);//checked and implemented

// GET /api/v1/categories/tree - Get category tree structure
// router.get('/tree', categoryController.getCategoryTree);

// GET /api/v1/categories/:id - Get category by ID
router.get('/:id', categoryController.getCategoryById);

// GET /api/v1/categories/:id/stats - Get category statistics
// router.get('/:id/stats', categoryController.getCategoryStats);

// POST /api/v1/categories - Create new category
router.post('/', categoryController.createCategory);//checked and implemented

// PUT /api/v1/categories/:id - Update category
router.put('/:id', categoryController.updateCategory);//checked and implemented

// DELETE /api/v1/categories/:id - Delete category (and subcategories)
router.delete('/:id', categoryController.deleteCategory); //checked and implemented

export default router;