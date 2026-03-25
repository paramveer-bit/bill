import { Router } from "express";
import {
    createCategory,
    getCategories,
    getCategoryById,
    updateCategory,
    deleteCategory
} from "../controllers/categories.controller.js";


const router = Router();

router.get("/", getCategories);        // GET  /categories?flat=true
router.post("/", createCategory);      // POST /categories
router.get("/:id", getCategoryById);   // GET  /categories/:id
router.put("/:id", updateCategory);    // PUT  /categories/:id
router.delete("/:id", deleteCategory); // DELETE /categories/:id



export default router;