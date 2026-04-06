import { Router } from "express"

import {
    createPurchase,
    getPurchases,
    deletePurchase,
    getPurchaseById
} from "../controllers/purchaseMaster.controller.js"

const router = Router();


router.post(
    "/",
    createPurchase
);
router.get(
    "/",
    getPurchases
);
router.get(
    "/:id",
    getPurchaseById
);
router.delete(
    "/:id",
    deletePurchase
);
// router.put(
//     "/:id",
//     updatePurchase
// );

// router.post(
//     "/payments",
//     addSupplierPayment
// )

// router.get(
//     "/payments/:id",
//     getSupplierPaymentsById
// )

export default router