import { Router } from "express"

import {
    createSupplier,
    getSuppliers,
    getSupplierById,
    updateSupplier,
    addSupplierPayment,
    getSupplierPayments,
    getSupplierPaymentsById,
    updateSupplierPayment,
    getSupplierLedger,
    getSupplierBalanceSummary,
    deleteSupplierPayment
} from "../controllers/supplier.controller.js"

const router = Router();


// -------------------------------------------------
router.post("/", createSupplier);
router.get("/", getSuppliers);
router.get("/:id", getSupplierById);
router.put("/:id", updateSupplier);
// --------------------------------------------------

router.post("/:id/payments", addSupplierPayment)
router.get("/:id/payments", getSupplierPaymentsById)
router.get("/payments/getAll", getSupplierPayments)
router.put("/:id/payments/:paymentId", updateSupplierPayment)
router.delete("/:id/payments/:paymentId", deleteSupplierPayment)


router.get("/:id/ledger", getSupplierLedger);

router.get("/:id/balance-summary", getSupplierBalanceSummary);

// -----------------




export default router