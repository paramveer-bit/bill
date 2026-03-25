import { Router } from "express";
import {
    createProduct,
    getProducts,
    getProductById,
    updateProduct,
    getProductByCategory,
} from "../controllers/product.controller.js";

const router = Router();

router.get("/", getProducts);          // GET  /products?search=&categoryId=
router.post("/", createProduct);        // POST /products
router.get("/category/:categoryId", getProductByCategory); // GET  /products/category/:categoryId
router.get("/:id", getProductById);       // GET  /products/:id
router.put("/:id", updateProduct);        // PUT  /products/:id

export default router;