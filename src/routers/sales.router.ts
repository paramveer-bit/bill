import { Router } from "express"

import {
    createSale,
    getSales,
    getSaleById,
    deleteSale
} from "../controllers/salesMaster.controller.js"

const router = Router();


router.post(
    "/",
    createSale
);
router.get("/", getSales);                  // GET  /api/sales
router.get("/:id", getSaleById);            // GET  /api/sales/:id
router.delete("/:id", deleteSale);           // DELETE /api/sales/:id

export default router