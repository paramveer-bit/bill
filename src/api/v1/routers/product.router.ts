import { Router } from "express";
import {
    createProduct,
    getProducts,
    getProductById,
    updateProduct,
    getProductByCategory,
    getProductStockInfo,
    getProductsByCategoryHierarchy
} from "../controllers/product.controller.js";

const router = Router();


router.get("/", getProducts); //         // GET  /products?search=&categoryId=
router.post("/", createProduct); //       // POST /products
router.get("/grouped/category", getProductsByCategoryHierarchy); //changes 
// router.get('/hierarchy', productController.getProductsByHierarchy);

router.get("/category/:categoryId", getProductByCategory); // GET  /products/category/:categoryId
router.get("/:id", getProductById);       // GET  /products/:id
router.put("/:id", updateProduct);//        // PUT  /products/:id
router.get("/:id/stock-info", getProductStockInfo); // GET  /products/:id/stock-info
export default router;