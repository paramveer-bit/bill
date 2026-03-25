import { Router } from "express"

import {
    createSupplier,
    getSuppliers,
    getSupplierById,
    updateSupplier,
    addSupplierPayment,
    getSupplierPayments,
    getSupplierPaymentsById
} from "../controllers/supplier.controller.js"

const router = Router();


router.post(
    "/",
    createSupplier
);
router.get(
    "/",
    getSuppliers
);
router.get(
    "/:id",
    getSupplierById
);
router.put(
    "/:id",
    updateSupplier
);

router.post(
    "/payments",
    addSupplierPayment
)

router.get(
    "/payments/:id",
    getSupplierPaymentsById
)

export default router