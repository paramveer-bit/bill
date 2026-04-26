import { Router } from "express";
import {
    createCustomer,
    getCustomers,
    getCustomerById,
    updateCustomer,
    getCustomerLedger
} from "../controllers/customer.controller.js";


const router = Router();


router.post(
    "/",
    createCustomer
);
router.get(
    "/",
    getCustomers
);
router.get(
    "/:id",
    getCustomerById
);
router.put(
    "/:id",
    updateCustomer
);

router.get(
    "/:id/ledger",
    getCustomerLedger
);


export default router;